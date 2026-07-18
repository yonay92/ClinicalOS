import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotFoundError, DatabaseError } from '@/lib/api/errors';
import type { SubjectContactInfo, UpsertSubjectContactInfoInput } from '@/types/subjects';
import type { RequestContext } from '@/types/api';

const CONTACT_INFO_COLUMNS =
  'id, company_id, site_id, subject_id, first_name, last_name, date_of_birth, sex, phone_primary, phone_secondary, email, preferred_language, preferred_contact_method, voicemail_permission, best_time_to_contact, created_by, updated_by, created_at, updated_at';

// Deliberately queries `subjects` directly rather than SubjectService.getById —
// that method requires 'view_subjects', a separate permission a PHI-only user
// isn't guaranteed to hold. Same pattern as VisitService's getSubjectSiteContext.
async function getSubjectContext(
  subjectId: string,
  ctx: RequestContext,
): Promise<{ site_id: string; initials: string | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('subjects')
    .select('site_id, initials')
    .eq('id', subjectId)
    .eq('company_id', ctx.company.id)
    .single();

  if (error || !data) throw new NotFoundError('Subject');
  return data as { site_id: string; initials: string | null };
}

function generateInitials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase();
}

export const SubjectContactService = {
  async get(subjectId: string, ctx: RequestContext): Promise<SubjectContactInfo | null> {
    await PermissionService.requirePermission(ctx.user.id, 'view_subject_phi');
    await getSubjectContext(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('subject_contact_info')
      .select(CONTACT_INFO_COLUMNS)
      .eq('subject_id', subjectId)
      .eq('company_id', ctx.company.id)
      .maybeSingle();

    return (data as SubjectContactInfo | null) ?? null;
  },

  async upsert(
    subjectId: string,
    input: UpsertSubjectContactInfoInput,
    ctx: RequestContext,
  ): Promise<SubjectContactInfo> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_subject_phi');
    const subject = await getSubjectContext(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data: existing } = await supabase
      .from('subject_contact_info')
      .select('id')
      .eq('subject_id', subjectId)
      .eq('company_id', ctx.company.id)
      .maybeSingle();

    const payload = {
      first_name: input.first_name,
      last_name: input.last_name,
      date_of_birth: input.date_of_birth,
      sex: input.sex,
      phone_primary: input.phone_primary,
      phone_secondary: input.phone_secondary ?? null,
      email: input.email ?? null,
      preferred_language: input.preferred_language,
      preferred_contact_method: input.preferred_contact_method,
      voicemail_permission: input.voicemail_permission,
      best_time_to_contact: input.best_time_to_contact ?? null,
    };

    const isCreate = !existing;
    const { data, error } = isCreate
      ? await supabase
          .from('subject_contact_info')
          .insert({
            company_id: ctx.company.id,
            site_id: subject.site_id,
            subject_id: subjectId,
            ...payload,
            created_by: ctx.user.id,
            updated_by: ctx.user.id,
          })
          .select(CONTACT_INFO_COLUMNS)
          .single()
      : await supabase
          .from('subject_contact_info')
          .update({ ...payload, updated_by: ctx.user.id })
          .eq('id', (existing as { id: string }).id)
          .eq('company_id', ctx.company.id)
          .select(CONTACT_INFO_COLUMNS)
          .single();

    if (error || !data) {
      throw new DatabaseError(error?.message ?? 'Failed to save subject contact information');
    }

    // Initials aren't PHI-gated today (the calendar already shows them to
    // everyone), so auto-generating them here uses the normal subject.* audit
    // action rather than the PHI-scoped one below. `.is('initials', null)`
    // keeps this a no-op if initials were set by someone else in the meantime.
    if (!subject.initials) {
      const generated = generateInitials(input.first_name, input.last_name);
      const { data: initialsUpdated, error: initialsError } = await supabase
        .from('subjects')
        .update({ initials: generated })
        .eq('id', subjectId)
        .eq('company_id', ctx.company.id)
        .is('initials', null)
        .select('id');

      if (!initialsError && initialsUpdated && initialsUpdated.length > 0) {
        await AuditService.log({
          company_id: ctx.company.id,
          site_id: subject.site_id,
          user_id: ctx.user.id,
          action: 'subject.initials_generated',
          module: 'subjects',
          record_type: 'subjects',
          record_id: subjectId,
          new_value: { initials: generated },
        });
      }
    }

    // Explicit field-name whitelist, never raw PHI values — view_audit_logs is
    // a broader permission than view_subject_phi and must not leak PHI content.
    await AuditService.log({
      company_id: ctx.company.id,
      site_id: subject.site_id,
      user_id: ctx.user.id,
      action: isCreate ? 'subject_contact_info.created' : 'subject_contact_info.updated',
      module: 'subjects',
      record_type: 'subject_contact_info',
      record_id: (data as SubjectContactInfo).id,
      new_value: { updated_fields: Object.keys(payload) },
    });

    return data as SubjectContactInfo;
  },
};
