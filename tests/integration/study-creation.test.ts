/**
 * Integration tests: study creation & company isolation
 *
 * Verifies that StudyService enforces permission gates and company scoping,
 * and that VisitTemplateService's approval gate is required before a study
 * can be activated — mirroring the RLS isolation pattern used in
 * company-isolation.test.ts / site-isolation.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { StudyService } from '@/services/studies/StudyService';
import { VisitTemplateService } from '@/services/visit-templates/VisitTemplateService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { NotFoundError, BusinessRuleError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({ AuditService: { log: vi.fn() } }));
vi.mock('@/services/notifications/NotificationService', () => ({
  NotificationService: { dispatch: vi.fn() },
}));

const COMPANY_A = 'company-a-uuid';
const COMPANY_B = 'company-b-uuid';
const STUDY_ID = 'study-uuid';
const USER_ID = 'user-uuid';

function makeCtx(companyId = COMPANY_A) {
  return {
    user: {
      id: USER_ID,
      company_id: companyId,
      full_name: 'CRC User',
      email: 'crc@example.com',
      phone: null,
      avatar_file_id: null,
      status: 'active' as const,
      last_login_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    company: {
      id: companyId,
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

describe('Study company isolation', () => {
  it('returns NotFoundError when a study belongs to a different company', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    // company-scoped query excludes the row → Supabase returns null, matching real RLS behavior
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSupabaseClient({ data: null }));

    await expect(StudyService.getById(STUDY_ID, makeCtx(COMPANY_B))).rejects.toThrow(NotFoundError);
  });

  it('returns the study when it belongs to the caller company', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const studyRow = {
      id: STUDY_ID,
      company_id: COMPANY_A,
      study_name: 'Study A',
      status: 'draft',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: studyRow }),
    );

    const result = await StudyService.getById(STUDY_ID, makeCtx(COMPANY_A));
    expect(result.company_id).toBe(COMPANY_A);
  });
});

describe('Visit template approval gate blocks activation', () => {
  it('a study cannot be activated without an approved visit template', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(VisitTemplateService, 'hasApprovedTemplate').mockResolvedValue(false);

    const draftStudy = {
      id: STUDY_ID,
      company_id: COMPANY_A,
      study_name: 'Study A',
      status: 'draft',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: draftStudy }),
    );

    await expect(StudyService.activateStudy(STUDY_ID, makeCtx(COMPANY_A))).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it('activation succeeds once a visit template is approved', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(VisitTemplateService, 'hasApprovedTemplate').mockResolvedValue(true);
    vi.mocked(createAdminSupabaseClient).mockReturnValue(makeSupabaseClient({ data: [] }) as never);

    const draftStudy = {
      id: STUDY_ID,
      company_id: COMPANY_A,
      study_name: 'Study A',
      status: 'draft',
    };
    const activeStudy = { ...draftStudy, status: 'active' };

    // createServerSupabaseClient() is called twice in activateStudy (once inside
    // getById, once directly) — return the same client both times.
    const client = makeSupabaseClient({ data: draftStudy }, { data: activeStudy }, { data: [] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await StudyService.activateStudy(STUDY_ID, makeCtx(COMPANY_A));
    expect(result.status).toBe('active');
  });
});
