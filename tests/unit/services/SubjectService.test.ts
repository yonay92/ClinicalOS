import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SubjectService } from '@/services/subjects/SubjectService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { VisitTemplateService } from '@/services/visit-templates/VisitTemplateService';
import { AuditService } from '@/services/audit/AuditService';
import { NotificationService } from '@/services/notifications/NotificationService';
import { PermissionDeniedError, BusinessRuleError, NotFoundError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

vi.mock('@/services/notifications/NotificationService', () => ({
  NotificationService: { dispatch: vi.fn() },
}));

vi.mock('@/services/visit-templates/VisitTemplateService', () => ({
  VisitTemplateService: {
    hasApprovedTemplate: vi.fn(),
  },
}));

const COMPANY_ID = 'company-uuid';
const STUDY_ID = 'study-uuid';
const SITE_ID = 'site-uuid';
const SUBJECT_ID = 'subject-uuid';
const USER_ID = 'user-uuid';

function makeCtx() {
  return {
    user: {
      id: USER_ID,
      company_id: COMPANY_ID,
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

describe('SubjectService.create', () => {
  const input = { site_id: SITE_ID, study_id: STUDY_ID, subject_number: '001-001' };

  it('throws PermissionDeniedError when user lacks create_subject', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('create_subject'),
    );

    await expect(SubjectService.create(input, makeCtx())).rejects.toThrow(PermissionDeniedError);
  });

  it('throws BusinessRuleError when the study is not active', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);

    const draftStudy = { id: STUDY_ID, status: 'draft' };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: draftStudy }),
    );

    await expect(SubjectService.create(input, makeCtx())).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError when the site is not assigned to the study', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);

    const activeStudy = { id: STUDY_ID, status: 'active' };
    const client = makeSupabaseClient({ data: activeStudy }, { data: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(SubjectService.create(input, makeCtx())).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError when the study has no approved visit template (GAP-REQ-03)', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);
    vi.mocked(VisitTemplateService.hasApprovedTemplate).mockResolvedValue(false);

    const activeStudy = { id: STUDY_ID, status: 'active' };
    const studySite = { id: 'study-site-uuid' };
    const client = makeSupabaseClient({ data: activeStudy }, { data: studySite });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(SubjectService.create(input, makeCtx())).rejects.toThrow(BusinessRuleError);
  });

  it('creates the subject and writes an audit log + timeline event when permitted', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);
    vi.mocked(VisitTemplateService.hasApprovedTemplate).mockResolvedValue(true);

    const activeStudy = { id: STUDY_ID, status: 'active' };
    const studySite = { id: 'study-site-uuid' };
    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
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
      { data: activeStudy }, // studies lookup
      { data: studySite }, // study_sites lookup
      { data: subjectRow }, // subjects insert
      { data: null }, // subject_timeline insert (subject_created)
      { data: template }, // visit_templates lookup (baseline placeholder)
      { data: baselineItem }, // visit_template_items lookup (is_baseline = true)
      { data: null }, // visits insert (Baseline placeholder)
      { data: null }, // subject_timeline insert (baseline_visit_scheduled)
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SubjectService.create(input, makeCtx());

    expect(result.id).toBe(SUBJECT_ID);
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subject.created', record_id: SUBJECT_ID }),
    );
  });
});

describe('SubjectService.completeBaselineVisit', () => {
  const BASELINE_DATE = '2026-01-15';

  function makeBaselineItem() {
    return {
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
  }

  it('throws BusinessRuleError when the baseline visit was already completed', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      study_id: STUDY_ID,
      subject_number: '001-001',
      status: 'screening',
      baseline_date: '2026-01-01',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: subjectRow }),
    );

    await expect(
      SubjectService.completeBaselineVisit(SUBJECT_ID, { baseline_date: BASELINE_DATE }, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError when the approved template has no Baseline item configured', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      study_id: STUDY_ID,
      subject_number: '001-001',
      status: 'screening',
      baseline_date: null,
    };
    const client = makeSupabaseClient(
      { data: subjectRow }, // getById
      { data: { id: 'template-uuid' } }, // visit_templates lookup
      { data: null }, // visit_template_items lookup (no is_baseline item)
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      SubjectService.completeBaselineVisit(SUBJECT_ID, { baseline_date: BASELINE_DATE }, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('throws NotFoundError when the subject has no placeholder Baseline visit', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      study_id: STUDY_ID,
      subject_number: '001-001',
      status: 'screening',
      baseline_date: null,
    };
    const client = makeSupabaseClient(
      { data: subjectRow }, // getById
      { data: { id: 'template-uuid' } }, // visit_templates lookup
      { data: makeBaselineItem() }, // visit_template_items lookup
      { data: null }, // visits lookup (no placeholder found)
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      SubjectService.completeBaselineVisit(SUBJECT_ID, { baseline_date: BASELINE_DATE }, makeCtx()),
    ).rejects.toThrow(NotFoundError);
  });

  it('completes the Baseline visit, records baseline_date, and generates the rest of the schedule', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      study_id: STUDY_ID,
      subject_number: '001-001',
      status: 'screening',
      baseline_date: null,
    };
    const updatedSubjectRow = { ...subjectRow, baseline_date: BASELINE_DATE };

    const client = makeSupabaseClient(
      { data: subjectRow }, // getById
      { data: { id: 'template-uuid' } }, // visit_templates lookup
      { data: makeBaselineItem() }, // visit_template_items lookup
      { data: { id: 'visit-uuid' } }, // visits lookup (placeholder found)
      { data: null }, // visits update (mark completed)
      { data: updatedSubjectRow }, // subjects update (baseline_date)
      { data: null }, // subject_timeline insert (baseline_visit_completed)
      { data: null }, // generateVisitSchedule: visit_templates lookup -> none, short-circuits
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SubjectService.completeBaselineVisit(
      SUBJECT_ID,
      { baseline_date: BASELINE_DATE },
      makeCtx(),
    );

    expect(result.baseline_date).toBe(BASELINE_DATE);
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subject.baseline_completed', record_id: SUBJECT_ID }),
    );
  });
});

describe('SubjectService.randomize', () => {
  const RANDOMIZATION_INPUT = { randomization_number: 'R-0001', randomization_date: '2026-02-01' };

  it('throws BusinessRuleError when the subject was already randomized', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      subject_number: '001-001',
      status: 'randomized',
      randomization_date: '2026-01-01',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: subjectRow }),
    );

    await expect(
      SubjectService.randomize(SUBJECT_ID, RANDOMIZATION_INPUT, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError when the subject status does not allow randomization', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      subject_number: '001-001',
      status: 'active',
      randomization_date: null,
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: subjectRow }),
    );

    await expect(
      SubjectService.randomize(SUBJECT_ID, RANDOMIZATION_INPUT, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('records randomization, changes status, and notifies pi/crc', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      subject_number: '001-001',
      status: 'screening',
      randomization_date: null,
    };
    const updatedRow = {
      ...subjectRow,
      status: 'randomized',
      randomization_number: RANDOMIZATION_INPUT.randomization_number,
      randomization_date: RANDOMIZATION_INPUT.randomization_date,
    };

    const client = makeSupabaseClient(
      { data: subjectRow }, // getById
      { data: updatedRow }, // subjects update
      { data: null }, // subject_status_history insert
      { data: null }, // subject_timeline insert
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SubjectService.randomize(SUBJECT_ID, RANDOMIZATION_INPUT, makeCtx());

    expect(result.status).toBe('randomized');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subject.randomized', record_id: SUBJECT_ID }),
    );
    expect(NotificationService.dispatch).toHaveBeenCalledTimes(2);
  });
});

describe('SubjectService.updateStatus', () => {
  it('throws BusinessRuleError for a transition that skips the forward flow', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      subject_number: '001-001',
      status: 'pre_screening',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: subjectRow }),
    );

    await expect(SubjectService.updateStatus(SUBJECT_ID, 'active', makeCtx())).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it('throws BusinessRuleError when changing status from a terminal state', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      subject_number: '001-001',
      status: 'completed',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: subjectRow }),
    );

    await expect(SubjectService.updateStatus(SUBJECT_ID, 'active', makeCtx())).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it('writes status_history, timeline, audit log, and dispatches notifications on a valid transition', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      subject_number: '001-001',
      status: 'pre_screening',
    };
    const updatedRow = { ...subjectRow, status: 'screening' };

    const client = makeSupabaseClient(
      { data: subjectRow }, // getById
      { data: updatedRow }, // subjects update
      { data: null }, // subject_status_history insert
      { data: null }, // subject_timeline insert
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SubjectService.updateStatus(SUBJECT_ID, 'screening', makeCtx());

    expect(result.status).toBe('screening');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subject.status_changed', record_id: SUBJECT_ID }),
    );
    expect(NotificationService.dispatch).toHaveBeenCalledTimes(2);
  });

  it('closes remaining scheduled visits when the subject is marked completed', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const subjectRow = {
      id: SUBJECT_ID,
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      subject_number: '001-001',
      status: 'active',
    };
    const completedRow = { ...subjectRow, status: 'completed' };

    const client = makeSupabaseClient(
      { data: subjectRow }, // getById
      { data: completedRow }, // subjects update
      { data: null }, // subject_status_history insert
      { data: null }, // subject_timeline insert
      { data: null }, // visits update (closeRemainingVisits)
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SubjectService.updateStatus(SUBJECT_ID, 'completed', makeCtx());

    expect(result.status).toBe('completed');
  });
});
