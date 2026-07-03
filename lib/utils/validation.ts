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

// ── Invitations list filter ───────────────────────────────────────────────────

export const listInvitationsSchema = z.object({
  status: z.enum(['pending', 'accepted', 'expired', 'revoked']).optional(),
});
