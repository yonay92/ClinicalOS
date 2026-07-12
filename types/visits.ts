import type { VisitStatus } from './subjects';

export type VisitHistory = {
  id: string;
  company_id: string;
  visit_id: string;
  old_status: VisitStatus | null;
  new_status: VisitStatus;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
};

export type VisitNote = {
  id: string;
  company_id: string;
  visit_id: string;
  note: string;
  created_by: string | null;
  created_at: string;
};

export type ConfirmVisitInput = Record<string, never>;

export type StartVisitInput = Record<string, never>;

export type RescheduleVisitInput = {
  target_date: string;
  reason: string;
};

export type CancelVisitInput = {
  reason: string;
};

export type ReopenVisitInput = {
  reason: string;
};

export type CreateUnscheduledVisitInput = {
  visit_name: string;
  target_date: string;
  notes?: string | undefined;
};
