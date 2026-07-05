export type StudyStatus = 'draft' | 'active' | 'on_hold' | 'closed' | 'archived';

export type Study = {
  id: string;
  company_id: string;
  study_name: string;
  protocol_number: string | null;
  sponsor: string | null;
  cro: string | null;
  phase: string | null;
  therapeutic_area: string | null;
  status: StudyStatus;
  start_date: string | null;
  end_date: string | null;
  protocol_version: string | null;
  ai_generated: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateStudyInput = {
  study_name: string;
  protocol_number?: string;
  sponsor?: string;
  cro?: string;
  phase?: string;
  therapeutic_area?: string;
  start_date?: string;
  end_date?: string;
};

export type UpdateStudyInput = Partial<CreateStudyInput> & {
  status?: StudyStatus;
};

export type StudySiteStatus = 'active' | 'inactive';

export type StudySite = {
  id: string;
  company_id: string;
  study_id: string;
  site_id: string;
  status: StudySiteStatus;
  created_at: string;
};

export type StudyStaffRole =
  | 'pi'
  | 'sub_i'
  | 'crc'
  | 'data_entry'
  | 'regulatory'
  | 'site_director'
  | 'other';

export type StudyStaff = {
  id: string;
  company_id: string;
  study_id: string;
  user_id: string;
  staff_role: StudyStaffRole;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at: string;
};

export type VisitTemplateSource = 'manual' | 'ai_generated' | 'imported';
export type VisitTemplateStatus = 'draft' | 'approved' | 'archived';

export type VisitTemplate = {
  id: string;
  company_id: string;
  study_id: string;
  version: number;
  source: VisitTemplateSource;
  status: VisitTemplateStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VisitType = 'scheduled' | 'unscheduled';

export type VisitTemplateItem = {
  id: string;
  company_id: string;
  template_id: string;
  visit_name: string;
  visit_order: number;
  offset_days: number;
  window_before: number;
  window_after: number;
  visit_type: VisitType;
  is_required: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateVisitTemplateItemInput = {
  visit_name: string;
  visit_order: number;
  offset_days?: number | undefined;
  window_before?: number | undefined;
  window_after?: number | undefined;
  visit_type?: VisitType | undefined;
  is_required?: boolean | undefined;
  notes?: string | undefined;
};

export type VisitTemplateWithItems = VisitTemplate & { items: VisitTemplateItem[] };

export type StudyDocumentType =
  | 'protocol'
  | 'icf'
  | 'investigator_brochure'
  | 'pharmacy_manual'
  | 'laboratory_manual'
  | 'schedule_of_assessments'
  | 'other';

export type StudyDocument = {
  id: string;
  company_id: string;
  study_id: string;
  file_id: string;
  document_type: StudyDocumentType;
  uploaded_by: string | null;
  ai_processed: boolean;
  created_at: string;
};

export type StudyAiExtractionType =
  | 'study_profile'
  | 'visit_template'
  | 'inclusion_criteria'
  | 'exclusion_criteria'
  | 'schedule_of_assessments'
  | 'protocol_amendment_comparison';

export type StudyAiExtraction = {
  id: string;
  company_id: string;
  study_id: string;
  extraction_type: StudyAiExtractionType;
  confidence: number | null;
  extracted_data: Record<string, unknown>;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved: boolean;
  created_at: string;
};

export type FileRecord = {
  id: string;
  company_id: string;
  file_name: string;
  original_name: string | null;
  file_extension: string | null;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string;
  uploaded_by: string | null;
  uploaded_at: string;
  checksum: string | null;
  ai_processed: boolean;
};
