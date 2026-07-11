-- Migration: 002_roles_permissions.sql
-- Description: Roles, permissions, RLS helper functions, and all permission-gated policies
-- Depends on: 001_companies_sites_users.sql
-- Rollback: see ROLLBACK section at the bottom

-- ============================================================
-- ROLES
-- ============================================================

CREATE TABLE roles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name           text        NOT NULL,
  key            text        NOT NULL,
  description    text,
  is_system_role boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_role_key_company UNIQUE (company_id, key)
);

CREATE INDEX idx_roles_company ON roles(company_id);

CREATE TRIGGER roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select" ON roles
  FOR SELECT USING (company_id = current_company_id());

-- ============================================================
-- PERMISSIONS (global catalog — no company_id)
-- ============================================================

CREATE TABLE permissions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL UNIQUE,
  module      text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the permissions catalog
CREATE POLICY "permissions_select" ON permissions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- USER ROLES
-- ============================================================

CREATE TABLE user_roles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id    uuid        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_role UNIQUE (user_id, role_id)
);

CREATE INDEX idx_user_roles_user    ON user_roles(user_id);
CREATE INDEX idx_user_roles_role    ON user_roles(role_id);
CREATE INDEX idx_user_roles_company ON user_roles(company_id);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select" ON user_roles
  FOR SELECT USING (company_id = current_company_id());

-- ============================================================
-- ROLE PERMISSIONS
-- ============================================================

CREATE TABLE role_permissions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  role_id       uuid        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid        NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  allowed       boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_role_permission UNIQUE (company_id, role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role    ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_company ON role_permissions(company_id);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions_select" ON role_permissions
  FOR SELECT USING (company_id = current_company_id());

-- ============================================================
-- RLS HELPER: has_permission
-- Returns true if the current user has the given permission
-- via any of their assigned roles.
-- ============================================================

CREATE OR REPLACE FUNCTION has_permission(permission_key text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid()
      AND ur.company_id = current_company_id()
      AND p.key = permission_key
      AND rp.allowed = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- RLS HELPER: can_access_site
-- Returns true if current user has site access or view_all_sites.
-- ============================================================

CREATE OR REPLACE FUNCTION can_access_site(p_site_id uuid)
RETURNS boolean AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM user_sites
      WHERE user_id = auth.uid() AND site_id = p_site_id
    )
    OR has_permission('view_all_sites');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- PERMISSION-GATED POLICIES (added after has_permission exists)
-- ============================================================

-- user_invitations: admin/manage_users users can manage invitations
CREATE POLICY "invitations_select" ON user_invitations
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('manage_users')
  );

CREATE POLICY "invitations_insert" ON user_invitations
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_users')
  );

CREATE POLICY "invitations_update" ON user_invitations
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('manage_users')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_users')
  );

-- No DELETE on user_invitations — retained for audit

-- audit_logs: read restricted to users with view_audit_logs permission
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_audit_logs')
  );

-- sites: update restricted to users with manage_sites
CREATE POLICY "sites_insert" ON sites
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_sites')
  );

CREATE POLICY "sites_update" ON sites
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('manage_sites')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_sites')
  );

-- user_sites: admin can manage all; service role handles bulk ops
CREATE POLICY "user_sites_insert" ON user_sites
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_users')
  );

CREATE POLICY "user_sites_delete" ON user_sites
  FOR DELETE USING (
    company_id = current_company_id()
    AND has_permission('manage_users')
  );

-- user_roles: admin only
CREATE POLICY "user_roles_insert" ON user_roles
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_users')
  );

CREATE POLICY "user_roles_delete" ON user_roles
  FOR DELETE USING (
    company_id = current_company_id()
    AND has_permission('manage_users')
  );

-- profiles: admin can update any profile in company
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('manage_users')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_users')
  );

-- company_settings: admin only for update
CREATE POLICY "company_settings_update_admin" ON company_settings
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('manage_settings')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_settings')
  );

-- ============================================================
-- ROLLBACK
-- DROP POLICY IF EXISTS "company_settings_update_admin" ON company_settings;
-- DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
-- DROP POLICY IF EXISTS "user_roles_delete" ON user_roles;
-- DROP POLICY IF EXISTS "user_roles_insert" ON user_roles;
-- DROP POLICY IF EXISTS "user_sites_delete" ON user_sites;
-- DROP POLICY IF EXISTS "user_sites_insert" ON user_sites;
-- DROP POLICY IF EXISTS "sites_update" ON sites;
-- DROP POLICY IF EXISTS "sites_insert" ON sites;
-- DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
-- DROP POLICY IF EXISTS "invitations_update" ON user_invitations;
-- DROP POLICY IF EXISTS "invitations_insert" ON user_invitations;
-- DROP POLICY IF EXISTS "invitations_select" ON user_invitations;
-- DROP FUNCTION IF EXISTS can_access_site(uuid);
-- DROP FUNCTION IF EXISTS has_permission(text);
-- DROP TABLE IF EXISTS role_permissions CASCADE;
-- DROP TABLE IF EXISTS user_roles CASCADE;
-- DROP TABLE IF EXISTS permissions CASCADE;
-- DROP TABLE IF EXISTS roles CASCADE;
-- ============================================================
