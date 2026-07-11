-- Migration: 006_study_archive_and_role_permission_management.sql
-- Description: Adds the Archive Study workflow's "Super Admin" override permission
--   (force_archive_study — deliberately NOT granted to the admin role by default,
--   so a company owner must consciously elevate a role) and the RLS write policies
--   needed to actually grant it from Settings > Roles (role_permissions previously
--   had no INSERT/UPDATE policy at all).
-- Depends on: 002_roles_permissions.sql (roles, permissions, role_permissions)
-- Rollback: see ROLLBACK section at the bottom

-- ============================================================
-- PERMISSIONS — force_archive_study
-- Not inserted into role_permissions for any role here — bootstrap_admin.sql and
-- CompanyService.provision() both explicitly exclude it from the "admin = all
-- permissions" default grant. It must be turned on per-role from Settings > Roles.
-- ============================================================

INSERT INTO permissions (key, module, description)
VALUES (
  'force_archive_study',
  'studies',
  'Archive a study that still has enrolled subjects (overrides the normal block)'
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROLE_PERMISSIONS — write policies
-- Previously SELECT-only; Settings > Roles needs to toggle individual
-- role/permission grants (starting with force_archive_study).
-- ============================================================

CREATE POLICY "role_permissions_insert" ON role_permissions
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_users')
  );

CREATE POLICY "role_permissions_update" ON role_permissions
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('manage_users')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_users')
  );

-- ============================================================
-- ROLLBACK
-- DROP POLICY IF EXISTS "role_permissions_update" ON role_permissions;
-- DROP POLICY IF EXISTS "role_permissions_insert" ON role_permissions;
-- DELETE FROM permissions WHERE key = 'force_archive_study';
-- ============================================================
