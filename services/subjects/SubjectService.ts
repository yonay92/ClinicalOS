import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotificationService } from '@/services/notifications/NotificationService';
import { VisitTemplateService } from '@/services/visit-templates/VisitTemplateService';
import {
  NotFoundError,
  DatabaseError,
  BusinessRuleError,
  DuplicateRecordError,
} from '@/lib/api/errors';
import type {
  Subject,
  SubjectStatus,
  CreateSubjectInput,
  UpdateSubjectInput,
  CompleteBaselineVisitInput,
  RandomizeSubjectInput,
  SubjectStatusHistory,
  SubjectNote,
  SubjectNoteVisibility,
  SubjectDocument,
  SubjectTimelineEvent,
  Visit,
} from '@/types/subjects';
import type { VisitTemplateItem } from '@/types/studies';
import type { RequestContext } from '@/types/api';

const SUBJECT_COLUMNS =
  'id, company_id, site_id, study_id, subject_number, initials, status, screening_date, baseline_date, randomization_date, randomization_number, end_of_study_date, created_by, created_at, updated_at';
const VISIT_COLUMNS =
  'id, company_id, site_id, study_id, subject_id, visit_template_item_id, visit_name, visit_type, target_date, scheduled_date, window_start, window_end, status, created_by, created_at, updated_at';
const STATUS_HISTORY_COLUMNS =
  'id, company_id, subject_id, old_status, new_status, changed_by, changed_at, reason';
const NOTE_COLUMNS = 'id, company_id, subject_id, note, visibility, created_by, created_at';
const DOCUMENT_COLUMNS =
  'id, company_id, subject_id, file_id, document_type, uploaded_by, uploaded_at, notes';
const TIMELINE_COLUMNS =
  'id, company_id, subject_id, event_type, event_date, description, related_record_type, related_record_id, created_by, created_at';

export type SubjectListFilters = {
  study_id?: string | undefined;
  site_id?: string | undefined;
  status?: SubjectStatus | undefined;
  subject_number?: string | undefined;
  // Free-text search across subject_number and initials.
  search?: string | undefined;
  // A user_id — resolved via study_staff (staff_role = 'crc') rather than a
  // direct ownership column. Subjects are not assigned to a fixed CRC
  // (docs/DATABASE_Part_03_Subjects_Visits_Calendar.md); this filters to
  // subjects whose study currently has that user as an active CRC.
  assigned_crc?: string | undefined;
};

// BUSINESS_RULES_03: Pre-Screening -> Screening -> Randomized -> Active -> Completed,
// with Screen Failed / Early Terminated / Lost to Follow Up as alternate exits.
const FORWARD_FLOW: SubjectStatus[] = [
  'pre_screening',
  'screening',
  'randomized',
  'active',
  'completed',
];
const TERMINAL_STATUSES: SubjectStatus[] = [
  'screen_failed',
  'completed',
  'early_terminated',
  'lost_to_follow_up',
];

function isValidStatusTransition(from: SubjectStatus, to: SubjectStatus): boolean {
  if (from === to) return false;
  if (TERMINAL_STATUSES.includes(from)) return false;

  if (to === 'screen_failed') return from === 'pre_screening' || from === 'screening';
  if (to === 'early_terminated' || to === 'lost_to_follow_up') {
    return from === 'screening' || from === 'randomized' || from === 'active';
  }

  const fromIndex = FORWARD_FLOW.indexOf(from);
  const toIndex = FORWARD_FLOW.indexOf(to);
  return fromIndex !== -1 && toIndex === fromIndex + 1;
}

function addDaysToDateString(dateStr: string, days: number): string {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const SubjectService = {
  async list(filters: SubjectListFilters, ctx: RequestContext): Promise<Subject[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_subjects');

    const supabase = await createServerSupabaseClient();
    let query = supabase.from('subjects').select(SUBJECT_COLUMNS).eq('company_id', ctx.company.id);

    if (filters.study_id) query = query.eq('study_id', filters.study_id);
    if (filters.site_id) query = query.eq('site_id', filters.site_id);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.subject_number)
      query = query.ilike('subject_number', `%${filters.subject_number}%`);
    if (filters.search) {
      const escaped = filters.search.replace(/[%,()]/g, '');
      query = query.or(`subject_number.ilike.%${escaped}%,initials.ilike.%${escaped}%`);
    }

    if (filters.assigned_crc) {
      const { data: staffRows } = await supabase
        .from('study_staff')
        .select('study_id')
        .eq('company_id', ctx.company.id)
        .eq('user_id', filters.assigned_crc)
        .eq('staff_role', 'crc')
        .eq('active', true);

      const studyIds = [
        ...new Set(
          ((staffRows as Array<{ study_id: string }> | null) ?? []).map((r) => r.study_id),
        ),
      ];
      if (studyIds.length === 0) return [];
      query = query.in('study_id', studyIds);
    }

    const { data } = await query.order('created_at', { ascending: false });
    return (data as Subject[]) ?? [];
  },

  async getById(subjectId: string, ctx: RequestContext): Promise<Subject> {
    await PermissionService.requirePermission(ctx.user.id, 'view_subjects');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('subjects')
      .select(SUBJECT_COLUMNS)
      .eq('id', subjectId)
      .eq('company_id', ctx.company.id)
      .single();

    if (error || !data) throw new NotFoundError('Subject');
    return data as Subject;
  },

  async create(input: CreateSubjectInput, ctx: RequestContext): Promise<Subject> {
    await PermissionService.requirePermission(ctx.user.id, 'create_subject');
    await PermissionService.requireSiteAccess(ctx.user.id, input.site_id);

    const supabase = await createServerSupabaseClient();

    const { data: study } = await supabase
      .from('studies')
      .select('id, status')
      .eq('id', input.study_id)
      .eq('company_id', ctx.company.id)
      .maybeSingle();

    if (!study) throw new NotFoundError('Study');
    if ((study as { status: string }).status !== 'active') {
      throw new BusinessRuleError('Subjects can only be created for an active study');
    }

    const { data: studySite } = await supabase
      .from('study_sites')
      .select('id')
      .eq('study_id', input.study_id)
      .eq('site_id', input.site_id)
      .eq('company_id', ctx.company.id)
      .maybeSingle();

    if (!studySite) {
      throw new BusinessRuleError('The selected site is not assigned to this study');
    }

    // GAP-REQ-03: block creation until the study has an approved visit template.
    const hasApprovedTemplate = await VisitTemplateService.hasApprovedTemplate(
      input.study_id,
      ctx.company.id,
    );
    if (!hasApprovedTemplate) {
      throw new BusinessRuleError(
        'This study does not have an approved visit template. Please approve a visit template before creating subjects.',
      );
    }

    const { data, error } = await supabase
      .from('subjects')
      .insert({
        company_id: ctx.company.id,
        site_id: input.site_id,
        study_id: input.study_id,
        subject_number: input.subject_number,
        initials: input.initials ?? null,
        status: 'pre_screening',
        screening_date: input.screening_date ?? null,
        created_by: ctx.user.id,
      })
      .select(SUBJECT_COLUMNS)
      .single();

    if (error || !data) {
      if ((error as { code?: string } | null)?.code === '23505') {
        throw new DuplicateRecordError('subject_number');
      }
      throw new DatabaseError(error?.message ?? 'Failed to create subject');
    }

    const subject = data as Subject;

    await this.addTimelineEvent(
      subject.id,
      ctx.company.id,
      'subject_created',
      new Date().toISOString(),
      `Subject ${subject.subject_number} created`,
      ctx.user.id,
    );

    // BUSINESS_RULES_03 "Create Calendar Events" is deferred — calendar_events ships
    // in Sprint 4 (Visits & Calendar) alongside the full visit lifecycle.
    //
    // Baseline is no longer collected at creation — instead, a placeholder visit is
    // scheduled for the template's designated Baseline item now, and completing it
    // (SubjectService.completeBaselineVisit) records baseline_date and generates the
    // rest of the protocol schedule anchored to that date.
    const { data: template } = await supabase
      .from('visit_templates')
      .select('id')
      .eq('study_id', subject.study_id)
      .eq('company_id', ctx.company.id)
      .eq('status', 'approved')
      .maybeSingle();

    if (template) {
      const { data: baselineItem } = await supabase
        .from('visit_template_items')
        .select(
          'id, template_id, visit_name, visit_order, offset_days, window_before, window_after, visit_type, is_required, is_baseline, notes, created_at, updated_at',
        )
        .eq('template_id', (template as { id: string }).id)
        .eq('is_baseline', true)
        .maybeSingle();

      if (!baselineItem) {
        throw new BusinessRuleError(
          "This study's approved visit template has no Baseline visit configured",
        );
      }

      const item = baselineItem as VisitTemplateItem;
      const { error: visitError } = await supabase.from('visits').insert({
        company_id: ctx.company.id,
        site_id: subject.site_id,
        study_id: subject.study_id,
        subject_id: subject.id,
        visit_template_item_id: item.id,
        visit_name: item.visit_name,
        visit_type: item.visit_type,
        target_date: null,
        window_start: null,
        window_end: null,
        status: 'scheduled',
        created_by: ctx.user.id,
      });
      if (visitError) throw new DatabaseError(visitError.message);

      await this.addTimelineEvent(
        subject.id,
        ctx.company.id,
        'baseline_visit_scheduled',
        new Date().toISOString(),
        `${item.visit_name} visit scheduled — pending completion`,
        ctx.user.id,
      );
    }

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: subject.site_id,
      user_id: ctx.user.id,
      action: 'subject.created',
      module: 'subjects',
      record_type: 'subjects',
      record_id: subject.id,
      new_value: input as unknown as Record<string, unknown>,
    });

    return subject;
  },

  async update(
    subjectId: string,
    input: UpdateSubjectInput,
    ctx: RequestContext,
  ): Promise<Subject> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_subject');

    const subject = await this.getById(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data: updated, error } = await supabase
      .from('subjects')
      .update(input)
      .eq('id', subjectId)
      .eq('company_id', ctx.company.id)
      .select(SUBJECT_COLUMNS)
      .single();

    if (error || !updated) throw new DatabaseError(error?.message ?? 'Failed to update subject');

    const result = updated as Subject;

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: subject.site_id,
      user_id: ctx.user.id,
      action: 'subject.updated',
      module: 'subjects',
      record_type: 'subjects',
      record_id: subjectId,
      old_value: subject as unknown as Record<string, unknown>,
      new_value: input as Record<string, unknown>,
    });

    return result;
  },

  async generateVisitSchedule(subject: Subject, ctx: RequestContext): Promise<Visit[]> {
    if (!subject.baseline_date) return [];

    const supabase = await createServerSupabaseClient();

    const { data: template } = await supabase
      .from('visit_templates')
      .select('id')
      .eq('study_id', subject.study_id)
      .eq('company_id', ctx.company.id)
      .eq('status', 'approved')
      .maybeSingle();

    if (!template) return [];

    const { data: items } = await supabase
      .from('visit_template_items')
      .select(
        'id, template_id, visit_name, visit_order, offset_days, window_before, window_after, visit_type, is_required, is_baseline, notes, created_at, updated_at',
      )
      .eq('template_id', (template as { id: string }).id)
      .order('visit_order');

    // The Baseline item's visit already exists (created as a placeholder at subject
    // creation, then completed via completeBaselineVisit) — never re-generate it here.
    const templateItems = ((items as VisitTemplateItem[]) ?? []).filter(
      (item) => !item.is_baseline,
    );
    if (templateItems.length === 0) return [];

    const rows = templateItems.map((item) => {
      const targetDate = addDaysToDateString(subject.baseline_date as string, item.offset_days);
      return {
        company_id: ctx.company.id,
        site_id: subject.site_id,
        study_id: subject.study_id,
        subject_id: subject.id,
        visit_template_item_id: item.id,
        visit_name: item.visit_name,
        visit_type: item.visit_type,
        target_date: targetDate,
        window_start: addDaysToDateString(targetDate, -item.window_before),
        window_end: addDaysToDateString(targetDate, item.window_after),
        status: 'scheduled',
        created_by: ctx.user.id,
      };
    });

    const { data: inserted, error } = await supabase
      .from('visits')
      .insert(rows)
      .select(VISIT_COLUMNS);
    if (error) throw new DatabaseError(error.message);

    await this.addTimelineEvent(
      subject.id,
      ctx.company.id,
      'visits_generated',
      new Date().toISOString(),
      `${rows.length} scheduled visit(s) generated from the approved visit template`,
      ctx.user.id,
    );

    return (inserted as Visit[]) ?? [];
  },

  async completeBaselineVisit(
    subjectId: string,
    input: CompleteBaselineVisitInput,
    ctx: RequestContext,
  ): Promise<Subject> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_subject');

    const subject = await this.getById(subjectId, ctx);

    if (subject.baseline_date) {
      throw new BusinessRuleError('Baseline visit has already been completed for this subject');
    }

    const supabase = await createServerSupabaseClient();

    const { data: template } = await supabase
      .from('visit_templates')
      .select('id')
      .eq('study_id', subject.study_id)
      .eq('company_id', ctx.company.id)
      .eq('status', 'approved')
      .maybeSingle();

    const { data: baselineItem } = template
      ? await supabase
          .from('visit_template_items')
          .select(
            'id, template_id, visit_name, visit_order, offset_days, window_before, window_after, visit_type, is_required, is_baseline, notes, created_at, updated_at',
          )
          .eq('template_id', (template as { id: string }).id)
          .eq('is_baseline', true)
          .maybeSingle()
      : { data: null };

    if (!baselineItem) {
      throw new BusinessRuleError(
        'This study’s approved visit template has no Baseline visit configured',
      );
    }

    const item = baselineItem as VisitTemplateItem;

    const { data: baselineVisit } = await supabase
      .from('visits')
      .select('id')
      .eq('subject_id', subjectId)
      .eq('company_id', ctx.company.id)
      .eq('visit_template_item_id', item.id)
      .maybeSingle();

    if (!baselineVisit) {
      throw new NotFoundError('Baseline visit');
    }

    const { error: visitError } = await supabase
      .from('visits')
      .update({
        status: 'completed',
        scheduled_date: input.baseline_date,
        target_date: input.baseline_date,
        window_start: addDaysToDateString(input.baseline_date, -item.window_before),
        window_end: addDaysToDateString(input.baseline_date, item.window_after),
      })
      .eq('id', (baselineVisit as { id: string }).id)
      .eq('company_id', ctx.company.id);

    if (visitError) throw new DatabaseError(visitError.message);

    const { data: updated, error } = await supabase
      .from('subjects')
      .update({ baseline_date: input.baseline_date })
      .eq('id', subjectId)
      .eq('company_id', ctx.company.id)
      .select(SUBJECT_COLUMNS)
      .single();

    if (error || !updated) {
      throw new DatabaseError(error?.message ?? 'Failed to record baseline date');
    }

    const result = updated as Subject;

    await this.addTimelineEvent(
      subjectId,
      ctx.company.id,
      'baseline_visit_completed',
      new Date().toISOString(),
      `${item.visit_name} visit completed on ${input.baseline_date}`,
      ctx.user.id,
    );

    await this.generateVisitSchedule(result, ctx);

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: subject.site_id,
      user_id: ctx.user.id,
      action: 'subject.baseline_completed',
      module: 'subjects',
      record_type: 'subjects',
      record_id: subjectId,
      new_value: { baseline_date: input.baseline_date },
    });

    return result;
  },

  async randomize(
    subjectId: string,
    input: RandomizeSubjectInput,
    ctx: RequestContext,
  ): Promise<Subject> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_subject');

    const subject = await this.getById(subjectId, ctx);

    if (subject.randomization_date) {
      throw new BusinessRuleError('Subject has already been randomized');
    }

    if (!isValidStatusTransition(subject.status, 'randomized')) {
      throw new BusinessRuleError(`Cannot randomize a subject with status "${subject.status}"`);
    }

    const supabase = await createServerSupabaseClient();
    const { data: updated, error } = await supabase
      .from('subjects')
      .update({
        randomization_number: input.randomization_number,
        randomization_date: input.randomization_date,
        status: 'randomized',
      })
      .eq('id', subjectId)
      .eq('company_id', ctx.company.id)
      .select(SUBJECT_COLUMNS)
      .single();

    if (error || !updated) {
      throw new DatabaseError(error?.message ?? 'Failed to randomize subject');
    }

    const result = updated as Subject;

    await supabase.from('subject_status_history').insert({
      company_id: ctx.company.id,
      subject_id: subjectId,
      old_status: subject.status,
      new_status: 'randomized',
      changed_by: ctx.user.id,
      reason: `Randomization #${input.randomization_number}`,
    });

    await this.addTimelineEvent(
      subjectId,
      ctx.company.id,
      'randomized',
      new Date().toISOString(),
      `Subject randomized (Randomization #${input.randomization_number})`,
      ctx.user.id,
    );

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: subject.site_id,
      user_id: ctx.user.id,
      action: 'subject.randomized',
      module: 'subjects',
      record_type: 'subjects',
      record_id: subjectId,
      old_value: { status: subject.status },
      new_value: {
        status: 'randomized',
        randomization_number: input.randomization_number,
        randomization_date: input.randomization_date,
      },
    });

    for (const recipientRole of ['pi', 'crc']) {
      await NotificationService.dispatch({
        type: 'subject_status_changed',
        companyId: ctx.company.id,
        siteId: subject.site_id,
        recipientRole,
        relatedModule: 'subjects',
        relatedRecordId: subjectId,
        relatedRecordType: 'subjects',
        context: { subject_number: subject.subject_number, new_status: 'randomized' },
      });
    }

    return result;
  },

  async updateStatus(
    subjectId: string,
    status: SubjectStatus,
    ctx: RequestContext,
    reason?: string,
  ): Promise<Subject> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_subject');

    const subject = await this.getById(subjectId, ctx);

    if (!isValidStatusTransition(subject.status, status)) {
      throw new BusinessRuleError(
        `Cannot change subject status from "${subject.status}" to "${status}"`,
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: updated, error } = await supabase
      .from('subjects')
      .update({ status })
      .eq('id', subjectId)
      .eq('company_id', ctx.company.id)
      .select(SUBJECT_COLUMNS)
      .single();

    if (error || !updated) {
      throw new DatabaseError(error?.message ?? 'Failed to update subject status');
    }

    // GAP-DUP-01: write structured history + narrative timeline + immutable audit log — all three.
    await supabase.from('subject_status_history').insert({
      company_id: ctx.company.id,
      subject_id: subjectId,
      old_status: subject.status,
      new_status: status,
      changed_by: ctx.user.id,
      reason: reason ?? null,
    });

    await this.addTimelineEvent(
      subjectId,
      ctx.company.id,
      'status_changed',
      new Date().toISOString(),
      `Status changed from ${subject.status} to ${status}${reason ? `: ${reason}` : ''}`,
      ctx.user.id,
    );

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: subject.site_id,
      user_id: ctx.user.id,
      action: 'subject.status_changed',
      module: 'subjects',
      record_type: 'subjects',
      record_id: subjectId,
      old_value: { status: subject.status },
      new_value: { status, reason: reason ?? null },
    });

    for (const recipientRole of ['pi', 'crc']) {
      await NotificationService.dispatch({
        type: 'subject_status_changed',
        companyId: ctx.company.id,
        siteId: subject.site_id,
        recipientRole,
        relatedModule: 'subjects',
        relatedRecordId: subjectId,
        relatedRecordType: 'subjects',
        context: { subject_number: subject.subject_number, new_status: status },
      });
    }

    // Analytics recalculation (BUSINESS_RULES_03) deferred — Analytics ships in Sprint 11.

    if (status === 'completed') {
      await this.closeRemainingVisits(subjectId, ctx);
      // Closing remaining charts and completing open subject tasks (BUSINESS_RULES_03
      // "Subject Completion") is deferred — Charts and Task Engine ship in Sprint 5/8.
    }

    return updated as Subject;
  },

  async closeRemainingVisits(subjectId: string, ctx: RequestContext): Promise<void> {
    const supabase = await createServerSupabaseClient();
    await supabase
      .from('visits')
      .update({ status: 'cancelled' })
      .eq('subject_id', subjectId)
      .eq('company_id', ctx.company.id)
      .in('status', ['scheduled', 'confirmed']);
  },

  async addNote(
    subjectId: string,
    note: string,
    ctx: RequestContext,
    visibility: SubjectNoteVisibility = 'internal',
  ): Promise<SubjectNote> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_subject');
    const subject = await this.getById(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('subject_notes')
      .insert({
        company_id: ctx.company.id,
        subject_id: subjectId,
        note,
        visibility,
        created_by: ctx.user.id,
      })
      .select(NOTE_COLUMNS)
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to add note');

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: subject.site_id,
      user_id: ctx.user.id,
      action: 'subject.note_added',
      module: 'subjects',
      record_type: 'subject_notes',
      record_id: (data as SubjectNote).id,
      new_value: { subject_id: subjectId, visibility },
    });

    return data as SubjectNote;
  },

  async listNotes(subjectId: string, ctx: RequestContext): Promise<SubjectNote[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_subjects');
    await this.getById(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('subject_notes')
      .select(NOTE_COLUMNS)
      .eq('subject_id', subjectId)
      .eq('company_id', ctx.company.id)
      .order('created_at', { ascending: false });

    return (data as SubjectNote[]) ?? [];
  },

  async uploadDocument(
    subjectId: string,
    file: File,
    ctx: RequestContext,
    documentType?: string,
  ): Promise<SubjectDocument> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_subject');
    const subject = await this.getById(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const storagePath = `${ctx.company.id}/${subjectId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('subject-documents')
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      throw new DatabaseError(`Document upload failed: ${uploadError.message}`);
    }

    const fileExtension = file.name.includes('.') ? file.name.split('.').pop() : null;

    const { data: fileRow, error: fileError } = await supabase
      .from('files')
      .insert({
        company_id: ctx.company.id,
        file_name: file.name,
        original_name: file.name,
        file_extension: fileExtension,
        mime_type: file.type || null,
        file_size: file.size,
        storage_path: storagePath,
        uploaded_by: ctx.user.id,
      })
      .select('id')
      .single();

    if (fileError || !fileRow) {
      throw new DatabaseError(fileError?.message ?? 'Failed to record uploaded file');
    }

    const { data, error } = await supabase
      .from('subject_documents')
      .insert({
        company_id: ctx.company.id,
        subject_id: subjectId,
        file_id: (fileRow as { id: string }).id,
        document_type: documentType ?? null,
        uploaded_by: ctx.user.id,
      })
      .select(DOCUMENT_COLUMNS)
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to link document');

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: subject.site_id,
      user_id: ctx.user.id,
      action: 'subject.document_uploaded',
      module: 'subjects',
      record_type: 'subject_documents',
      record_id: (data as SubjectDocument).id,
      new_value: { subject_id: subjectId, file_name: file.name },
    });

    return data as SubjectDocument;
  },

  async listDocuments(subjectId: string, ctx: RequestContext): Promise<SubjectDocument[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_subjects');
    await this.getById(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('subject_documents')
      .select(DOCUMENT_COLUMNS)
      .eq('subject_id', subjectId)
      .eq('company_id', ctx.company.id)
      .order('uploaded_at', { ascending: false });

    return (data as SubjectDocument[]) ?? [];
  },

  async listTimeline(subjectId: string, ctx: RequestContext): Promise<SubjectTimelineEvent[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_subjects');
    await this.getById(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('subject_timeline')
      .select(TIMELINE_COLUMNS)
      .eq('subject_id', subjectId)
      .eq('company_id', ctx.company.id)
      .order('event_date', { ascending: false });

    return (data as SubjectTimelineEvent[]) ?? [];
  },

  async addTimelineEvent(
    subjectId: string,
    companyId: string,
    eventType: string,
    eventDate: string,
    description: string,
    userId: string,
    relatedRecordType?: string,
    relatedRecordId?: string,
  ): Promise<void> {
    const supabase = await createServerSupabaseClient();
    await supabase.from('subject_timeline').insert({
      company_id: companyId,
      subject_id: subjectId,
      event_type: eventType,
      event_date: eventDate,
      description,
      related_record_type: relatedRecordType ?? null,
      related_record_id: relatedRecordId ?? null,
      created_by: userId,
    });
  },

  async listStatusHistory(subjectId: string, ctx: RequestContext): Promise<SubjectStatusHistory[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_subjects');
    await this.getById(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('subject_status_history')
      .select(STATUS_HISTORY_COLUMNS)
      .eq('subject_id', subjectId)
      .eq('company_id', ctx.company.id)
      .order('changed_at', { ascending: false });

    return (data as SubjectStatusHistory[]) ?? [];
  },

  async listVisits(subjectId: string, ctx: RequestContext): Promise<Visit[]> {
    await PermissionService.requireAnyPermission(ctx.user.id, ['view_subjects', 'view_visits']);
    await this.getById(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('visits')
      .select(VISIT_COLUMNS)
      .eq('subject_id', subjectId)
      .eq('company_id', ctx.company.id)
      .order('target_date', { ascending: true });

    return (data as Visit[]) ?? [];
  },
};
