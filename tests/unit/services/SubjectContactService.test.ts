import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SubjectContactService } from '@/services/subjects/SubjectContactService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { PermissionDeniedError, NotFoundError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

const COMPANY_ID = 'company-uuid';
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
    is: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'is', 'insert', 'update']) {
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

const CONTACT_INPUT = {
  first_name: 'Jane',
  last_name: 'Doe',
  date_of_birth: '1980-01-01',
  sex: 'female',
  phone_primary: '555-0100',
  preferred_language: 'English',
  preferred_contact_method: 'phone' as const,
  voicemail_permission: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubjectContactService.get', () => {
  it('throws PermissionDeniedError when the user lacks view_subject_phi', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('view_subject_phi'),
    );

    await expect(SubjectContactService.get(SUBJECT_ID, makeCtx())).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it('throws NotFoundError when the subject does not exist in this company', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabaseClient({ data: null }));

    await expect(SubjectContactService.get(SUBJECT_ID, makeCtx())).rejects.toThrow(NotFoundError);
  });

  it('returns null when no contact info has been captured yet', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeSupabaseClient(
      { data: { site_id: SITE_ID, initials: 'JD' } }, // subjects lookup
      { data: null }, // subject_contact_info select
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SubjectContactService.get(SUBJECT_ID, makeCtx());
    expect(result).toBeNull();
  });
});

describe('SubjectContactService.upsert', () => {
  it('throws PermissionDeniedError when the user lacks edit_subject_phi', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('edit_subject_phi'),
    );

    await expect(
      SubjectContactService.upsert(SUBJECT_ID, CONTACT_INPUT, makeCtx()),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('creates a new record, auto-generates initials when missing, and audits without raw PHI values', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const created = { id: 'contact-uuid', subject_id: SUBJECT_ID, ...CONTACT_INPUT };
    const client = makeSupabaseClient(
      { data: { site_id: SITE_ID, initials: null } }, // subjects lookup (initials missing)
      { data: null }, // existing contact info check — none
      { data: created }, // subject_contact_info insert
      { data: [{ id: SUBJECT_ID }] }, // subjects.initials update (self-heal)
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SubjectContactService.upsert(SUBJECT_ID, CONTACT_INPUT, makeCtx());

    expect(result.id).toBe('contact-uuid');

    // Audit calls must never carry raw PHI values, only a field-name whitelist.
    for (const call of vi.mocked(AuditService.log).mock.calls) {
      const [entry] = call;
      const serialized = JSON.stringify(entry.new_value ?? {});
      expect(serialized).not.toContain(CONTACT_INPUT.first_name);
      expect(serialized).not.toContain(CONTACT_INPUT.phone_primary);
    }
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subject_contact_info.created',
        record_id: 'contact-uuid',
      }),
    );
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subject.initials_generated' }),
    );
  });

  it('does not attempt to regenerate initials when the subject already has them', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const existingContact = { id: 'contact-uuid' };
    const updated = { id: 'contact-uuid', subject_id: SUBJECT_ID, ...CONTACT_INPUT };
    const client = makeSupabaseClient(
      { data: { site_id: SITE_ID, initials: 'JD' } }, // subjects lookup — initials already set
      { data: existingContact }, // existing contact info check
      { data: updated }, // subject_contact_info update
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await SubjectContactService.upsert(SUBJECT_ID, CONTACT_INPUT, makeCtx());

    const actions = vi.mocked(AuditService.log).mock.calls.map((c) => c[0].action);
    expect(actions).not.toContain('subject.initials_generated');
    expect(actions).toContain('subject_contact_info.updated');
  });
});
