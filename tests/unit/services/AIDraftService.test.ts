import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AIDraftService } from '@/services/studies/AIDraftService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { VisitTemplateService } from '@/services/visit-templates/VisitTemplateService';
import { AuditService } from '@/services/audit/AuditService';
import { PermissionDeniedError, NotFoundError, BusinessRuleError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

vi.mock('@/services/visit-templates/VisitTemplateService', () => ({
  VisitTemplateService: {
    createTemplate: vi.fn(),
  },
}));

const COMPANY_ID = 'company-uuid';
const USER_ID = 'user-uuid';
const DRAFT_ID = 'draft-uuid';
const FILE_ID = 'file-uuid';
const STUDY_ID = 'study-uuid';

function makeCtx() {
  return {
    user: {
      id: USER_ID,
      company_id: COMPANY_ID,
      full_name: 'Admin User',
      email: 'admin@example.com',
      phone: null,
      avatar_file_id: null,
      status: 'active' as const,
      last_login_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    company: {
      id: COMPANY_ID,
      name: 'Test Company',
      legal_name: null,
      status: 'active' as const,
      subscription_plan: null,
      timezone: 'UTC',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

function queryStub(data: unknown, error: unknown = null) {
  const resolved = Promise.resolve({ data, error });
  const stub: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'insert', 'update', 'delete']) {
    (stub[key] as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  }
  return stub;
}

function makeClient(
  responses: Array<{ data: unknown; error?: unknown }>,
  options: {
    uploadError?: { message: string } | null;
    invokeError?: { message: string } | null;
  } = {},
) {
  const from = vi.fn();
  for (const r of responses) {
    from.mockReturnValueOnce(queryStub(r.data, r.error ?? null));
  }
  return {
    from,
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: options.uploadError ?? null }),
      }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: {}, error: options.invokeError ?? null }),
    },
  } as never;
}

function makeFile(): File {
  return new File(['%PDF-1.4'], 'protocol.pdf', { type: 'application/pdf' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AIDraftService.createDraft', () => {
  it('throws PermissionDeniedError when user lacks create_study', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('create_study'),
    );

    await expect(AIDraftService.createDraft(makeFile(), makeCtx())).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it('creates a processing draft, runs extraction, and returns the ready draft', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const fileRow = { id: FILE_ID };
    const draftRowProcessing = {
      id: DRAFT_ID,
      company_id: COMPANY_ID,
      file_id: FILE_ID,
      status: 'processing',
      confidence: null,
      uncertain_fields: [],
      extracted_profile: {},
      extracted_visit_items: [],
      extracted_extra: {},
      error_message: null,
      study_id: null,
      created_by: USER_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const draftRowReady = { ...draftRowProcessing, status: 'ready', confidence: 0.9 };

    const client = makeClient([
      { data: fileRow }, // files insert
      { data: draftRowProcessing }, // study_drafts insert
      { data: draftRowReady }, // getDraft() re-fetch at the end
    ]);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await AIDraftService.createDraft(makeFile(), makeCtx());

    expect(result.status).toBe('ready');
    expect(
      (client as unknown as { functions: { invoke: ReturnType<typeof vi.fn> } }).functions.invoke,
    ).toHaveBeenCalledWith('protocol-ai', { body: { file_id: FILE_ID, draft_id: DRAFT_ID } });
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'study.ai_draft_created', record_id: DRAFT_ID }),
    );
  });

  it('marks the draft failed when the protocol-ai invocation errors', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const fileRow = { id: FILE_ID };
    const draftRowProcessing = {
      id: DRAFT_ID,
      company_id: COMPANY_ID,
      file_id: FILE_ID,
      status: 'processing',
      confidence: null,
      uncertain_fields: [],
      extracted_profile: {},
      extracted_visit_items: [],
      extracted_extra: {},
      error_message: null,
      study_id: null,
      created_by: USER_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const draftRowFailed = {
      ...draftRowProcessing,
      status: 'failed',
      error_message: 'boom',
    };

    const client = makeClient(
      [
        { data: fileRow }, // files insert
        { data: draftRowProcessing }, // study_drafts insert
        { data: null }, // study_drafts update (mark failed)
        { data: draftRowFailed }, // getDraft() re-fetch at the end
      ],
      { invokeError: { message: 'boom' } },
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await AIDraftService.createDraft(makeFile(), makeCtx());

    expect(result.status).toBe('failed');
    expect(result.error_message).toBe('boom');
  });
});

describe('AIDraftService.getDraft', () => {
  it('throws NotFoundError when the draft is missing or belongs to another company', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeClient([{ data: null }]));

    await expect(AIDraftService.getDraft(DRAFT_ID, makeCtx())).rejects.toThrow(NotFoundError);
  });
});

describe('AIDraftService.finalizeDraft', () => {
  function readyDraft(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: DRAFT_ID,
      company_id: COMPANY_ID,
      file_id: FILE_ID,
      status: 'ready',
      confidence: 0.9,
      uncertain_fields: [],
      extracted_profile: {},
      extracted_visit_items: [],
      extracted_extra: {},
      error_message: null,
      study_id: null,
      created_by: USER_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('throws BusinessRuleError when the draft is already finalized', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeClient([{ data: readyDraft({ status: 'finalized', study_id: STUDY_ID }) }]);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      AIDraftService.finalizeDraft(DRAFT_ID, { study_name: 'Study A' }, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rejects a bad baseline count before creating anything', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeClient([{ data: readyDraft() }]);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      AIDraftService.finalizeDraft(
        DRAFT_ID,
        {
          study_name: 'Study A',
          visit_template_items: [
            { visit_name: 'Screening', visit_order: 1, is_baseline: false },
            { visit_name: 'Visit 2', visit_order: 2, is_baseline: false },
          ],
        },
        makeCtx(),
      ),
    ).rejects.toThrow(BusinessRuleError);

    // Only the initial draft fetch should have touched the client — no study was created.
    expect((client as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledTimes(1);
  });

  it('creates the study, visit template, and protocol document, then marks the draft finalized', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(VisitTemplateService.createTemplate).mockResolvedValue({} as never);

    const studyRow = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'draft',
    };

    const client = makeClient([
      { data: readyDraft() }, // getDraft()
      { data: studyRow }, // studies insert
      { data: null }, // study_documents insert
      { data: null }, // study_drafts update -> finalized
    ]);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await AIDraftService.finalizeDraft(
      DRAFT_ID,
      {
        study_name: 'Study A',
        visit_template_items: [{ visit_name: 'Screening', visit_order: 1, is_baseline: true }],
      },
      makeCtx(),
    );

    expect(result.id).toBe(STUDY_ID);
    expect(VisitTemplateService.createTemplate).toHaveBeenCalledWith(
      STUDY_ID,
      [{ visit_name: 'Screening', visit_order: 1, is_baseline: true }],
      expect.anything(),
      'ai_generated',
    );
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'study.ai_draft_finalized', record_id: STUDY_ID }),
    );
  });
});

describe('AIDraftService.deleteDraft', () => {
  it('throws BusinessRuleError when the draft is already finalized', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeClient([
      {
        data: {
          id: DRAFT_ID,
          company_id: COMPANY_ID,
          file_id: FILE_ID,
          status: 'finalized',
          confidence: null,
          uncertain_fields: [],
          extracted_profile: {},
          extracted_visit_items: [],
          extracted_extra: {},
          error_message: null,
          study_id: STUDY_ID,
          created_by: USER_ID,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    ]);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(AIDraftService.deleteDraft(DRAFT_ID, makeCtx())).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it('deletes the row and writes an audit log', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeClient([
      {
        data: {
          id: DRAFT_ID,
          company_id: COMPANY_ID,
          file_id: FILE_ID,
          status: 'ready',
          confidence: 0.9,
          uncertain_fields: [],
          extracted_profile: {},
          extracted_visit_items: [],
          extracted_extra: {},
          error_message: null,
          study_id: null,
          created_by: USER_ID,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
      { data: null }, // delete
    ]);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await AIDraftService.deleteDraft(DRAFT_ID, makeCtx());

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'study.ai_draft_discarded', record_id: DRAFT_ID }),
    );
  });
});
