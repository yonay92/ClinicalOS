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
const SITE_ID = 'site-uuid';
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

function queryStub(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = Promise.resolve({ data, error, count });
  const stub: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    in: vi.fn().mockReturnThis(),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of [
    'select',
    'eq',
    'neq',
    'order',
    'limit',
    'insert',
    'update',
    'upsert',
    'delete',
    'in',
  ]) {
    (stub[key] as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  }
  return stub;
}

function makeSupabaseClient(
  ...responses: Array<{ data: unknown; error?: unknown; count?: number | null }>
) {
  const from = vi.fn();
  for (const r of responses) {
    from.mockReturnValueOnce(queryStub(r.data, r.error ?? null, r.count ?? null));
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
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: studyRow }),
    );

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
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: studyRow }),
    );
    vi.mocked(VisitTemplateService.hasApprovedTemplate).mockResolvedValue(false);

    await expect(StudyService.activateStudy(STUDY_ID, makeCtx())).rejects.toThrow(
      BusinessRuleError,
    );
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
    vi.mocked(createAdminSupabaseClient).mockReturnValue(makeSupabaseClient({ data: [] }) as never);

    const result = await StudyService.activateStudy(STUDY_ID, makeCtx());

    expect(result.status).toBe('active');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'study.activated' }),
    );
  });
});

describe('StudyService.archiveStudy', () => {
  it('returns the study unchanged when it is already archived', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const archivedStudy = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'archived',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: archivedStudy }),
    );

    const result = await StudyService.archiveStudy(STUDY_ID, makeCtx());

    expect(result.status).toBe('archived');
    expect(AuditService.log).not.toHaveBeenCalled();
  });

  it('throws BusinessRuleError when subjects are enrolled and the caller lacks force_archive_study', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(false);

    const studyRow = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'active',
    };
    const client = makeSupabaseClient(
      { data: studyRow }, // getById
      { data: null, count: 3 }, // enrolled subjects count
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(StudyService.archiveStudy(STUDY_ID, makeCtx())).rejects.toThrow(BusinessRuleError);
  });

  it('archives directly when there are no enrolled subjects', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const hasPermissionSpy = vi.spyOn(PermissionService, 'hasPermission');

    const studyRow = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'active',
    };
    const archivedStudy = { ...studyRow, status: 'archived' };
    const client = makeSupabaseClient(
      { data: studyRow }, // getById
      { data: null, count: 0 }, // enrolled subjects count
      { data: archivedStudy }, // update
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await StudyService.archiveStudy(STUDY_ID, makeCtx());

    expect(result.status).toBe('archived');
    expect(hasPermissionSpy).not.toHaveBeenCalled();
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'study.archived',
        new_value: expect.objectContaining({ enrolled_subject_count: 0, forced: false }),
      }),
    );
  });

  it('throws BusinessRuleError when the caller holds force_archive_study but gives no reason', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(true);

    const studyRow = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'active',
    };
    const client = makeSupabaseClient(
      { data: studyRow }, // getById
      { data: null, count: 2 }, // enrolled subjects count
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(StudyService.archiveStudy(STUDY_ID, makeCtx())).rejects.toThrow(BusinessRuleError);
  });

  it('archives with enrolled subjects when the caller holds force_archive_study and gives a reason', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(true);

    const studyRow = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'active',
    };
    const archivedStudy = { ...studyRow, status: 'archived' };
    const client = makeSupabaseClient(
      { data: studyRow },
      { data: null, count: 2 },
      { data: archivedStudy },
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await StudyService.archiveStudy(
      STUDY_ID,
      makeCtx(),
      'Sponsor requested early termination',
    );

    expect(result.status).toBe('archived');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'study.archived',
        new_value: expect.objectContaining({
          enrolled_subject_count: 2,
          forced: true,
          reason: 'Sponsor requested early termination',
        }),
      }),
    );
  });
});

describe('StudyService.list — archived visibility', () => {
  it('excludes archived studies by default', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const client = makeSupabaseClient({ data: [{ id: 's1', status: 'active' }] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await StudyService.list({}, makeCtx());

    const fromMock = (client as { from: ReturnType<typeof vi.fn> }).from;
    const usedStub = fromMock.mock.results[0]?.value as { neq: ReturnType<typeof vi.fn> };
    expect(usedStub.neq).toHaveBeenCalledWith('status', 'archived');
  });

  it('returns only archived studies when view=archived', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const client = makeSupabaseClient({ data: [{ id: 's1', status: 'archived' }] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await StudyService.list({ view: 'archived' }, makeCtx());

    const fromMock = (client as { from: ReturnType<typeof vi.fn> }).from;
    const usedStub = fromMock.mock.results[0]?.value as { eq: ReturnType<typeof vi.fn> };
    expect(usedStub.eq).toHaveBeenCalledWith('status', 'archived');
  });

  it('applies no archived filtering when view=all', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const client = makeSupabaseClient({ data: [] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await StudyService.list({ view: 'all' }, makeCtx());

    const fromMock = (client as { from: ReturnType<typeof vi.fn> }).from;
    const usedStub = fromMock.mock.results[0]?.value as {
      eq: ReturnType<typeof vi.fn>;
      neq: ReturnType<typeof vi.fn>;
    };
    expect(usedStub.neq).not.toHaveBeenCalled();
    expect(usedStub.eq.mock.calls.some((call: unknown[]) => call[0] === 'status')).toBe(false);
  });
});

describe('StudyService.unassignSite', () => {
  it('throws PermissionDeniedError when user lacks manage_studies', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('manage_studies'),
    );

    await expect(StudyService.unassignSite(STUDY_ID, SITE_ID, makeCtx())).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it('deletes the study_sites row and writes an audit log', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const studyRow = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'active',
    };
    const client = makeSupabaseClient(
      { data: studyRow }, // getById
      { data: null }, // study_sites delete
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await StudyService.unassignSite(STUDY_ID, SITE_ID, makeCtx());

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'study.site_unassigned',
        record_id: STUDY_ID,
        new_value: { site_id: SITE_ID },
      }),
    );
  });
});

describe('StudyService.listAssignedSites', () => {
  it('maps study_sites rows joined with sites', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const studyRow = {
      id: STUDY_ID,
      company_id: COMPANY_ID,
      study_name: 'Study A',
      status: 'active',
    };
    const rows = [
      {
        id: 'ss-1',
        status: 'active',
        site_id: SITE_ID,
        sites: { name: 'Site A', site_code: '101' },
      },
    ];
    const client = makeSupabaseClient(
      { data: studyRow }, // getById
      { data: rows }, // study_sites select
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await StudyService.listAssignedSites(STUDY_ID, makeCtx());

    expect(result).toEqual([
      { id: 'ss-1', site_id: SITE_ID, name: 'Site A', site_code: '101', status: 'active' },
    ]);
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

  it('applies the new AI-extracted profile fields (indication, enrollment, etc.) to the study', async () => {
    vi.spyOn(PermissionService, 'requireAnyPermission').mockResolvedValue(undefined);

    const extractionRow = {
      id: 'extraction-1',
      company_id: COMPANY_ID,
      study_id: STUDY_ID,
      extraction_type: 'study_profile',
      extracted_data: {
        study_name: 'Study A',
        indication: 'Type 2 Diabetes',
        estimated_enrollment: 250,
        study_duration: '52 weeks',
        study_design: 'Randomized, double-blind',
        primary_endpoint: 'Change in HbA1c from baseline',
      },
    };
    const client = makeSupabaseClient(
      { data: extractionRow }, // study_ai_extractions select
      { data: null }, // studies update
      { data: { ...extractionRow, approved: true } }, // study_ai_extractions update+select
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await StudyService.approveAIExtraction('extraction-1', makeCtx(), STUDY_ID);

    const fromMock = (client as { from: ReturnType<typeof vi.fn> }).from;
    const studiesUpdateStub = fromMock.mock.results[1]?.value as {
      update: ReturnType<typeof vi.fn>;
    };
    expect(studiesUpdateStub.update).toHaveBeenCalledWith(
      expect.objectContaining({
        indication: 'Type 2 Diabetes',
        estimated_enrollment: 250,
        study_duration: '52 weeks',
        study_design: 'Randomized, double-blind',
        primary_endpoint: 'Change in HbA1c from baseline',
      }),
    );
  });
});
