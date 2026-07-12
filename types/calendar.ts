export type CalendarEventType =
  | 'patient_visit'
  | 'monitoring_visit'
  | 'sponsor_visit'
  | 'investigator_meeting'
  | 'staff_meeting'
  | 'training';

export type CalendarEventStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled';

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
};

export type CalendarViewMode = 'month' | 'week' | 'day';

export type ListCalendarEventsFilters = {
  start: string;
  end: string;
  site_id?: string | undefined;
};
