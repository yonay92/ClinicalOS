-- Migration: 013_grant_admin_phi_permissions.sql
-- Description: Product decision — view_subject_phi / edit_subject_phi are now
--   part of the Administrator role's default permission grant, reversing the
--   "excluded like reopen_visit/force_archive_*" stance from migration 012.
--   Other roles are unaffected: they still require a conscious per-role grant
--   via Settings > Roles, same override mechanism as before.
--
--   This migration backfills every EXISTING company's Administrator role
--   (roles.key = 'admin') with both permissions. New companies get this
--   automatically from CompanyService.provision() / bootstrap_admin.sql,
--   both updated in the same change as this migration — this file exists
--   only to bring already-provisioned companies in line with that new
--   default, since role_permissions is data, not something a code change
--   alone can retroactively grant.
--
-- Depends on: 002_roles_permissions.sql (roles, permissions, role_permissions),
--   012_subject_contact_info_and_appointment_confirmation.sql (the two
--   permission rows this migration grants)
-- Rollback: see ROLLBACK section at the bottom — safe to re-run in either
--   direction; the INSERT only ever adds rows keyed on
--   (company_id, role_id, permission_id) that don't already exist, so running
--   it twice never duplicates or errors.

INSERT INTO role_permissions (company_id, role_id, permission_id, allowed)
SELECT r.company_id, r.id, p.id, true
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'admin'
  AND p.key IN ('view_subject_phi', 'edit_subject_phi')
ON CONFLICT (company_id, role_id, permission_id) DO NOTHING;

-- ============================================================
-- ROLLBACK
-- Reverts every company's Administrator role back to excluding PHI access —
-- only removes rows for the 'admin' role key, never touches any other role's
-- (e.g. a company-granted CRC) view_subject_phi/edit_subject_phi grants.
--
-- DELETE FROM role_permissions
-- WHERE role_id IN (SELECT id FROM roles WHERE key = 'admin')
--   AND permission_id IN (
--     SELECT id FROM permissions WHERE key IN ('view_subject_phi', 'edit_subject_phi')
--   );
-- ============================================================
