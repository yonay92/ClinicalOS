export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';

export type NotificationEventType =
  | 'task_created'
  | 'task_assigned'
  | 'task_overdue'
  | 'task_completed'
  | 'document_expiring'
  | 'document_expired'
  | 'document_uploaded'
  | 'chart_ready'
  | 'chart_overdue'
  | 'visit_out_of_window'
  | 'sponsor_visit_approaching'
  | 'ai_review_pending'
  | 'ai_request_failed'
  | 'subject_status_changed'
  | 'user_invited'
  | 'ai_budget_warning'
  | 'study_activated'
  | 'protocol_amendment'
  | 'business_rule_failed';

export type Notification = {
  id: string;
  company_id: string;
  user_id: string;
  type: NotificationEventType;
  title: string;
  body: string | null;
  related_module: string | null;
  related_record_id: string | null;
  related_record_type: string | null;
  priority: NotificationPriority;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export type NotificationPreference = {
  id: string;
  company_id: string;
  user_id: string;
  event_type: NotificationEventType;
  in_app: boolean;
  email: boolean;
  created_at: string;
  updated_at: string;
};

export type UpdateNotificationPreferenceInput = {
  in_app: boolean;
  email: boolean;
};

export type NotificationDispatchInput = {
  type: NotificationEventType;
  companyId: string;
  siteId?: string;
  recipientRole?: string;
  recipientUserId?: string | null;
  relatedModule?: string;
  relatedRecordId?: string;
  relatedRecordType?: string;
  customTitle?: string;
  customBody?: string;
  priority?: NotificationPriority;
  context?: Record<string, string>;
};
