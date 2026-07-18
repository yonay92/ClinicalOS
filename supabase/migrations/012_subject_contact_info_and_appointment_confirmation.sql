-- Migration: 012_subject_contact_info_and_appointment_confirmation.sql
-- Description: Internal CTMS PHI — adds subject_contact_info (name, DOB, sex,
--   phone, email, contact preferences — one row per subject) and the
--   appointment-confirmation workflow (appointment_confirmations +
--   appointment_confirmation_log, mirroring visits/visit_history), tracked
--   independently from the clinical visits.status lifecycle. Both PHI tables
--   are gated by new view_subject_phi/edit_subject_phi permissions, off by
--   default for every role including Admin — same "conscious per-role
--   override" pattern as reopen_visit/force_archive_study/force_archive_site.
-- Depends on: 004_subjects.sql (subjects, visits, subject_timeline),
--   002_roles_permissions.sql (permissions), 010_visit_calendar.sql (visit_history
--   precedent for appointment_confirmation_log)
-- Rollback: see ROLLBACK section at the bottom

-- ============================================================
-- SUBJECT_CONTACT_INFO  (FK -> companies, sites, subjects, profiles)
-- 1:1 with subjects, kept in its own table (rather than columns on subjects)
-- so RLS enforces the PHI permission at the database level regardless of
-- which application query touches subjects.
-- ============================================================

CREATE TABLE subject_contact_info (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  site_id                   uuid        NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  subject_id                uuid        NOT NULL UNIQUE REFERENCES subjects(id) ON DELETE CASCADE,
  first_name                text        NOT NULL,
  last_name                 text        NOT NULL,
  date_of_birth             date        NOT NULL,
  sex                       text        NOT NULL,
  phone_primary             text        NOT NULL,
  phone_secondary           text,
  email                     text,
  preferred_language        text        NOT NULL,
  preferred_contact_method  text        NOT NULL DEFAULT 'phone',
  voicemail_permission      boolean     NOT NULL DEFAULT false,
  best_time_to_contact      text,
  created_by                uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by                uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_contact_info_preferred_method CHECK (
    preferred_contact_method IN ('phone', 'email', 'sms')
  )
);

CREATE INDEX idx_subject_contact_info_subject ON subject_contact_info(subject_id);
CREATE INDEX idx_subject_contact_info_company ON subject_contact_info(company_id);

CREATE TRIGGER subject_contact_info_updated_at
  BEFORE UPDATE ON subject_contact_info
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE subject_contact_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subject_contact_info_select" ON subject_contact_info
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_subject_phi')
    AND can_access_site(site_id)
  );

CREATE POLICY "subject_contact_info_insert" ON subject_contact_info
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_subject_phi')
    AND can_access_site(site_id)
  );

CREATE POLICY "subject_contact_info_update" ON subject_contact_info
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('edit_subject_phi')
    AND can_access_site(site_id)
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_subject_phi')
    AND can_access_site(site_id)
  );

-- ============================================================
-- APPOINTMENT_CONFIRMATIONS  (FK -> companies, sites, visits, profiles)
-- 1:1 with visits. Deliberately separate from visits.status — contacting a
-- patient must never change the clinical visit lifecycle (Confirm/Start/
-- Reschedule/Cancel/Reopen in VisitService are untouched by this table).
-- ============================================================

CREATE TABLE appointment_confirmations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  site_id               uuid        NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  visit_id              uuid        NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  confirmation_status   text        NOT NULL DEFAULT 'not_contacted',
  last_contacted_at     timestamptz,
  last_contacted_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  contact_attempt_count integer     NOT NULL DEFAULT 0,
  contact_notes         text,
  next_contact_at       timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_appointment_confirmation_status CHECK (
    confirmation_status IN (
      'not_contacted', 'attempted', 'confirmed',
      'left_voicemail', 'requested_reschedule', 'unable_to_reach'
    )
  )
);

CREATE INDEX idx_appointment_confirmations_visit   ON appointment_confirmations(visit_id);
CREATE INDEX idx_appointment_confirmations_company ON appointment_confirmations(company_id);

CREATE TRIGGER appointment_confirmations_updated_at
  BEFORE UPDATE ON appointment_confirmations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE appointment_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointment_confirmations_select" ON appointment_confirmations
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_subject_phi')
    AND can_access_site(site_id)
  );

CREATE POLICY "appointment_confirmations_insert" ON appointment_confirmations
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_subject_phi')
    AND can_access_site(site_id)
  );

CREATE POLICY "appointment_confirmations_update" ON appointment_confirmations
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('edit_subject_phi')
    AND can_access_site(site_id)
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_subject_phi')
    AND can_access_site(site_id)
  );

-- ============================================================
-- APPOINTMENT_CONFIRMATION_LOG  (FK -> companies, visits, profiles)
-- Append-only per-attempt log, same shape/precedent as visit_history —
-- backs contact_attempt_count with a real auditable trail. Contains
-- contact_notes, so it is PHI and stays behind the same permission as its
-- parent table (visit_history itself only needs view_visits/manage_visits
-- since it carries no PHI; this one does, so it does not reuse that policy).
-- ============================================================

CREATE TABLE appointment_confirmation_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  visit_id       uuid        NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  contact_method text,
  old_status     text,
  new_status     text        NOT NULL,
  notes          text,
  contacted_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  contacted_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointment_confirmation_log_visit   ON appointment_confirmation_log(visit_id);
CREATE INDEX idx_appointment_confirmation_log_company ON appointment_confirmation_log(company_id);

ALTER TABLE appointment_confirmation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointment_confirmation_log_select" ON appointment_confirmation_log
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_subject_phi')
  );

-- No direct INSERT policy beyond edit_subject_phi — rows are written
-- exclusively by AppointmentConfirmationService.logContact alongside the
-- appointment_confirmations UPDATE, same pattern as visit_history.
CREATE POLICY "appointment_confirmation_log_insert" ON appointment_confirmation_log
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_subject_phi')
  );

-- ============================================================
-- PERMISSIONS — view_subject_phi / edit_subject_phi
-- Not inserted into role_permissions for any role here — bootstrap_admin.sql
-- and CompanyService.ADMIN_EXCLUDED_PERMISSIONS exclude both from the
-- Administrator role's default grant, same as reopen_visit/force_archive_*:
-- a company owner must consciously elevate a role via Settings > Roles.
-- ============================================================

INSERT INTO permissions (key, module, description)
VALUES
  (
    'view_subject_phi',
    'subjects',
    'View subject contact information (name, DOB, phone, email) and appointment confirmation details'
  ),
  (
    'edit_subject_phi',
    'subjects',
    'Edit subject contact information and log appointment confirmation contact attempts'
  )
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROLLBACK
-- DELETE FROM permissions WHERE key IN ('view_subject_phi', 'edit_subject_phi');
-- DROP POLICY IF EXISTS "appointment_confirmation_log_insert" ON appointment_confirmation_log;
-- DROP POLICY IF EXISTS "appointment_confirmation_log_select" ON appointment_confirmation_log;
-- DROP TABLE IF EXISTS appointment_confirmation_log CASCADE;
-- DROP POLICY IF EXISTS "appointment_confirmations_update" ON appointment_confirmations;
-- DROP POLICY IF EXISTS "appointment_confirmations_insert" ON appointment_confirmations;
-- DROP POLICY IF EXISTS "appointment_confirmations_select" ON appointment_confirmations;
-- DROP TABLE IF EXISTS appointment_confirmations CASCADE;
-- DROP POLICY IF EXISTS "subject_contact_info_update" ON subject_contact_info;
-- DROP POLICY IF EXISTS "subject_contact_info_insert" ON subject_contact_info;
-- DROP POLICY IF EXISTS "subject_contact_info_select" ON subject_contact_info;
-- DROP TABLE IF EXISTS subject_contact_info CASCADE;
-- ============================================================
