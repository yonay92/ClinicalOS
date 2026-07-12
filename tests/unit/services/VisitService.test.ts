import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { VisitService } from '@/services/visits/VisitService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { PermissionDeniedError, BusinessRuleError, NotFoundError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

const COMPANY_ID = 'company-uuid';
const SITE_ID = 'site-uuid';
const STUDY_ID = 'study-uuid';
const SUBJECT_ID = 'subject-uuid';
const VISIT_ID = 'visit-uuid';
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
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'gte', 'lte', 'order', 'insert', 'update']) {
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

function makeVisit(overrides: Record<string, unknown> = {}) {
  return {
    id: VISIT_ID,
    company_id: COMPANY_ID,
    site_id: SITE_ID,
    study_id: STUDY_ID,
    subject_id: SUBJECT_ID,
    visit_template_item_id: null,
    visit_name: 'Week 4',
    visit_type: 'scheduled',
    target_date: '2026-02-01',
    scheduled_date: null,
    window_start: '2026-01-25',
    window_end: '2026-02-08',
    status: 'scheduled',
    created_by: USER_ID,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VisitService.confirmVisit', () => {
  it('throws PermissionDeniedError when user lacks manage_visits', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('manage_visits'),
    );

    await expect(VisitService.confirmVisit(SUBJECT_ID, VISIT_ID, makeCtx())).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it('throws NotFoundError when the visit does not exist', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabaseClient({ data: null }));

    await expect(VisitService.confirmVisit(SUBJECT_ID, VISIT_ID, makeCtx())).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws BusinessRuleError when the visit is not Scheduled', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: makeVisit({ status: 'confirmed' }) }),
    );

    await expect(VisitService.confirmVisit(SUBJECT_ID, VISIT_ID, makeCtx())).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it('confirms a Scheduled visit and writes visit_history/timeline/audit', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const visit = makeVisit({ status: 'scheduled' });
    const updated = { ...visit, status: 'confirmed' };
    const client = makeSupabaseClient(
      { data: visit }, // getVisitOrThrow
      { data: updated }, // visits update
      { data: null }, // visit_history insert
      { data: null }, // subject_timeline insert
      { data: null }, // calendar_events update
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await VisitService.confirmVisit(SUBJECT_ID, VISIT_ID, makeCtx());

    expect(result.status).toBe('confirmed');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'visit.confirmed', record_id: VISIT_ID }),
    );
  });
});

describe('VisitService.startVisit', () => {
  it('throws BusinessRuleError when the visit is not Confirmed', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: makeVisit({ status: 'scheduled' }) }),
    );

    await expect(VisitService.startVisit(SUBJECT_ID, VISIT_ID, makeCtx())).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it('starts a Confirmed visit and writes visit_history/timeline/audit', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const visit = makeVisit({ status: 'confirmed' });
    const updated = { ...visit, status: 'in_progress' };
    const client = makeSupabaseClient(
      { data: visit }, // getVisitOrThrow
      { data: updated }, // visits update
      { data: null }, // visit_history insert
      { data: null }, // subject_timeline insert
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await VisitService.startVisit(SUBJECT_ID, VISIT_ID, makeCtx());

    expect(result.status).toBe('in_progress');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'visit.started', record_id: VISIT_ID }),
    );
  });
});

describe('VisitService.rescheduleVisit', () => {
  const RESCHEDULE_INPUT = { target_date: '2026-03-01', reason: 'Patient requested a later date' };

  it('throws BusinessRuleError when the visit is not Scheduled or Confirmed', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: makeVisit({ status: 'in_progress' }) }),
    );

    await expect(
      VisitService.rescheduleVisit(SUBJECT_ID, VISIT_ID, RESCHEDULE_INPUT, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('reschedules a Scheduled visit without changing its status, and logs a visit_notes reason', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const visit = makeVisit({ status: 'scheduled', visit_template_item_id: null });
    const updated = { ...visit, target_date: RESCHEDULE_INPUT.target_date };
    const client = makeSupabaseClient(
      { data: visit }, // getVisitOrThrow
      { data: updated }, // visits update
      { data: null }, // visit_notes insert
      { data: null }, // subject_timeline insert
      { data: null }, // calendar_events update
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await VisitService.rescheduleVisit(
      SUBJECT_ID,
      VISIT_ID,
      RESCHEDULE_INPUT,
      makeCtx(),
    );

    // Status is untouched — reschedule never transitions visits.status.
    expect(result.target_date).toBe(RESCHEDULE_INPUT.target_date);
    const fromMock = (client as unknown as { from: ReturnType<typeof vi.fn> }).from;
    const visitsUpdateStub = fromMock.mock.results[1]?.value as {
      update: ReturnType<typeof vi.fn>;
    };
    const updateArg = (visitsUpdateStub.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg).not.toHaveProperty('status');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'visit.rescheduled', record_id: VISIT_ID }),
    );
  });
});

describe('VisitService.cancelVisit', () => {
  const CANCEL_INPUT = { reason: 'Subject withdrew consent' };

  it('throws BusinessRuleError when the visit is already Completed', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: makeVisit({ status: 'completed' }) }),
    );

    await expect(
      VisitService.cancelVisit(SUBJECT_ID, VISIT_ID, CANCEL_INPUT, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('cancels an In Progress visit, never deleting the row, and writes visit_history/timeline/audit', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const visit = makeVisit({ status: 'in_progress' });
    const updated = { ...visit, status: 'cancelled' };
    const client = makeSupabaseClient(
      { data: visit }, // getVisitOrThrow
      { data: updated }, // visits update
      { data: null }, // visit_history insert
      { data: null }, // subject_timeline insert
      { data: null }, // calendar_events update
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await VisitService.cancelVisit(SUBJECT_ID, VISIT_ID, CANCEL_INPUT, makeCtx());

    expect(result.status).toBe('cancelled');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'visit.cancelled', record_id: VISIT_ID }),
    );
  });
});

describe('VisitService.reopenVisit', () => {
  const REOPEN_INPUT = { reason: 'Data entry error — visit was not actually completed' };

  it('throws BusinessRuleError when the visit is not Completed', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: makeVisit({ status: 'in_progress' }) }),
    );

    await expect(
      VisitService.reopenVisit(SUBJECT_ID, VISIT_ID, REOPEN_INPUT, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError when the caller lacks reopen_visit, even with a reason', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: makeVisit({ status: 'completed' }) }),
    );
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(false);

    await expect(
      VisitService.reopenVisit(SUBJECT_ID, VISIT_ID, REOPEN_INPUT, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError when the caller has reopen_visit but no reason', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: makeVisit({ status: 'completed' }) }),
    );
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(true);

    await expect(
      VisitService.reopenVisit(SUBJECT_ID, VISIT_ID, { reason: '' }, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('reopens a Completed visit back to In Progress when permitted, writing visit_history/timeline/audit', async () => {
    const visit = makeVisit({ status: 'completed' });
    const updated = { ...visit, status: 'in_progress' };
    const client = makeSupabaseClient(
      { data: visit }, // getVisitOrThrow
      { data: updated }, // visits update
      { data: null }, // visit_history insert
      { data: null }, // subject_timeline insert
      { data: null }, // calendar_events update
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(true);

    const result = await VisitService.reopenVisit(SUBJECT_ID, VISIT_ID, REOPEN_INPUT, makeCtx());

    expect(result.status).toBe('in_progress');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'visit.reopened', record_id: VISIT_ID }),
    );
  });
});

describe('VisitService.createCalendarEventsForVisits', () => {
  it('does nothing when given no visits', async () => {
    await VisitService.createCalendarEventsForVisits([], makeCtx());
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('skips visits with no target_date (nothing to schedule) and inserts only the rest', async () => {
    const client = makeSupabaseClient({ data: null }); // calendar_events insert
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const visits = [
      makeVisit({ id: 'v1', target_date: null }),
      makeVisit({ id: 'v2', target_date: '2026-02-01' }),
    ] as never;

    await VisitService.createCalendarEventsForVisits(visits, makeCtx());

    const fromMock = (client as unknown as { from: ReturnType<typeof vi.fn> }).from;
    const insertStub = fromMock.mock.results[0]?.value as { insert: ReturnType<typeof vi.fn> };
    const insertedRows = (insertStub.insert as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Array<{
      related_record_id: string;
    }>;
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.related_record_id).toBe('v2');
  });
});

describe('VisitService.listCalendarEvents', () => {
  it('throws PermissionDeniedError when user lacks view_visits', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('view_visits'),
    );

    await expect(
      VisitService.listCalendarEvents({ start: '2026-02-01', end: '2026-02-28' }, makeCtx()),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('filters by the given date range and optional site_id', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const rows = [{ id: 'event-1' }];
    const client = makeSupabaseClient({ data: rows });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await VisitService.listCalendarEvents(
      { start: '2026-02-01', end: '2026-02-28', site_id: SITE_ID },
      makeCtx(),
    );

    expect(result).toEqual(rows);
    const fromMock = (client as unknown as { from: ReturnType<typeof vi.fn> }).from;
    const stub = fromMock.mock.results[0]?.value as { eq: ReturnType<typeof vi.fn> };
    expect(stub.eq).toHaveBeenCalledWith('site_id', SITE_ID);
  });
});
