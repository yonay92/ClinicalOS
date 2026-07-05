import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────────────────────────────

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type SignInSchema = z.infer<typeof signInSchema>;

// ── Invitations ───────────────────────────────────────────────────────────────

export const sendInvitationSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  role_ids: z.array(z.string().uuid('Invalid role ID')).min(1, 'At least one role is required'),
  site_ids: z.array(z.string().uuid('Invalid site ID')),
});

export type SendInvitationSchema = z.infer<typeof sendInvitationSchema>;

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const acceptInvitationSchema = z.object({
  token: z
    .string()
    .length(64, 'Invalid invitation token')
    .regex(/^[0-9a-f]+$/, 'Invalid invitation token format'),
  full_name: z.string().min(2, 'Full name is required').max(200).trim(),
  password: passwordSchema,
});

export type AcceptInvitationSchema = z.infer<typeof acceptInvitationSchema>;

export const validateTokenSchema = z.object({
  token: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]+$/),
});

// ── Users ─────────────────────────────────────────────────────────────────────

export const updateUserSchema = z.object({
  full_name: z.string().min(2).max(200).trim().optional(),
  phone: z.string().max(20).trim().nullable().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

export type UpdateUserSchema = z.infer<typeof updateUserSchema>;

// ── Sites ─────────────────────────────────────────────────────────────────────

export const createSiteSchema = z.object({
  name: z.string().min(1, 'Site name is required').max(200).trim(),
  site_code: z.string().max(50).trim().optional(),
  address: z.string().max(500).trim().optional(),
  city: z.string().max(100).trim().optional(),
  state: z.string().max(100).trim().optional(),
  zip_code: z.string().max(20).trim().optional(),
  phone: z.string().max(20).trim().optional(),
});

export type CreateSiteSchema = z.infer<typeof createSiteSchema>;

export const updateSiteSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  site_code: z.string().max(50).trim().optional(),
  address: z.string().max(500).trim().optional(),
  city: z.string().max(100).trim().optional(),
  state: z.string().max(100).trim().optional(),
  zip_code: z.string().max(20).trim().optional(),
  phone: z.string().max(20).trim().optional(),
  status: z.enum(['active', 'inactive', 'closed']).optional(),
});

export type UpdateSiteSchema = z.infer<typeof updateSiteSchema>;

// ── Company ───────────────────────────────────────────────────────────────────

export const updateCompanySettingsSchema = z.object({
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
    .optional(),
  secondary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
    .optional(),
  default_timezone: z.string().max(100).optional(),
  date_format: z.enum(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']).optional(),
  language: z.string().max(10).optional(),
  enable_ai: z.boolean().optional(),
  enable_task_center: z.boolean().optional(),
});

export type UpdateCompanySettingsSchema = z.infer<typeof updateCompanySettingsSchema>;

// ── Notifications ─────────────────────────────────────────────────────────────

export const updateNotificationPreferenceSchema = z.object({
  in_app: z.boolean(),
  email: z.boolean(),
});

export type UpdateNotificationPreferenceSchema = z.infer<typeof updateNotificationPreferenceSchema>;

export const getNotificationsSchema = z.object({
  is_read: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default('50'),
});

// ── Studies ───────────────────────────────────────────────────────────────────

export const createStudySchema = z.object({
  study_name: z.string().min(1, 'Study name is required').max(300).trim(),
  protocol_number: z.string().max(100).trim().optional(),
  sponsor: z.string().max(200).trim().optional(),
  cro: z.string().max(200).trim().optional(),
  phase: z.string().max(50).trim().optional(),
  therapeutic_area: z.string().max(200).trim().optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
});

export type CreateStudySchema = z.infer<typeof createStudySchema>;

export const updateStudySchema = z.object({
  study_name: z.string().min(1).max(300).trim().optional(),
  protocol_number: z.string().max(100).trim().optional(),
  sponsor: z.string().max(200).trim().optional(),
  cro: z.string().max(200).trim().optional(),
  phase: z.string().max(50).trim().optional(),
  therapeutic_area: z.string().max(200).trim().optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  status: z.enum(['draft', 'active', 'on_hold', 'closed', 'archived']).optional(),
});

export type UpdateStudySchema = z.infer<typeof updateStudySchema>;

export const assignSitesSchema = z.object({
  site_ids: z.array(z.string().uuid('Invalid site ID')).min(1, 'At least one site is required'),
});

export type AssignSitesSchema = z.infer<typeof assignSitesSchema>;

export const approveAiExtractionSchema = z.object({
  extraction_id: z.string().uuid('Invalid extraction ID'),
});

export type ApproveAiExtractionSchema = z.infer<typeof approveAiExtractionSchema>;

// ── Visit Templates ───────────────────────────────────────────────────────────

export const visitTemplateItemSchema = z.object({
  visit_name: z.string().min(1, 'Visit name is required').max(200).trim(),
  visit_order: z.number().int().min(0),
  offset_days: z.number().int().optional(),
  window_before: z.number().int().min(0).optional(),
  window_after: z.number().int().min(0).optional(),
  visit_type: z.enum(['scheduled', 'unscheduled']).optional(),
  is_required: z.boolean().optional(),
  notes: z.string().max(1000).trim().optional(),
});

export const createVisitTemplateSchema = z.object({
  items: z.array(visitTemplateItemSchema).min(1, 'At least one visit is required'),
});

export type CreateVisitTemplateSchema = z.infer<typeof createVisitTemplateSchema>;

// ── Subjects ──────────────────────────────────────────────────────────────────

export const createSubjectSchema = z.object({
  site_id: z.string().uuid('Invalid site ID'),
  study_id: z.string().uuid('Invalid study ID'),
  subject_number: z.string().min(1, 'Subject number is required').max(50).trim(),
  initials: z.string().max(10).trim().optional(),
  screening_date: z.string().date().optional(),
  baseline_date: z.string().date().optional(),
  randomization_date: z.string().date().optional(),
});

export type CreateSubjectSchema = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  initials: z.string().max(10).trim().optional(),
  screening_date: z.string().date().optional(),
  baseline_date: z.string().date().optional(),
  randomization_date: z.string().date().optional(),
  end_of_study_date: z.string().date().optional(),
});

export type UpdateSubjectSchema = z.infer<typeof updateSubjectSchema>;

export const changeSubjectStatusSchema = z.object({
  status: z.enum([
    'pre_screening',
    'screening',
    'screen_failed',
    'randomized',
    'active',
    'completed',
    'early_terminated',
    'lost_to_follow_up',
  ]),
  reason: z.string().max(1000).trim().optional(),
});

export type ChangeSubjectStatusSchema = z.infer<typeof changeSubjectStatusSchema>;

export const addSubjectNoteSchema = z.object({
  note: z.string().min(1, 'Note text is required').max(5000).trim(),
  visibility: z.enum(['internal', 'crc_only', 'admin_only']).optional(),
});

export type AddSubjectNoteSchema = z.infer<typeof addSubjectNoteSchema>;

export const listSubjectsSchema = z.object({
  study_id: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(),
  status: z
    .enum([
      'pre_screening',
      'screening',
      'screen_failed',
      'randomized',
      'active',
      'completed',
      'early_terminated',
      'lost_to_follow_up',
    ])
    .optional(),
  subject_number: z.string().max(50).optional(),
});

// ── Invitations list filter ───────────────────────────────────────────────────

export const listInvitationsSchema = z.object({
  status: z.enum(['pending', 'accepted', 'expired', 'revoked']).optional(),
});
