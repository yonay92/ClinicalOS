-- Migration: 015_grant_recruitment_default_permissions.sql
-- Description: Backfills the recruitment permissions introduced in migration
--   014 onto every EXISTING company's Administrator and CRC roles, matching
--   the defaults CompanyService.provision() now grants to any newly
--   provisioned company:
--     - Administrator: all 7 recruitment permissions (view_leads, create_lead,
--       edit_lead, view_lead_phi, edit_lead_phi, convert_lead,
--       manage_referral_sources) — same "PHI included by default" stance as
--       Subject PHI (migration 013).
--     - CRC: the 4 non-PHI operational permissions (view_leads, create_lead,
--       edit_lead, convert_lead) — day-to-day site/subject operations, same
--       reasoning as its existing create_subject/edit_subject grant. Lead PHI
--       is NOT included — same conscious per-role grant as Subject PHI.
--   Code changes alone (migration 014, CompanyService.ts) only affect newly
--   provisioned companies; role_permissions is data that must be backfilled
--   separately for companies that already exist.
--
-- Depends on: 002_roles_permissions.sql (roles, permissions, role_permissions),
--   014_recruitment_and_prescreening.sql (the 7 permission rows this migration grants)
-- Rollback: see ROLLBACK section at the bottom — safe to re-run in either
--   direction; the INSERTs only ever add rows keyed on
--   (company_id, role_id, permission_id) that don't already exist.

INSERT INTO role_permissions (company_id, role_id, permission_id, allowed)
SELECT r.company_id, r.id, p.id, true
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'admin'
  AND p.key IN (
    'view_leads', 'create_lead', 'edit_lead',
    'view_lead_phi', 'edit_lead_phi',
    'convert_lead', 'manage_referral_sources'
  )
ON CONFLICT (company_id, role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (company_id, role_id, permission_id, allowed)
SELECT r.company_id, r.id, p.id, true
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'crc'
  AND p.key IN ('view_leads', 'create_lead', 'edit_lead', 'convert_lead')
ON CONFLICT (company_id, role_id, permission_id) DO NOTHING;

-- ============================================================
-- ROLLBACK
-- Only removes rows for the 'admin'/'crc' role keys — never touches any
-- other role's (e.g. a company-granted Regulatory or PI) recruitment grants.
--
-- DELETE FROM role_permissions
-- WHERE role_id IN (SELECT id FROM roles WHERE key IN ('admin', 'crc'))
--   AND permission_id IN (
--     SELECT id FROM permissions WHERE key IN (
--       'view_leads', 'create_lead', 'edit_lead', 'view_lead_phi',
--       'edit_lead_phi', 'convert_lead', 'manage_referral_sources'
--     )
--   );
-- ============================================================
