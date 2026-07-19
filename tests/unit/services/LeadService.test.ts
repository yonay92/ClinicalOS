import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { LeadService } from '@/services/recruitment/LeadService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { SubjectService } from '@/services/subjects/SubjectService';
import { PermissionDeniedError, BusinessRuleError, NotFoundError } from '@/lib/api/errors';
import type { Lead } from '@/types/recruitment';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

vi.mock('@/services/subjects/SubjectService', () => ({
  SubjectService: { create: vi.fn() },
}));

const COMPANY_ID = 'company-uuid';
const SITE_ID = 'site-uuid';
const STUDY_ID = 'study-uuid';
const LEAD_ID = 'lead-uuid';
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

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: LEAD_ID,
    company_id: COMPANY_ID,
    site_id: SITE_ID,
    study_id: STUDY_ID,
    referral_source_id: null,
    initials: 'JD',
    status: 'prescreening',
    contact_attempt_count: 1,
    last_contacted_at: null,
    next_contact_at: null,
    waitlisted_at: null,
    converted_subject_id: null,
    converted_at: null,
    declined_reason: null,
    created_by: USER_ID,
    updated_by: USER_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function queryStub(data: unknown, error: unknown = null) {
  const resolved = Promise.resolve({ data, error });
  const stub: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update']) {
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

describe('LeadService.create', () => {
  it('throws PermissionDeniedError when the user lacks create_lead', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('create_lead'),
    );

    await expect(LeadService.create({}, makeCtx())).rejects.toThrow(PermissionDeniedError);
  });

  it('does not require site access when no site_id is provided (company-wide pool)', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const requireSiteAccess = vi.spyOn(PermissionService, 'requireSiteAccess');
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: baseLead({ site_id: null, study_id: null }) }),
    );

    await LeadService.create({}, makeCtx());

    expect(requireSiteAccess).not.toHaveBeenCalled();
  });

  it('requires site access when a site_id is provided', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockRejectedValue(
      new PermissionDeniedError(`site:${SITE_ID}`),
    );

    await expect(LeadService.create({ site_id: SITE_ID }, makeCtx())).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});

describe('LeadService terminal-status guard', () => {
  it('logContact rejects a lead that is already converted', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: baseLead({ status: 'converted' }) }),
    );

    await expect(
      LeadService.logContact(LEAD_ID, { new_status: 'contacted' }, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('waitlist rejects a lead that has already been declined', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: baseLead({ status: 'declined' }) }),
    );

    await expect(LeadService.waitlist(LEAD_ID, makeCtx())).rejects.toThrow(BusinessRuleError);
  });
});

describe('LeadService.convertToSubject', () => {
  it('throws PermissionDeniedError when the user lacks convert_lead', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('convert_lead'),
    );

    await expect(
      LeadService.convertToSubject(LEAD_ID, { subject_number: '001-001' }, makeCtx()),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('throws BusinessRuleError when the lead has no site assigned', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: baseLead({ site_id: null }) }),
    );

    await expect(
      LeadService.convertToSubject(LEAD_ID, { subject_number: '001-001' }, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError when the lead has no study matched', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: baseLead({ study_id: null }) }),
    );

    await expect(
      LeadService.convertToSubject(LEAD_ID, { subject_number: '001-001' }, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError when the latest prescreening for the matched study is not_eligible', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeSupabaseClient(
      { data: baseLead() }, // lead lookup
      { data: { computed_outcome: 'not_eligible', manual_outcome: null } }, // latest prescreening
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      LeadService.convertToSubject(LEAD_ID, { subject_number: '001-001' }, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError when there is no prescreening at all for the matched study', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeSupabaseClient(
      { data: baseLead() }, // lead lookup
      { data: null }, // no prescreening found
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      LeadService.convertToSubject(LEAD_ID, { subject_number: '001-001' }, makeCtx()),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('a manual_outcome override takes precedence over computed_outcome for the eligibility gate', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeSupabaseClient(
      { data: baseLead() }, // lead lookup
      { data: { computed_outcome: 'not_eligible', manual_outcome: 'needs_review' } }, // latest prescreening
      { data: null }, // no contact info on file — fails fast before reaching SubjectService
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    // Should get past the eligibility gate (manual override says needs_review, not
    // not_eligible) and fail on the *next* guard (missing contact info) instead.
    await expect(
      LeadService.convertToSubject(LEAD_ID, { subject_number: '001-001' }, makeCtx()),
    ).rejects.toThrow('no contact information on file');
  });

  it('throws BusinessRuleError listing both missing fields when the lead has neither date of birth nor sex on file (both required by subject_contact_info)', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeSupabaseClient(
      { data: baseLead() }, // lead lookup
      { data: { computed_outcome: 'potentially_eligible', manual_outcome: null } }, // latest prescreening
      {
        data: {
          first_name: 'Jane',
          last_name: 'Doe',
          date_of_birth: null,
          sex: null,
          phone_primary: '555-0100',
          phone_secondary: null,
          email: null,
          preferred_contact_method: 'phone',
        },
      }, // lead_contact_info — neither on file
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      LeadService.convertToSubject(LEAD_ID, { subject_number: '001-001' }, makeCtx()),
    ).rejects.toThrow('date of birth and sex');
    expect(SubjectService.create).not.toHaveBeenCalled();
  });

  it('throws BusinessRuleError for sex alone when date of birth is already on file', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeSupabaseClient(
      { data: baseLead() }, // lead lookup
      { data: { computed_outcome: 'potentially_eligible', manual_outcome: null } }, // latest prescreening
      {
        data: {
          first_name: 'Jane',
          last_name: 'Doe',
          date_of_birth: '1980-01-01',
          sex: null,
          phone_primary: '555-0100',
          phone_secondary: null,
          email: null,
          preferred_contact_method: 'phone',
        },
      }, // lead_contact_info — sex not on file
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      LeadService.convertToSubject(LEAD_ID, { subject_number: '001-001' }, makeCtx()),
    ).rejects.toThrow(/^This lead needs sex on file/);
    expect(SubjectService.create).not.toHaveBeenCalled();
  });

  it('converts successfully: creates the Subject, copies contact info via the admin client, and updates the lead', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(SubjectService.create).mockResolvedValue({
      id: 'subject-uuid',
      company_id: COMPANY_ID,
      site_id: SITE_ID,
      study_id: STUDY_ID,
      subject_number: '001-001',
      initials: 'JD',
      status: 'pre_screening',
      screening_date: null,
      baseline_date: null,
      randomization_date: null,
      randomization_number: null,
      end_of_study_date: null,
      created_by: USER_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const contactInfo = {
      first_name: 'Jane',
      last_name: 'Doe',
      date_of_birth: '1980-01-01',
      sex: 'female',
      phone_primary: '555-0100',
      phone_secondary: null,
      email: null,
      preferred_contact_method: 'phone',
    };

    const adminInsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: adminInsert }),
    } as never);

    const client = makeSupabaseClient(
      { data: baseLead() }, // lead lookup
      { data: { computed_outcome: 'potentially_eligible', manual_outcome: null } }, // latest prescreening
      { data: contactInfo }, // lead_contact_info lookup
      { data: baseLead({ status: 'converted', converted_subject_id: 'subject-uuid' }) }, // lead update
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await LeadService.convertToSubject(
      LEAD_ID,
      { subject_number: '001-001' },
      makeCtx(),
    );

    expect(result.subject_id).toBe('subject-uuid');
    expect(result.lead.status).toBe('converted');
    expect(SubjectService.create).toHaveBeenCalledWith(
      expect.objectContaining({ site_id: SITE_ID, study_id: STUDY_ID, subject_number: '001-001' }),
      expect.anything(),
    );
    expect(adminInsert).toHaveBeenCalledWith(
      expect.objectContaining({ subject_id: 'subject-uuid', first_name: 'Jane' }),
    );
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lead.converted' }),
    );
  });
});

describe('LeadService.getById', () => {
  it('throws NotFoundError when the lead does not exist in this company', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabaseClient({ data: null }));

    await expect(LeadService.getById(LEAD_ID, makeCtx())).rejects.toThrow(NotFoundError);
  });
});
