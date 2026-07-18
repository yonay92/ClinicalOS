import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotFoundError, DatabaseError } from '@/lib/api/errors';
import type {
  AppointmentConfirmation,
  AppointmentConfirmationStatus,
  LogContactAttemptInput,
} from '@/types/visits';
import type { RequestContext } from '@/types/api';

const CONFIRMATION_COLUMNS =
  'id, company_id, site_id, visit_id, confirmation_status, last_contacted_at, last_contacted_by, contact_attempt_count, contact_notes, next_contact_at, created_at, updated_at';

async function getVisitContext(
  subjectId: string,
  visitId: string,
  ctx: RequestContext,
): Promise<{ site_id: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('visits')
    .select('site_id')
    .eq('id', visitId)
    .eq('subject_id', subjectId)
    .eq('company_id', ctx.company.id)
    .single();

  if (error || !data) throw new NotFoundError('Visit');
  return data as { site_id: string };
}

// Generic, non-PHI text only — subject_timeline is visible to anyone with
// view_subjects, a broader permission than view_subject_phi. Never include
// contact_notes, phone numbers, or other PHI here.
async function addSubjectTimelineEvent(
  subjectId: string,
  companyId: string,
  description: string,
  userId: string,
  visitId: string,
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from('subject_timeline').insert({
    company_id: companyId,
    subject_id: subjectId,
    event_type: 'appointment_confirmation_updated',
    event_date: new Date().toISOString(),
    description,
    related_record_type: 'visits',
    related_record_id: visitId,
    created_by: userId,
  });
}

export const AppointmentConfirmationService = {
  async get(
    subjectId: string,
    visitId: string,
    ctx: RequestContext,
  ): Promise<AppointmentConfirmation | null> {
    await PermissionService.requirePermission(ctx.user.id, 'view_subject_phi');
    await getVisitContext(subjectId, visitId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('appointment_confirmations')
      .select(CONFIRMATION_COLUMNS)
      .eq('visit_id', visitId)
      .eq('company_id', ctx.company.id)
      .maybeSingle();

    return (data as AppointmentConfirmation | null) ?? null;
  },

  // This is a parallel write path that deliberately never imports VisitService
  // or touches visits.status/calendar_events — contacting a patient must never
  // change the clinical visit lifecycle or auto-start a visit. Reschedule
  // requests are not handled here either: the UI surfaces the existing
  // VisitRescheduler action for that, unchanged.
  async logContact(
    subjectId: string,
    visitId: string,
    input: LogContactAttemptInput,
    ctx: RequestContext,
  ): Promise<AppointmentConfirmation> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_subject_phi');
    const visit = await getVisitContext(subjectId, visitId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data: existingRow } = await supabase
      .from('appointment_confirmations')
      .select(CONFIRMATION_COLUMNS)
      .eq('visit_id', visitId)
      .eq('company_id', ctx.company.id)
      .maybeSingle();
    const existing = existingRow as AppointmentConfirmation | null;

    const previousStatus: AppointmentConfirmationStatus =
      existing?.confirmation_status ?? 'not_contacted';
    const previousAttempts = existing?.contact_attempt_count ?? 0;

    const patch = {
      confirmation_status: input.confirmation_status,
      last_contacted_at: new Date().toISOString(),
      last_contacted_by: ctx.user.id,
      contact_attempt_count: previousAttempts + 1,
      contact_notes: input.notes ?? existing?.contact_notes ?? null,
      next_contact_at: input.next_contact_at ?? null,
    };

    const { data, error } = existing
      ? await supabase
          .from('appointment_confirmations')
          .update(patch)
          .eq('id', existing.id)
          .eq('company_id', ctx.company.id)
          .select(CONFIRMATION_COLUMNS)
          .single()
      : await supabase
          .from('appointment_confirmations')
          .insert({
            company_id: ctx.company.id,
            site_id: visit.site_id,
            visit_id: visitId,
            ...patch,
          })
          .select(CONFIRMATION_COLUMNS)
          .single();

    if (error || !data) {
      throw new DatabaseError(error?.message ?? 'Failed to log contact attempt');
    }

    // Append-only per-attempt log — backs contact_attempt_count with a real
    // audit trail, same role visit_history plays for visits.status.
    await supabase.from('appointment_confirmation_log').insert({
      company_id: ctx.company.id,
      visit_id: visitId,
      contact_method: input.contact_method ?? null,
      old_status: previousStatus,
      new_status: input.confirmation_status,
      notes: input.notes ?? null,
      contacted_by: ctx.user.id,
    });

    await addSubjectTimelineEvent(
      subjectId,
      ctx.company.id,
      `Appointment confirmation: ${input.confirmation_status.replace(/_/g, ' ')}`,
      ctx.user.id,
      visitId,
    );

    // Status/method only — never contact_notes. view_audit_logs is a broader
    // permission than view_subject_phi and must not leak PHI content.
    await AuditService.log({
      company_id: ctx.company.id,
      site_id: visit.site_id,
      user_id: ctx.user.id,
      action: 'appointment_confirmation.contact_logged',
      module: 'subjects',
      record_type: 'appointment_confirmations',
      record_id: (data as AppointmentConfirmation).id,
      old_value: { confirmation_status: previousStatus },
      new_value: {
        confirmation_status: input.confirmation_status,
        contact_method: input.contact_method ?? null,
      },
    });

    return data as AppointmentConfirmation;
  },
};
