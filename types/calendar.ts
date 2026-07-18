export type CalendarEventType =
  | 'patient_visit'
  | 'monitoring_visit'
  | 'sponsor_visit'
  | 'investigator_meeting'
  | 'staff_meeting'
  | 'training';

export type CalendarEventStatus =
  'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export type CalendarEvent = {
  id: string;
  company_id: string;
  site_id: string;
  event_type: CalendarEventType;
  title: string;
  description: string | null;
  start_datetime: string;
  end_datetime: string | null;
  related_record_type: string | null;
  related_record_id: string | null;
  status: CalendarEventStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Optional display-enrichment, batched in by listCalendarEvents from the
  // linked visit/subject (calendar_events itself has no FK to visits — see
  // VisitService.listCalendarEvents). Absent for non-'visits' event types.
  related_subject_id?: string | undefined;
  related_subject_number?: string | undefined;
  related_study_id?: string | undefined;
};

export type CalendarViewMode = 'month' | 'week' | 'day';

export type ListCalendarEventsFilters = {
  start: string;
  end: string;
  site_id?: string | undefined;
  study_id?: string | undefined;
  status?: CalendarEventStatus | undefined;
  crc_user_id?: string | undefined;
};
