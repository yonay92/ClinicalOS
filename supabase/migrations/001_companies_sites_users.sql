-- Migration: 001_companies_sites_users.sql
-- Description: Core SaaS foundation — companies, profiles, sites, invitations,
--              notifications, and audit tables with RLS helpers
-- Rollback: see ROLLBACK section at the bottom

-- ============================================================
-- SHARED TRIGGER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RLS HELPER: current_company_id
-- Returns the company_id of the currently authenticated user.
-- Used in all company-isolation RLS policies.
-- ============================================================

CREATE OR REPLACE FUNCTION current_company_id()
RETURNS uuid AS $$
  SELECT company_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- RLS HELPER: current_user_sites
-- Returns site IDs the current user is authorized to access.
-- ============================================================

CREATE OR REPLACE FUNCTION current_user_sites()
RETURNS SETOF uuid AS $$
  SELECT site_id
  FROM public.user_sites
  WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- COMPANIES
-- ============================================================

CREATE TABLE companies (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  legal_name        text,
  status            text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  subscription_plan text        DEFAULT 'standard',
  timezone          text        DEFAULT 'America/New_York',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- COMPANY SETTINGS
-- ============================================================

CREATE TABLE company_settings (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  logo_file_id      uuid,
  primary_color     text        DEFAULT '#2563eb',
  secondary_color   text        DEFAULT '#64748b',
  default_timezone  text        DEFAULT 'America/New_York',
  date_format       text        DEFAULT 'MM/DD/YYYY',
  language          text        DEFAULT 'en',
  enable_ai         boolean     NOT NULL DEFAULT true,
  enable_task_center boolean    NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_company_settings UNIQUE (company_id)
);

CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON company_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_settings_select" ON company_settings
  FOR SELECT USING (company_id = current_company_id());

CREATE POLICY "company_settings_update" ON company_settings
  FOR UPDATE USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

-- ============================================================
-- COMPANY MODULES
-- ============================================================

CREATE TABLE company_modules (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  module_key text        NOT NULL,
  is_enabled boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_company_module UNIQUE (company_id, module_key)
);

CREATE INDEX idx_company_modules_company ON company_modules(company_id);

ALTER TABLE company_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_modules_select" ON company_modules
  FOR SELECT USING (company_id = current_company_id());

-- ============================================================
-- PROFILES (mapped to auth.users)
-- ============================================================

CREATE TABLE profiles (
  id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  full_name       text        NOT NULL,
  email           text        NOT NULL,
  phone           text,
  avatar_file_id  uuid,
  status          text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'pending_invite', 'suspended')),
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_profiles_email_company UNIQUE (company_id, email)
);

CREATE INDEX idx_profiles_company  ON profiles(company_id);
CREATE INDEX idx_profiles_email    ON profiles(email);
CREATE INDEX idx_profiles_status   ON profiles(company_id, status);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (company_id = current_company_id());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND company_id = current_company_id()
  );

-- ============================================================
-- SITES
-- ============================================================

CREATE TABLE sites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name       text        NOT NULL,
  site_code  text,
  address    text,
  city       text,
  state      text,
  zip_code   text,
  phone      text,
  status     text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sites_company ON sites(company_id);
CREATE INDEX idx_sites_status  ON sites(company_id, status);

CREATE TRIGGER sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sites_select" ON sites
  FOR SELECT USING (company_id = current_company_id());

-- ============================================================
-- USER SITES
-- ============================================================

CREATE TABLE user_sites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  site_id    uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_site UNIQUE (user_id, site_id)
);

CREATE INDEX idx_user_sites_user    ON user_sites(user_id);
CREATE INDEX idx_user_sites_site    ON user_sites(site_id);
CREATE INDEX idx_user_sites_company ON user_sites(company_id);

ALTER TABLE user_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sites_select" ON user_sites
  FOR SELECT USING (company_id = current_company_id());

-- ============================================================
-- USER INVITATIONS
-- ============================================================

CREATE TABLE user_invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  email       text        NOT NULL,
  invited_by  uuid        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  roles       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  sites       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  token       text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid        REFERENCES profiles(id),
  status      text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  revoked_by  uuid        REFERENCES profiles(id),
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_company ON user_invitations(company_id);
CREATE INDEX idx_invitations_email   ON user_invitations(email);
CREATE INDEX idx_invitations_token   ON user_invitations(token) WHERE status = 'pending';
CREATE INDEX idx_invitations_status  ON user_invitations(status, expires_at);

CREATE TRIGGER user_invitations_updated_at
  BEFORE UPDATE ON user_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- RLS policies that require has_permission() are added in migration 002
-- until then, RLS is enabled (blocking all non-service-role access) as the secure default

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id                  uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid              NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  user_id             uuid              NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type                text              NOT NULL,
  title               text              NOT NULL,
  body                text,
  related_module      text,
  related_record_id   uuid,
  related_record_type text,
  priority            text              NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  is_read             boolean           NOT NULL DEFAULT false,
  read_at             timestamptz,
  created_at          timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user    ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_company ON notifications(company_id);
CREATE INDEX idx_notifications_unread  ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_module  ON notifications(related_module, related_record_id);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (
    company_id = current_company_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (
    company_id = current_company_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    company_id = current_company_id()
    AND user_id = auth.uid()
  );

-- INSERT only via service role — no authenticated INSERT policy

-- ============================================================
-- NOTIFICATION PREFERENCES
-- ============================================================

CREATE TABLE notification_preferences (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  in_app      boolean     NOT NULL DEFAULT true,
  email       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_prefs UNIQUE (user_id, event_type)
);

CREATE INDEX idx_notification_prefs_user ON notification_preferences(user_id);

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_prefs_all" ON notification_preferences
  FOR ALL USING (
    company_id = current_company_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    company_id = current_company_id()
    AND user_id = auth.uid()
  );

-- ============================================================
-- NOTIFICATION EMAIL QUEUE
-- ============================================================

CREATE TABLE notification_email_queue (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_id uuid        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  email           text        NOT NULL,
  subject         text        NOT NULL,
  html_body       text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        integer     NOT NULL DEFAULT 0,
  last_attempted  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_queue_pending ON notification_email_queue(status, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_email_queue_company ON notification_email_queue(company_id);

ALTER TABLE notification_email_queue ENABLE ROW LEVEL SECURITY;

-- Email queue is accessed only by the Edge Function via service role — no user policies

-- ============================================================
-- AUDIT LOGS (immutable)
-- ============================================================

CREATE TABLE audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  site_id     uuid        REFERENCES sites(id),
  user_id     uuid        REFERENCES profiles(id),
  action      text        NOT NULL,
  module      text        NOT NULL,
  record_type text,
  record_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_company    ON audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_logs_user       ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_record     ON audit_logs(record_type, record_id);
CREATE INDEX idx_audit_logs_module     ON audit_logs(module, company_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- INSERT only for authenticated company members (server-side writes)
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (company_id = current_company_id());

-- SELECT policy that requires view_audit_logs permission is added in migration 002
-- No UPDATE policy — ever
-- No DELETE policy — ever

-- ============================================================
-- ROLLBACK
-- DROP TABLE IF EXISTS audit_logs CASCADE;
-- DROP TABLE IF EXISTS notification_email_queue CASCADE;
-- DROP TABLE IF EXISTS notification_preferences CASCADE;
-- DROP TABLE IF EXISTS notifications CASCADE;
-- DROP TABLE IF EXISTS user_invitations CASCADE;
-- DROP TABLE IF EXISTS user_sites CASCADE;
-- DROP TABLE IF EXISTS sites CASCADE;
-- DROP TABLE IF EXISTS profiles CASCADE;
-- DROP TABLE IF EXISTS company_modules CASCADE;
-- DROP TABLE IF EXISTS company_settings CASCADE;
-- DROP TABLE IF EXISTS companies CASCADE;
-- DROP FUNCTION IF EXISTS current_user_sites();
-- DROP FUNCTION IF EXISTS current_company_id();
-- DROP FUNCTION IF EXISTS update_updated_at_column();
-- ============================================================
