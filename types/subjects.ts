export type SubjectStatus =
  | 'pre_screening'
  | 'screening'
  | 'screen_failed'
  | 'randomized'
  | 'active'
  | 'completed'
  | 'early_terminated'
  | 'lost_to_follow_up';

export type Subject = {
  id: string;
  company_id: string;
  site_id: string;
  study_id: string;
  subject_number: string;
  initials: string | null;
  status: SubjectStatus;
  screening_date: string | null;
  baseline_date: string | null;
  randomization_date: string | null;
  end_of_study_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateSubjectInput = {
  site_id: string;
  study_id: string;
  subject_number: string;
  initials?: string;
  screening_date?: string;
  baseline_date?: string;
  randomization_date?: string;
};

export type UpdateSubjectInput = Partial<
  Pick<CreateSubjectInput, 'initials' | 'screening_date' | 'baseline_date' | 'randomization_date'>
> & {
  end_of_study_date?: string;
};

export type SubjectStatusHistory = {
  id: string;
  company_id: string;
  subject_id: string;
  old_status: SubjectStatus | null;
  new_status: SubjectStatus;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
};

export type SubjectNoteVisibility = 'internal' | 'crc_only' | 'admin_only';

export type SubjectNote = {
  id: string;
  company_id: string;
  subject_id: string;
  note: string;
  visibility: SubjectNoteVisibility;
  created_by: string | null;
  created_at: string;
};

export type SubjectDocument = {
  id: string;
  company_id: string;
  subject_id: string;
  file_id: string;
  document_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string | null;
};

export type SubjectMilestoneType =
  | 'consent_signed'
  | 'screening'
  | 'randomized'
  | 'first_dose'
  | 'last_dose'
  | 'end_of_treatment'
  | 'end_of_study';

export type SubjectMilestone = {
  id: string;
  company_id: string;
  subject_id: string;
  milestone_type: SubjectMilestoneType;
  milestone_date: string;
  created_by: string | null;
  created_at: string;
};

export type SubjectTimelineEvent = {
  id: string;
  company_id: string;
  subject_id: string;
  event_type: string;
  event_date: string;
  description: string | null;
  related_record_type: string | null;
  related_record_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type VisitType = 'scheduled' | 'unscheduled';

export type VisitStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'missed'
  | 'rescheduled'
  | 'cancelled'
  | 'out_of_window';

export type Visit = {
  id: string;
  company_id: string;
  site_id: string;
  study_id: string;
  subject_id: string;
  visit_template_item_id: string | null;
  visit_name: string;
  visit_type: VisitType;
  target_date: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  status: VisitStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
