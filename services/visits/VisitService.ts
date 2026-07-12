import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotFoundError, DatabaseError, BusinessRuleError } from '@/lib/api/errors';
import type {
  RescheduleVisitInput,
  CancelVisitInput,
  ReopenVisitInput,
  CreateUnscheduledVisitInput,
} from '@/types/visits';
import type { Visit } from '@/types/subjects';
import type { CalendarEvent, ListCalendarEventsFilters } from '@/types/calendar';
import type { RequestContext } from '@/types/api';

const VISIT_COLUMNS =
  'id, company_id, site_id, study_id, subject_id, visit_template_item_id, visit_name, visit_type, target_date, scheduled_date, window_start, window_end, status, created_by, created_at, updated_at';
const CALENDAR_EVENT_COLUMNS =
  'id, company_id, site_id, event_type, title, description, start_datetime, end_datetime, related_record_type, related_record_id, status, created_by, created_at, updated_at';

async function getVisitOrThrow(
  subjectId: string,
  visitId: string,
  ctx: RequestContext,
): Promise<Visit> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('visits')
    .select(VISIT_COLUMNS)
    .eq('id', visitId)
    .eq('subject_id', subjectId)
    .eq('company_id', ctx.company.id)
    .single();

  if (error || !data) throw new NotFoundError('Visit');
  return data as Visit;
}

async function writeVisitTransition(
  visit: Visit,
  newStatus: Visit['status'],
  ctx: RequestContext,
  options: { reason?: string | null; auditAction: string; timelineDescription: string },
): Promise<Visit> {
  const supabase = await createServerSupabaseClient();

  const { data: updated, error } = await supabase
    .from('visits')
    .update({ status: newStatus })
    .eq('id', visit.id)
    .eq('company_id', ctx.company.id)
    .select(VISIT_COLUMNS)
    .single();

  if (error || !updated) throw new DatabaseError(error?.message ?? 'Failed to update visit');

  // GAP-DUP-01 three-way write, same pattern as subject_status_history /
  // subject_timeline / audit_logs for subject status changes.
  await supabase.from('visit_history').insert({
    company_id: ctx.company.id,
    visit_id: visit.id,
    old_status: visit.status,
    new_status: newStatus,
    changed_by: ctx.user.id,
    reason: options.reason ?? null,
  });

  await addSubjectTimelineEvent(
    visit.subject_id,
    ctx.company.id,
    'visit_status_changed',
    options.timelineDescription,
    ctx.user.id,
    visit.id,
  );

  await AuditService.log({
    company_id: ctx.company.id,
    site_id: visit.site_id,
    user_id: ctx.user.id,
    action: options.auditAction,
    module: 'subjects',
    record_type: 'visits',
    record_id: visit.id,
    old_value: { status: visit.status },
    new_value: { status: newStatus, reason: options.reason ?? null },
  });

  return updated as Visit;
}

// Deliberately does not import SubjectService.addTimelineEvent — VisitService must
// have zero import dependency on SubjectService so SubjectService can import
// VisitService (for createCalendarEventsForVisits) without a circular dependency.
async function addSubjectTimelineEvent(
  subjectId: string,
  companyId: string,
  eventType: string,
  description: string,
  userId: string,
  relatedRecordId?: string,
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from('subject_timeline').insert({
    company_id: companyId,
    subject_id: subjectId,
    event_type: eventType,
    event_date: new Date().toISOString(),
    description,
    related_record_type: relatedRecordId ? 'visits' : null,
    related_record_id: relatedRecordId ?? null,
    created_by: userId,
  });
}

async function getSubjectSiteContext(
  subjectId: string,
  ctx: RequestContext,
): Promise<{ site_id: string; study_id: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('subjects')
    .select('site_id, study_id')
    .eq('id', subjectId)
    .eq('company_id', ctx.company.id)
    .single();

  if (error || !data) throw new NotFoundError('Subject');
  return data as { site_id: string; study_id: string };
}

async function updateLinkedCalendarEventStatus(
  visitId: string,
  ctx: RequestContext,
  status: CalendarEvent['status'],
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase
    .from('calendar_events')
    .update({ status })
    .eq('related_record_type', 'visits')
    .eq('related_record_id', visitId)
    .eq('company_id', ctx.company.id);
}

export const VisitService = {
  async confirmVisit(subjectId: string, visitId: string, ctx: RequestContext): Promise<Visit> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_visits');

    const visit = await getVisitOrThrow(subjectId, visitId, ctx);
    if (visit.status !== 'scheduled') {
      throw new BusinessRuleError('Only a Scheduled visit can be confirmed');
    }

    const updated = await writeVisitTransition(visit, 'confirmed', ctx, {
      auditAction: 'visit.confirmed',
      timelineDescription: `${visit.visit_name} visit confirmed`,
    });

    await updateLinkedCalendarEventStatus(visitId, ctx, 'confirmed');

    return updated;
  },

  async startVisit(subjectId: string, visitId: string, ctx: RequestContext): Promise<Visit> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_visits');

    const visit = await getVisitOrThrow(subjectId, visitId, ctx);
    if (visit.status !== 'confirmed') {
      throw new BusinessRuleError('Only a Confirmed visit can be started');
    }

    return writeVisitTransition(visit, 'in_progress', ctx, {
      auditAction: 'visit.started',
      timelineDescription: `${visit.visit_name} visit started`,
    });
  },

  async rescheduleVisit(
    subjectId: string,
    visitId: string,
    input: RescheduleVisitInput,
    ctx: RequestContext,
  ): Promise<Visit> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_visits');

    const visit = await getVisitOrThrow(subjectId, visitId, ctx);
    if (visit.status !== 'scheduled' && visit.status !== 'confirmed') {
      throw new BusinessRuleError('Only a Scheduled or Confirmed visit can be rescheduled');
    }

    const supabase = await createServerSupabaseClient();

    let windowBefore = 0;
    let windowAfter = 0;
    if (visit.visit_template_item_id) {
      const { data: item } = await supabase
        .from('visit_template_items')
        .select('window_before, window_after')
        .eq('id', visit.visit_template_item_id)
        .maybeSingle();
      if (item) {
        const row = item as { window_before: number; window_after: number };
        windowBefore = row.window_before;
        windowAfter = row.window_after;
      }
    } else if (visit.window_start && visit.target_date) {
      windowBefore = Math.round(
        (new Date(visit.target_date).getTime() - new Date(visit.window_start).getTime()) /
          86_400_000,
      );
    } else if (visit.window_end && visit.target_date) {
      windowAfter = Math.round(
        (new Date(visit.window_end).getTime() - new Date(visit.target_date).getTime()) / 86_400_000,
      );
    }

    const targetDate = input.target_date;
    const toDateString = (base: string, days: number): string => {
      const d = new Date(`${base}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };

    const { data: updated, error } = await supabase
      .from('visits')
      .update({
        target_date: targetDate,
        window_start: toDateString(targetDate, -windowBefore),
        window_end: toDateString(targetDate, windowAfter),
      })
      .eq('id', visitId)
      .eq('company_id', ctx.company.id)
      .select(VISIT_COLUMNS)
      .single();

    if (error || !updated) throw new DatabaseError(error?.message ?? 'Failed to reschedule visit');

    await supabase.from('visit_notes').insert({
      company_id: ctx.company.id,
      visit_id: visitId,
      note: `Rescheduled from ${visit.target_date ?? 'unset'} to ${targetDate}: ${input.reason}`,
      created_by: ctx.user.id,
    });

    await addSubjectTimelineEvent(
      subjectId,
      ctx.company.id,
      'visit_rescheduled',
      `${visit.visit_name} visit rescheduled to ${targetDate}: ${input.reason}`,
      ctx.user.id,
      visitId,
    );

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: visit.site_id,
      user_id: ctx.user.id,
      action: 'visit.rescheduled',
      module: 'subjects',
      record_type: 'visits',
      record_id: visitId,
      old_value: { target_date: visit.target_date },
      new_value: { target_date: targetDate, reason: input.reason },
    });

    const startDatetime = `${targetDate}T00:00:00Z`;
    await supabase
      .from('calendar_events')
      .update({ start_datetime: startDatetime, end_datetime: startDatetime })
      .eq('related_record_type', 'visits')
      .eq('related_record_id', visitId)
      .eq('company_id', ctx.company.id);

    return updated as Visit;
  },

  async cancelVisit(
    subjectId: string,
    visitId: string,
    input: CancelVisitInput,
    ctx: RequestContext,
  ): Promise<Visit> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_visits');

    const visit = await getVisitOrThrow(subjectId, visitId, ctx);
    if (!['scheduled', 'confirmed', 'in_progress'].includes(visit.status)) {
      throw new BusinessRuleError(
        'Only a Scheduled, Confirmed, or In Progress visit can be cancelled',
      );
    }

    const updated = await writeVisitTransition(visit, 'cancelled', ctx, {
      reason: input.reason,
      auditAction: 'visit.cancelled',
      timelineDescription: `${visit.visit_name} visit cancelled: ${input.reason}`,
    });

    await updateLinkedCalendarEventStatus(visitId, ctx, 'cancelled');

    return updated;
  },

  async reopenVisit(
    subjectId: string,
    visitId: string,
    input: ReopenVisitInput,
    ctx: RequestContext,
  ): Promise<Visit> {
    const visit = await getVisitOrThrow(subjectId, visitId, ctx);
    if (visit.status !== 'completed') {
      throw new BusinessRuleError('Only a Completed visit can be reopened');
    }

    // Reopening a completed visit is always the dangerous case — unlike
    // archiveStudy/archiveSite (conditionally blocked on enrolled-subject count),
    // there is no "safe" path here, so `blocked` is unconditionally true.
    await PermissionService.guardDangerousOperation(ctx.user.id, 'reopen_visit', {
      blocked: true,
      reason: input.reason,
      blockedMessage:
        'Reopening a completed visit requires the Reopen Visit permission and a reason.',
    });

    const updated = await writeVisitTransition(visit, 'in_progress', ctx, {
      reason: input.reason,
      auditAction: 'visit.reopened',
      timelineDescription: `${visit.visit_name} visit reopened: ${input.reason}`,
    });

    await updateLinkedCalendarEventStatus(visitId, ctx, 'scheduled');

    return updated;
  },

  async createUnscheduledVisit(
    subjectId: string,
    input: CreateUnscheduledVisitInput,
    ctx: RequestContext,
  ): Promise<Visit> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_visits');

    const subject = await getSubjectSiteContext(subjectId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('visits')
      .insert({
        company_id: ctx.company.id,
        site_id: subject.site_id,
        study_id: subject.study_id,
        subject_id: subjectId,
        visit_template_item_id: null,
        visit_name: input.visit_name,
        visit_type: 'unscheduled',
        target_date: input.target_date,
        window_start: input.target_date,
        window_end: input.target_date,
        status: 'scheduled',
        created_by: ctx.user.id,
      })
      .select(VISIT_COLUMNS)
      .single();

    if (error || !data) {
      throw new DatabaseError(error?.message ?? 'Failed to create unscheduled visit');
    }

    const visit = data as Visit;

    if (input.notes?.trim()) {
      await supabase.from('visit_notes').insert({
        company_id: ctx.company.id,
        visit_id: visit.id,
        note: input.notes.trim(),
        created_by: ctx.user.id,
      });
    }

    await this.createCalendarEventsForVisits([visit], ctx);

    await addSubjectTimelineEvent(
      subjectId,
      ctx.company.id,
      'unscheduled_visit_created',
      `Unscheduled visit "${visit.visit_name}" added for ${input.target_date}`,
      ctx.user.id,
      visit.id,
    );

    await AuditService.log({
      company_id: ctx.company.id,
      site_id: subject.site_id,
      user_id: ctx.user.id,
      action: 'visit.unscheduled_created',
      module: 'subjects',
      record_type: 'visits',
      record_id: visit.id,
      new_value: { visit_name: visit.visit_name, target_date: input.target_date },
    });

    // Chart/Task creation on completion (docs/BUSINESS_RULES_04_Visits.md) is
    // deferred — Charts and Task Engine ship in Sprint 5/8, same as the
    // equivalent deferred-comments in SubjectService.

    return visit;
  },

  // Resolves a bare visit ID with no subject in the path — needed by the Calendar
  // page, which only has calendar_events.related_record_id (a visit ID) to work
  // from, not the owning subject. Every subject-scoped visit action route requires
  // a subjectId, so the Calendar detail panel fetches the full visit (including
  // its subject_id) once here before delegating to those same routes.
  async getVisitById(visitId: string, ctx: RequestContext): Promise<Visit> {
    await PermissionService.requirePermission(ctx.user.id, 'view_visits');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('visits')
      .select(VISIT_COLUMNS)
      .eq('id', visitId)
      .eq('company_id', ctx.company.id)
      .single();

    if (error || !data) throw new NotFoundError('Visit');
    return data as Visit;
  },

  // Shared by SubjectService.create/generateVisitSchedule (scheduled visits) and
  // createUnscheduledVisit — no dependency on anything else in this service.
  async createCalendarEventsForVisits(visits: Visit[], ctx: RequestContext): Promise<void> {
    if (visits.length === 0) return;

    const supabase = await createServerSupabaseClient();
    // calendar_events.start_datetime is NOT NULL — a placeholder visit with no
    // target_date yet (e.g. Screening/Baseline before the Baseline visit is
    // completed) genuinely has nothing to schedule on the calendar. Its event is
    // created once generateVisitSchedule anchors it to a real date.
    const rows = visits
      .filter((v) => v.target_date)
      .map((v) => ({
        company_id: ctx.company.id,
        site_id: v.site_id,
        event_type: 'patient_visit' as const,
        title: v.visit_name,
        description: null,
        start_datetime: `${v.target_date}T00:00:00Z`,
        end_datetime: `${v.target_date}T00:00:00Z`,
        related_record_type: 'visits',
        related_record_id: v.id,
        status: 'scheduled' as const,
        created_by: ctx.user.id,
      }));

    if (rows.length === 0) return;

    const { error } = await supabase.from('calendar_events').insert(rows);
    if (error) throw new DatabaseError(error.message);
  },

  async listCalendarEvents(
    filters: ListCalendarEventsFilters,
    ctx: RequestContext,
  ): Promise<CalendarEvent[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_visits');

    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from('calendar_events')
      .select(CALENDAR_EVENT_COLUMNS)
      .eq('company_id', ctx.company.id)
      .gte('start_datetime', `${filters.start}T00:00:00Z`)
      .lte('start_datetime', `${filters.end}T23:59:59Z`);

    if (filters.site_id) query = query.eq('site_id', filters.site_id);

    const { data } = await query.order('start_datetime', { ascending: true });
    return (data as CalendarEvent[]) ?? [];
  },
};
