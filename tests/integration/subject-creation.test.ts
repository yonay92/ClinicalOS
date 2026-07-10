/**
 * Integration tests: subject creation & company isolation
 *
 * Verifies that SubjectService enforces permission gates, company scoping, and
 * the GAP-REQ-03 approved-visit-template gate before a subject can be created —
 * mirroring the RLS isolation pattern used in company-isolation.test.ts and
 * tests/integration/study-creation.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SubjectService } from '@/services/subjects/SubjectService';
import { VisitTemplateService } from '@/services/visit-templates/VisitTemplateService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { NotFoundError, BusinessRuleError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({ AuditService: { log: vi.fn() } }));
vi.mock('@/services/notifications/NotificationService', () => ({
  NotificationService: { dispatch: vi.fn() },
}));
vi.mock('@/services/visit-templates/VisitTemplateService', () => ({
  VisitTemplateService: { hasApprovedTemplate: vi.fn() },
}));

const COMPANY_A = 'company-a-uuid';
const COMPANY_B = 'company-b-uuid';
const STUDY_ID = 'study-uuid';
const SITE_ID = 'site-uuid';
const SUBJECT_ID = 'subject-uuid';
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
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
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

describe('Subject company isolation', () => {
  it('returns NotFoundError when a subject belongs to a different company', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    // company-scoped query excludes the row -> Supabase returns null, matching real RLS behavior
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSupabaseClient({ data: null }));

    await expect(SubjectService.getById(SUBJECT_ID, makeCtx(COMPANY_B))).rejects.toThrow(
      NotFoundError,
    );
  });

  it('returns the subject when it belongs to the caller company', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_A,
      site_id: SITE_ID,
      study_id: STUDY_ID,
      subject_number: '001-001',
      status: 'pre_screening',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: subjectRow }),
    );

    const result = await SubjectService.getById(SUBJECT_ID, makeCtx(COMPANY_A));
    expect(result.company_id).toBe(COMPANY_A);
  });
});

describe('Approved visit template gate blocks subject creation (GAP-REQ-03)', () => {
  const input = { site_id: SITE_ID, study_id: STUDY_ID, subject_number: '001-001' };

  it('a subject cannot be created when the study has no approved visit template', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);
    vi.spyOn(VisitTemplateService, 'hasApprovedTemplate').mockResolvedValue(false);

    const activeStudy = { id: STUDY_ID, status: 'active' };
    const studySite = { id: 'study-site-uuid' };
    const client = makeSupabaseClient({ data: activeStudy }, { data: studySite });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(SubjectService.create(input, makeCtx(COMPANY_A))).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it('creation succeeds once the study has an approved visit template', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);
    vi.spyOn(VisitTemplateService, 'hasApprovedTemplate').mockResolvedValue(true);

    const activeStudy = { id: STUDY_ID, status: 'active' };
    const studySite = { id: 'study-site-uuid' };
    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_A,
      site_id: SITE_ID,
      study_id: STUDY_ID,
      subject_number: '001-001',
      status: 'pre_screening',
      baseline_date: null,
    };
    const template = { id: 'template-uuid' };
    const baselineItem = {
      id: 'item-baseline-uuid',
      template_id: 'template-uuid',
      visit_name: 'Baseline',
      visit_order: 1,
      offset_days: 0,
      window_before: 0,
      window_after: 0,
      visit_type: 'scheduled',
      is_required: true,
      is_baseline: true,
    };

    const client = makeSupabaseClient(
      { data: activeStudy },
      { data: studySite },
      { data: subjectRow },
      { data: null }, // subject_timeline insert (subject_created)
      { data: template }, // visit_templates lookup
      { data: [baselineItem] }, // visit_template_items (all, ordered)
      { data: null }, // visits insert (Baseline placeholder)
      { data: null }, // subject_timeline insert (baseline_visit_scheduled)
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SubjectService.create(input, makeCtx(COMPANY_A));
    expect(result.id).toBe(SUBJECT_ID);
  });
});
