import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppointmentConfirmationService } from '@/services/visits/AppointmentConfirmationService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { PermissionDeniedError, NotFoundError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

const COMPANY_ID = 'company-uuid';
const SITE_ID = 'site-uuid';
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
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'insert', 'update']) {
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

describe('AppointmentConfirmationService.get', () => {
  it('throws PermissionDeniedError when the user lacks view_subject_phi', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('view_subject_phi'),
    );

    await expect(
      AppointmentConfirmationService.get(SUBJECT_ID, VISIT_ID, makeCtx()),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('throws NotFoundError when the visit does not belong to the subject/company', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabaseClient({ data: null }));

    await expect(
      AppointmentConfirmationService.get(SUBJECT_ID, VISIT_ID, makeCtx()),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('AppointmentConfirmationService.logContact', () => {
  it('throws PermissionDeniedError when the user lacks edit_subject_phi', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('edit_subject_phi'),
    );

    await expect(
      AppointmentConfirmationService.logContact(
        SUBJECT_ID,
        VISIT_ID,
        { confirmation_status: 'attempted' },
        makeCtx(),
      ),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('creates a confirmation record on the first contact attempt, never touching visits.status', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const created = {
      id: 'confirmation-uuid',
      visit_id: VISIT_ID,
      confirmation_status: 'attempted',
      contact_attempt_count: 1,
    };
    const client = makeSupabaseClient(
      { data: { site_id: SITE_ID } }, // visits lookup
      { data: null }, // existing appointment_confirmations — none
      { data: created }, // appointment_confirmations insert
      { data: null }, // appointment_confirmation_log insert
      { data: null }, // subject_timeline insert
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await AppointmentConfirmationService.logContact(
      SUBJECT_ID,
      VISIT_ID,
      { confirmation_status: 'attempted', notes: 'Left a message with the front desk' },
      makeCtx(),
    );

    expect(result.contact_attempt_count).toBe(1);

    // The visits row is only ever read (to resolve site_id) — this write path
    // must never call .update() on visits, since contacting a patient must
    // never change the clinical visit status.
    const fromMock = (client as unknown as { from: ReturnType<typeof vi.fn> }).from;
    const visitsCallIndex = fromMock.mock.calls.findIndex((c) => c[0] === 'visits');
    expect(visitsCallIndex).toBeGreaterThanOrEqual(0);
    const visitsStub = fromMock.mock.results[visitsCallIndex]?.value as {
      update: ReturnType<typeof vi.fn>;
    };
    expect(visitsStub.update).not.toHaveBeenCalled();

    // Audit log must carry status/method only, never the raw contact_notes text.
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment_confirmation.contact_logged',
        record_id: 'confirmation-uuid',
      }),
    );
    for (const call of vi.mocked(AuditService.log).mock.calls) {
      const serialized = JSON.stringify(call[0]);
      expect(serialized).not.toContain('Left a message with the front desk');
    }
  });

  it('increments contact_attempt_count on an existing confirmation record', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const existing = {
      id: 'confirmation-uuid',
      visit_id: VISIT_ID,
      confirmation_status: 'attempted',
      contact_attempt_count: 2,
      contact_notes: 'Previous note',
    };
    const updated = { ...existing, confirmation_status: 'confirmed', contact_attempt_count: 3 };
    const client = makeSupabaseClient(
      { data: { site_id: SITE_ID } }, // visits lookup
      { data: existing }, // existing appointment_confirmations
      { data: updated }, // appointment_confirmations update
      { data: null }, // appointment_confirmation_log insert
      { data: null }, // subject_timeline insert
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await AppointmentConfirmationService.logContact(
      SUBJECT_ID,
      VISIT_ID,
      { confirmation_status: 'confirmed' },
      makeCtx(),
    );

    expect(result.contact_attempt_count).toBe(3);
    expect(result.confirmation_status).toBe('confirmed');
  });
});
