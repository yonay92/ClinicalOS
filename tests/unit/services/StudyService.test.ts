import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { StudyService } from '@/services/studies/StudyService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { VisitTemplateService } from '@/services/visit-templates/VisitTemplateService';
import { AuditService } from '@/services/audit/AuditService';
import { NotificationService } from '@/services/notifications/NotificationService';
import { PermissionDeniedError, BusinessRuleError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

vi.mock('@/services/notifications/NotificationService', () => ({
  NotificationService: { dispatch: vi.fn() },
}));

vi.mock('@/services/visit-templates/VisitTemplateService', () => ({
  VisitTemplateService: {
    hasApprovedTemplate: vi.fn(),
    createTemplate: vi.fn(),
  },
}));

const COMPANY_ID = 'company-uuid';
const STUDY_ID = 'study-uuid';
const USER_ID = 'user-uuid';

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
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    in: vi.fn().mockReturnThis(),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'in']) {
    (stub[key] as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  }
  return stub;
}

function makeSupabaseClient(...responses: Array<{ data: unknown; error?: unknown }>) {
  const from = vi.fn();
  for (const r of responses) {
    from.mockReturnValueOnce(queryStub(r.data, r.error ?? null));
  }
  return { from } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StudyService.create', () => {
  it('throws PermissionDeniedError when user lacks create_study', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('create_study'),
    );

    await expect(StudyService.create({ study_name: 'Study A' }, makeCtx())).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it('creates a study and writes an audit log when permitted', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const studyRow = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'draft',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSupabaseClient({ data: studyRow }));

    const result = await StudyService.create({ study_name: 'Study A' }, makeCtx());

    expect(result.id).toBe(STUDY_ID);
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'study.created', record_id: STUDY_ID }),
    );
  });
});

describe('StudyService.activateStudy', () => {
  it('throws BusinessRuleError when no approved visit template exists', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const studyRow = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'draft',
    };
    // getById() query
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSupabaseClient({ data: studyRow }));
    vi.mocked(VisitTemplateService.hasApprovedTemplate).mockResolvedValue(false);

    await expect(StudyService.activateStudy(STUDY_ID, makeCtx())).rejects.toThrow(BusinessRuleError);
  });

  it('activates the study once an approved visit template exists', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const draftStudy = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'draft',
    };
    const activatedStudy = { ...draftStudy, status: 'active' };

    // createServerSupabaseClient() is called twice in activateStudy (once inside
    // getById, once directly) — return the same client both times so its queued
    // .from() responses (1: getById study, 2: update to active, 3: document_types) resolve in order.
    const client = makeSupabaseClient({ data: draftStudy }, { data: activatedStudy }, { data: [] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);
    vi.mocked(VisitTemplateService.hasApprovedTemplate).mockResolvedValue(true);
    vi.mocked(createAdminSupabaseClient).mockReturnValue(
      makeSupabaseClient({ data: [] }) as never,
    );

    const result = await StudyService.activateStudy(STUDY_ID, makeCtx());

    expect(result.status).toBe('active');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'study.activated' }),
    );
  });
});

describe('StudyService.approveAIExtraction', () => {
  it('throws NotFoundError-compatible error when extraction belongs to a different study', async () => {
    vi.spyOn(PermissionService, 'requireAnyPermission').mockResolvedValue(undefined);

    const extractionRow = {
      id: 'extraction-1',
      company_id: COMPANY_ID,
      study_id: 'other-study',
      extraction_type: 'study_profile',
      extracted_data: {},
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: extractionRow }),
    );

    await expect(
      StudyService.approveAIExtraction('extraction-1', makeCtx(), STUDY_ID),
    ).rejects.toThrow('AI extraction');
  });
});
