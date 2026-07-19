export type LeadStatus =
  'new' | 'contacted' | 'prescreening' | 'waitlisted' | 'converted' | 'declined' | 'lost';

export type Lead = {
  id: string;
  company_id: string;
  site_id: string | null;
  study_id: string | null;
  referral_source_id: string | null;
  initials: string | null;
  status: LeadStatus;
  contact_attempt_count: number;
  last_contacted_at: string | null;
  next_contact_at: string | null;
  waitlisted_at: string | null;
  converted_subject_id: string | null;
  converted_at: string | null;
  declined_reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateLeadInput = {
  site_id?: string | undefined;
  study_id?: string | undefined;
  referral_source_id?: string | undefined;
};

export type UpdateLeadInput = Partial<{
  site_id: string | null;
  study_id: string | null;
  referral_source_id: string | null;
}>;

export type LeadPreferredContactMethod = 'phone' | 'email' | 'sms';

export type LeadContactInfo = {
  id: string;
  company_id: string;
  site_id: string | null;
  lead_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  sex: string | null;
  phone_primary: string;
  phone_secondary: string | null;
  email: string | null;
  preferred_contact_method: LeadPreferredContactMethod;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type UpsertLeadContactInfoInput = {
  first_name: string;
  last_name: string;
  date_of_birth?: string | undefined;
  sex?: string | undefined;
  phone_primary: string;
  phone_secondary?: string | undefined;
  email?: string | undefined;
  preferred_contact_method: LeadPreferredContactMethod;
};

export type LeadContactLogEntry = {
  id: string;
  company_id: string;
  lead_id: string;
  contact_method: string | null;
  old_status: string | null;
  new_status: string;
  notes: string | null;
  contacted_by: string | null;
  contacted_at: string;
};

export type LogLeadContactInput = {
  new_status: LeadStatus;
  contact_method?: string | undefined;
  notes?: string | undefined;
  next_contact_at?: string | undefined;
};

export type ReferralSourceCategory =
  | 'physician_referral'
  | 'advertisement'
  | 'patient_database'
  | 'self_referral'
  | 'social_media'
  | 'other';

export type ReferralSource = {
  id: string;
  company_id: string;
  name: string;
  category: ReferralSourceCategory;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateReferralSourceInput = {
  name: string;
  category: ReferralSourceCategory;
};

export type UpdateReferralSourceInput = Partial<CreateReferralSourceInput> & {
  active?: boolean;
};

export type PrescreeningQuestionType = 'yes_no' | 'number' | 'text';

export type StudyPrescreeningQuestion = {
  id: string;
  company_id: string;
  study_id: string;
  question_order: number;
  question_text: string;
  question_type: PrescreeningQuestionType;
  eligible_answer: string | null;
  min_eligible_value: number | null;
  max_eligible_value: number | null;
  is_hard_exclusion: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatePrescreeningQuestionInput = {
  question_order: number;
  question_text: string;
  question_type: PrescreeningQuestionType;
  eligible_answer?: string | undefined;
  min_eligible_value?: number | undefined;
  max_eligible_value?: number | undefined;
  is_hard_exclusion?: boolean | undefined;
};

export type UpdatePrescreeningQuestionInput = Partial<
  Omit<CreatePrescreeningQuestionInput, 'question_type'>
> & {
  is_active?: boolean | undefined;
};

export type PrescreeningOutcome = 'potentially_eligible' | 'needs_review' | 'not_eligible';

export type LeadPrescreening = {
  id: string;
  company_id: string;
  lead_id: string;
  study_id: string;
  computed_outcome: PrescreeningOutcome;
  manual_outcome: PrescreeningOutcome | null;
  manual_override_reason: string | null;
  manual_override_by: string | null;
  manual_override_at: string | null;
  completed_by: string | null;
  completed_at: string;
};

export type LeadPrescreeningAnswer = {
  id: string;
  company_id: string;
  lead_prescreening_id: string;
  question_id: string | null;
  question_text: string;
  question_type: PrescreeningQuestionType;
  answer_value: string;
  is_eligible_answer: boolean | null;
};

export type SubmitPrescreeningAnswerInput = {
  question_id: string;
  answer_value: string;
};

export type SubmitPrescreeningInput = {
  study_id: string;
  answers: SubmitPrescreeningAnswerInput[];
};

export type OverridePrescreeningInput = {
  manual_outcome: PrescreeningOutcome;
  manual_override_reason: string;
};

export type LeadPrescreeningWithAnswers = LeadPrescreening & {
  answers: LeadPrescreeningAnswer[];
};

export type RecruitmentFunnelCounts = Record<LeadStatus, number>;

export type RecruitmentDashboard = {
  funnel: RecruitmentFunnelCounts;
  total_leads: number;
  conversion_rate: number;
  by_referral_source: Array<{ referral_source_id: string | null; name: string; count: number }>;
};
