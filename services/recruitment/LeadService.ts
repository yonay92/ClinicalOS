import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { SubjectService } from '@/services/subjects/SubjectService';
import { NotFoundError, DatabaseError, BusinessRuleError } from '@/lib/api/errors';
import type {
  Lead,
  LeadStatus,
  CreateLeadInput,
  UpdateLeadInput,
  LogLeadContactInput,
  LeadContactLogEntry,
  PrescreeningOutcome,
} from '@/types/recruitment';
import type { CreateSubjectInput } from '@/types/subjects';
import type { RequestContext } from '@/types/api';

const LEAD_COLUMNS =
  'id, company_id, site_id, study_id, referral_source_id, initials, status, contact_attempt_count, last_contacted_at, next_contact_at, waitlisted_at, converted_subject_id, converted_at, declined_reason, created_by, updated_by, created_at, updated_at';

const TERMINAL_STATUSES: LeadStatus[] = ['converted', 'declined', 'lost'];

async function getLeadOrThrow(leadId: string, ctx: RequestContext): Promise<Lead> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_COLUMNS)
    .eq('id', leadId)
    .eq('company_id', ctx.company.id)
    .single();

  if (error || !data) throw new NotFoundError('Lead');
  return data as Lead;
}

function assertNotTerminal(lead: Lead): void {
  if (TERMINAL_STATUSES.includes(lead.status)) {
    throw new BusinessRuleError(
      `This lead is already ${lead.status.replace(/_/g, ' ')} and cannot be updated further.`,
    );
  }
}

export const LeadService = {
  async create(input: CreateLeadInput, ctx: RequestContext): Promise<Lead> {
    await PermissionService.requirePermission(ctx.user.id, 'create_lead');
    // Company-wide pool by design (product decision) — site_id is optional; a
    // caller is only required to prove access to a site they're actually
    // assigning the lead to, never to a site they're leaving unset.
    if (input.site_id) {
      await PermissionService.requireSiteAccess(ctx.user.id, input.site_id);
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('leads')
      .insert({
        company_id: ctx.company.id,
        site_id: input.site_id ?? null,
        study_id: input.study_id ?? null,
        referral_source_id: input.referral_source_id ?? null,
        status: 'new',
        created_by: ctx.user.id,
        updated_by: ctx.user.id,
      })
      .select(LEAD_COLUMNS)
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to create lead');

    const lead = data as Lead;

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: lead.site_id,
      user_id: ctx.user.id,
      action: 'lead.created',
      module: 'recruitment',
      record_type: 'leads',
      record_id: lead.id,
      new_value: { site_id: lead.site_id, study_id: lead.study_id },
    });

    return lead;
  },

  async getById(leadId: string, ctx: RequestContext): Promise<Lead> {
    await PermissionService.requirePermission(ctx.user.id, 'view_leads');
    return getLeadOrThrow(leadId, ctx);
  },

  // Gated by view_lead_phi, not view_leads — notes may contain PHI-adjacent
  // contact context, same reasoning as the log table's own RLS policy.
  async getContactLog(leadId: string, ctx: RequestContext): Promise<LeadContactLogEntry[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_lead_phi');
    await getLeadOrThrow(leadId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('lead_contact_log')
      .select(
        'id, company_id, lead_id, contact_method, old_status, new_status, notes, contacted_by, contacted_at',
      )
      .eq('lead_id', leadId)
      .eq('company_id', ctx.company.id)
      .order('contacted_at', { ascending: false });

    if (error) throw new DatabaseError(error.message);
    return (data as LeadContactLogEntry[]) ?? [];
  },

  async list(
    filters: {
      status?: LeadStatus | undefined;
      site_id?: string | undefined;
      study_id?: string | undefined;
      referral_source_id?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<Lead[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_leads');

    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from('leads')
      .select(LEAD_COLUMNS)
      .eq('company_id', ctx.company.id)
      .order('created_at', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.site_id) query = query.eq('site_id', filters.site_id);
    if (filters.study_id) query = query.eq('study_id', filters.study_id);
    if (filters.referral_source_id)
      query = query.eq('referral_source_id', filters.referral_source_id);

    const { data, error } = await query;
    if (error) throw new DatabaseError(error.message);
    return (data as Lead[]) ?? [];
  },

  async update(leadId: string, input: UpdateLeadInput, ctx: RequestContext): Promise<Lead> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_lead');
    const lead = await getLeadOrThrow(leadId, ctx);
    assertNotTerminal(lead);

    if (input.site_id) {
      await PermissionService.requireSiteAccess(ctx.user.id, input.site_id);
    }

    const patch: Record<string, unknown> = { updated_by: ctx.user.id };
    if (input.site_id !== undefined) patch.site_id = input.site_id;
    if (input.study_id !== undefined) patch.study_id = input.study_id;
    if (input.referral_source_id !== undefined) patch.referral_source_id = input.referral_source_id;

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('leads')
      .update(patch)
      .eq('id', leadId)
      .eq('company_id', ctx.company.id)
      .select(LEAD_COLUMNS)
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to update lead');

    const updated = data as Lead;

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: updated.site_id,
      user_id: ctx.user.id,
      action: 'lead.updated',
      module: 'recruitment',
      record_type: 'leads',
      record_id: leadId,
      old_value: { site_id: lead.site_id, study_id: lead.study_id },
      new_value: { site_id: updated.site_id, study_id: updated.study_id },
    });

    return updated;
  },

  // Contacting a lead is gated by edit_lead_phi (not edit_lead) — same
  // reasoning as appointment_confirmation_log: the notes/method here are
  // PHI-adjacent contact context, not bare pipeline state.
  async logContact(leadId: string, input: LogLeadContactInput, ctx: RequestContext): Promise<Lead> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_lead_phi');
    const lead = await getLeadOrThrow(leadId, ctx);
    assertNotTerminal(lead);

    const supabase = await createServerSupabaseClient();
    const previousStatus = lead.status;

    const { data, error } = await supabase
      .from('leads')
      .update({
        status: input.new_status,
        contact_attempt_count: lead.contact_attempt_count + 1,
        last_contacted_at: new Date().toISOString(),
        next_contact_at: input.next_contact_at ?? null,
        updated_by: ctx.user.id,
      })
      .eq('id', leadId)
      .eq('company_id', ctx.company.id)
      .select(LEAD_COLUMNS)
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to log contact attempt');

    await supabase.from('lead_contact_log').insert({
      company_id: ctx.company.id,
      lead_id: leadId,
      contact_method: input.contact_method ?? null,
      old_status: previousStatus,
      new_status: input.new_status,
      notes: input.notes ?? null,
      contacted_by: ctx.user.id,
    });

    // Status/method only — never notes, which may contain PHI-adjacent
    // context. Same rule as AppointmentConfirmationService.logContact.
    await AuditService.log({
      company_id: ctx.company.id,
      site_id: (data as Lead).site_id,
      user_id: ctx.user.id,
      action: 'lead.contact_logged',
      module: 'recruitment',
      record_type: 'leads',
      record_id: leadId,
      old_value: { status: previousStatus },
      new_value: { status: input.new_status, contact_method: input.contact_method ?? null },
    });

    return data as Lead;
  },

  async waitlist(leadId: string, ctx: RequestContext): Promise<Lead> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_lead');
    const lead = await getLeadOrThrow(leadId, ctx);
    assertNotTerminal(lead);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('leads')
      .update({
        status: 'waitlisted',
        waitlisted_at: new Date().toISOString(),
        updated_by: ctx.user.id,
      })
      .eq('id', leadId)
      .eq('company_id', ctx.company.id)
      .select(LEAD_COLUMNS)
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to waitlist lead');

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: (data as Lead).site_id,
      user_id: ctx.user.id,
      action: 'lead.waitlisted',
      module: 'recruitment',
      record_type: 'leads',
      record_id: leadId,
      old_value: { status: lead.status },
      new_value: { status: 'waitlisted' },
    });

    return data as Lead;
  },

  async decline(leadId: string, reason: string, ctx: RequestContext): Promise<Lead> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_lead');
    const lead = await getLeadOrThrow(leadId, ctx);
    assertNotTerminal(lead);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('leads')
      .update({ status: 'declined', declined_reason: reason, updated_by: ctx.user.id })
      .eq('id', leadId)
      .eq('company_id', ctx.company.id)
      .select(LEAD_COLUMNS)
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to decline lead');

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: (data as Lead).site_id,
      user_id: ctx.user.id,
      action: 'lead.declined',
      module: 'recruitment',
      record_type: 'leads',
      record_id: leadId,
      old_value: { status: lead.status },
      new_value: { status: 'declined', declined_reason: reason },
    });

    return data as Lead;
  },

  // Converts a Lead into a real, enrolled Subject. Reuses SubjectService.create
  // directly (never duplicates its active-study/approved-template/site-assigned
  // business rules), then copies the lead's PHI into a new subject_contact_info
  // row using the admin client — deliberately bypassing the normal
  // edit_subject_phi RLS check for this one write. convert_lead is the
  // authorizing permission for the conversion as a single atomic action; a
  // caller who can legitimately convert leads (and already proved edit_lead_phi
  // to see the source contact info) shouldn't also need a separate,
  // unrelated-looking edit_subject_phi grant just for this internal copy step.
  async convertToSubject(
    leadId: string,
    input: { subject_number: string; screening_date?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ lead: Lead; subject_id: string }> {
    await PermissionService.requirePermission(ctx.user.id, 'convert_lead');
    const lead = await getLeadOrThrow(leadId, ctx);
    assertNotTerminal(lead);

    if (!lead.site_id) {
      throw new BusinessRuleError(
        'This lead must be assigned to a site before it can be converted.',
      );
    }
    if (!lead.study_id) {
      throw new BusinessRuleError(
        'This lead must be matched to a study before it can be converted.',
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: latestPrescreening } = await supabase
      .from('lead_prescreenings')
      .select('computed_outcome, manual_outcome')
      .eq('lead_id', leadId)
      .eq('study_id', lead.study_id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const effectiveOutcome: PrescreeningOutcome | null = latestPrescreening
      ? ((
          latestPrescreening as {
            manual_outcome: PrescreeningOutcome | null;
            computed_outcome: PrescreeningOutcome;
          }
        ).manual_outcome ??
        (latestPrescreening as { computed_outcome: PrescreeningOutcome }).computed_outcome)
      : null;

    if (!effectiveOutcome || effectiveOutcome === 'not_eligible') {
      throw new BusinessRuleError(
        'This lead needs a prescreening for the matched study with an outcome other than Not Eligible before it can be converted.',
      );
    }

    const { data: contactInfo } = await supabase
      .from('lead_contact_info')
      .select(
        'first_name, last_name, date_of_birth, sex, phone_primary, phone_secondary, email, preferred_contact_method',
      )
      .eq('lead_id', leadId)
      .maybeSingle();

    if (!contactInfo) {
      throw new BusinessRuleError('This lead has no contact information on file yet.');
    }
    const info = contactInfo as {
      first_name: string;
      last_name: string;
      date_of_birth: string | null;
      sex: string | null;
      phone_primary: string;
      phone_secondary: string | null;
      email: string | null;
      preferred_contact_method: string;
    };
    // date_of_birth and sex are optional on lead_contact_info ("DOB if
    // available" — product decision — and sex was never required at the
    // recruitment stage) but both are NOT NULL on subject_contact_info — a
    // Subject needs them for clinical purposes. Catch that mismatch here with
    // a clear message rather than letting the copy step fail on a DB
    // constraint partway through (the Subject would already be created).
    const missingFields = [!info.date_of_birth && 'date of birth', !info.sex && 'sex'].filter(
      (f): f is string => Boolean(f),
    );
    if (missingFields.length > 0) {
      throw new BusinessRuleError(
        `This lead needs ${missingFields.join(' and ')} on file before it can be converted to a Subject.`,
      );
    }

    const subjectInput: CreateSubjectInput = {
      site_id: lead.site_id,
      study_id: lead.study_id,
      subject_number: input.subject_number,
      ...(lead.initials ? { initials: lead.initials } : {}),
      ...(input.screening_date ? { screening_date: input.screening_date } : {}),
    };
    const subject = await SubjectService.create(subjectInput, ctx);

    const adminSupabase = createAdminSupabaseClient();
    const { error: contactError } = await adminSupabase.from('subject_contact_info').insert({
      company_id: ctx.company.id,
      site_id: lead.site_id,
      subject_id: subject.id,
      first_name: info.first_name,
      last_name: info.last_name,
      date_of_birth: info.date_of_birth,
      sex: info.sex,
      phone_primary: info.phone_primary,
      phone_secondary: info.phone_secondary,
      email: info.email,
      preferred_language: 'English',
      preferred_contact_method: info.preferred_contact_method,
      voicemail_permission: false,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    });
    if (contactError) {
      throw new DatabaseError(
        `Subject created, but copying contact info failed: ${contactError.message}`,
      );
    }

    const { data: updatedLead, error: leadError } = await supabase
      .from('leads')
      .update({
        status: 'converted',
        converted_subject_id: subject.id,
        converted_at: new Date().toISOString(),
        updated_by: ctx.user.id,
      })
      .eq('id', leadId)
      .eq('company_id', ctx.company.id)
      .select(LEAD_COLUMNS)
      .single();

    if (leadError || !updatedLead) {
      throw new DatabaseError(
        leadError?.message ?? 'Subject created, but updating the lead failed',
      );
    }

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: lead.site_id,
      user_id: ctx.user.id,
      action: 'lead.converted',
      module: 'recruitment',
      record_type: 'leads',
      record_id: leadId,
      new_value: { converted_subject_id: subject.id },
    });

    return { lead: updatedLead as Lead, subject_id: subject.id };
  },
};
