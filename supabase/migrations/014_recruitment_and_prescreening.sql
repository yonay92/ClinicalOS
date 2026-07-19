-- Migration: 014_recruitment_and_prescreening.sql
-- Description: Sprint 5 — Recruitment & Patient Management. Adds a lead pipeline
--   (new -> contacted -> prescreening -> waitlisted/converted/declined/lost),
--   a company-wide recruitment pool (site assignment optional until a study/
--   location is determined), study-specific configurable prescreening
--   questionnaires with automatic eligibility scoring + mandatory manual
--   override support, and Lead-to-Subject conversion.
--
-- Design decisions (per product direction):
--   1. Leads are PHI from the moment they enter the system. Mirrors the exact
--      subjects/subject_contact_info split from migration 012 — `leads` is the
--      operational/pipeline table (status, site, study, referral source,
--      contact cadence — no PII), `lead_contact_info` is a separate 1:1 PHI
--      table (name, DOB, sex, phone, email), gated by new view_lead_phi/
--      edit_lead_phi permissions. Administrator gets both by default (same as
--      Subject PHI after migration 013) — "the same PHI permission model
--      already implemented for Subjects" is read as matching its CURRENT
--      state, not its original (excluded-by-default) design.
--   2. site_id is nullable on leads — a lead can exist in a company-wide pool
--      before being assigned to a site. RLS: (site_id IS NULL OR
--      can_access_site(site_id)) — unassigned leads are visible company-wide
--      to anyone with view_leads; assigned leads follow normal site scoping.
--   3. Prescreening is reusable and study-specific: study_prescreening_questions
--      is a per-study, editable question list (no draft/approve versioning —
--      scoped out of MVP). lead_prescreenings is one row per attempt (a lead
--      may be prescreened for multiple studies, or re-prescreened for the same
--      study, without ever overwriting a prior attempt — full history kept).
--      lead_prescreening_answers snapshots question_text/question_type at
--      answer time so historical attempts stay interpretable even if a
--      question is later edited or deactivated. Automatic scoring
--      (potentially_eligible / needs_review / not_eligible) is always
--      overridable by staff (manual_outcome), but the computed value is never
--      discarded — both are kept for audit. Prescreening is NOT PHI-gated
--      (scoped to view_leads/edit_lead) per product direction — only contact
--      information carries the stricter PHI gate.
--
-- Depends on: 001_companies_sites_users.sql (companies, sites, profiles),
--   002_roles_permissions.sql (permissions, has_permission, can_access_site),
--   003_studies_visit_templates.sql (studies), 004_subjects.sql (subjects,
--   for the conversion FK), 012_subject_contact_info_and_appointment_confirmation.sql
--   (subject_contact_info — the precedent this migration's PHI split mirrors)
-- Rollback: see ROLLBACK section at the bottom

-- ============================================================
-- REFERRAL_SOURCES  (FK -> companies)
-- Company-configurable lookup, mirrors document_types.
-- ============================================================

CREATE TABLE referral_sources (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name       text        NOT NULL,
  category   text        NOT NULL,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_referral_sources_name UNIQUE (company_id, name),
  CONSTRAINT chk_referral_sources_category CHECK (
    category IN ('physician_referral', 'advertisement', 'patient_database', 'self_referral', 'social_media', 'other')
  )
);

CREATE INDEX idx_referral_sources_company ON referral_sources(company_id);

CREATE TRIGGER referral_sources_updated_at
  BEFORE UPDATE ON referral_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE referral_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_sources_select" ON referral_sources
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_leads')
  );

CREATE POLICY "referral_sources_insert" ON referral_sources
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_referral_sources')
  );

CREATE POLICY "referral_sources_update" ON referral_sources
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('manage_referral_sources')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_referral_sources')
  );

-- ============================================================
-- LEADS  (FK -> companies, sites, studies, referral_sources, subjects, profiles)
-- Operational/pipeline table — deliberately no PHI columns here (see header).
-- site_id nullable: company-wide recruitment pool until a site is determined.
-- ============================================================

CREATE TABLE leads (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  site_id               uuid        REFERENCES sites(id) ON DELETE RESTRICT,
  study_id              uuid        REFERENCES studies(id) ON DELETE SET NULL,
  referral_source_id    uuid        REFERENCES referral_sources(id) ON DELETE SET NULL,
  initials              text,
  status                text        NOT NULL DEFAULT 'new',
  contact_attempt_count integer     NOT NULL DEFAULT 0,
  last_contacted_at     timestamptz,
  next_contact_at       timestamptz,
  waitlisted_at         timestamptz,
  converted_subject_id  uuid        REFERENCES subjects(id) ON DELETE SET NULL,
  converted_at          timestamptz,
  declined_reason       text,
  created_by            uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by            uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_leads_status CHECK (
    status IN ('new', 'contacted', 'prescreening', 'waitlisted', 'converted', 'declined', 'lost')
  ),
  CONSTRAINT uq_leads_converted_subject UNIQUE (converted_subject_id)
);

CREATE INDEX idx_leads_company  ON leads(company_id);
CREATE INDEX idx_leads_site     ON leads(site_id);
CREATE INDEX idx_leads_study    ON leads(study_id);
CREATE INDEX idx_leads_status   ON leads(company_id, status);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Unassigned (site_id IS NULL) leads are visible to anyone in the company
-- with view_leads — the company-wide pool. Once assigned, normal site
-- scoping applies.
CREATE POLICY "leads_select" ON leads
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_leads')
    AND (site_id IS NULL OR can_access_site(site_id))
  );

CREATE POLICY "leads_insert" ON leads
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('create_lead')
    AND (site_id IS NULL OR can_access_site(site_id))
  );

CREATE POLICY "leads_update" ON leads
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('edit_lead')
    AND (site_id IS NULL OR can_access_site(site_id))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_lead')
    AND (site_id IS NULL OR can_access_site(site_id))
  );

-- ============================================================
-- LEAD_CONTACT_INFO  (FK -> companies, sites, leads, profiles)
-- 1:1 with leads. PHI, in its own table for the same reason as
-- subject_contact_info — RLS enforces the PHI permission at the database
-- level regardless of which application query touches leads.
-- ============================================================

CREATE TABLE lead_contact_info (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  site_id                   uuid        REFERENCES sites(id) ON DELETE RESTRICT,
  lead_id                   uuid        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  first_name                text        NOT NULL,
  last_name                 text        NOT NULL,
  date_of_birth             date,
  sex                       text,
  phone_primary             text        NOT NULL,
  phone_secondary           text,
  email                     text,
  preferred_contact_method  text        NOT NULL DEFAULT 'phone',
  created_by                uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by                uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_lead_contact_info_method CHECK (
    preferred_contact_method IN ('phone', 'email', 'sms')
  )
);

CREATE INDEX idx_lead_contact_info_lead    ON lead_contact_info(lead_id);
CREATE INDEX idx_lead_contact_info_company ON lead_contact_info(company_id);

CREATE TRIGGER lead_contact_info_updated_at
  BEFORE UPDATE ON lead_contact_info
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE lead_contact_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_contact_info_select" ON lead_contact_info
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_lead_phi')
    AND (site_id IS NULL OR can_access_site(site_id))
  );

CREATE POLICY "lead_contact_info_insert" ON lead_contact_info
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_lead_phi')
    AND (site_id IS NULL OR can_access_site(site_id))
  );

CREATE POLICY "lead_contact_info_update" ON lead_contact_info
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('edit_lead_phi')
    AND (site_id IS NULL OR can_access_site(site_id))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_lead_phi')
    AND (site_id IS NULL OR can_access_site(site_id))
  );

-- ============================================================
-- LEAD_CONTACT_LOG  (FK -> companies, leads, profiles)
-- Append-only per-attempt log, same shape/precedent as
-- appointment_confirmation_log. Gated by the PHI permission (not
-- view_leads/edit_lead) since notes may contain contact context — same
-- reasoning as appointment_confirmation_log being gated by view/edit_subject_phi.
-- ============================================================

CREATE TABLE lead_contact_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  lead_id        uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contact_method text,
  old_status     text,
  new_status     text        NOT NULL,
  notes          text,
  contacted_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  contacted_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_contact_log_lead    ON lead_contact_log(lead_id);
CREATE INDEX idx_lead_contact_log_company ON lead_contact_log(company_id);

ALTER TABLE lead_contact_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_contact_log_select" ON lead_contact_log
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_lead_phi')
  );

CREATE POLICY "lead_contact_log_insert" ON lead_contact_log
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_lead_phi')
  );

-- ============================================================
-- STUDY_PRESCREENING_QUESTIONS  (FK -> companies, studies, profiles)
-- Per-study, editable prescreening questionnaire. No draft/approve
-- versioning (scoped out of MVP, unlike visit_templates) — a company can
-- edit questions in place; historical answers survive via the snapshot on
-- lead_prescreening_answers below regardless.
-- ============================================================

CREATE TABLE study_prescreening_questions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  study_id           uuid        NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  question_order     integer     NOT NULL DEFAULT 0,
  question_text      text        NOT NULL,
  question_type      text        NOT NULL DEFAULT 'yes_no',
  eligible_answer    text,
  min_eligible_value numeric,
  max_eligible_value numeric,
  is_hard_exclusion  boolean     NOT NULL DEFAULT false,
  is_active          boolean     NOT NULL DEFAULT true,
  created_by         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_prescreening_question_type CHECK (
    question_type IN ('yes_no', 'number', 'text')
  )
);

CREATE INDEX idx_prescreening_questions_study   ON study_prescreening_questions(study_id);
CREATE INDEX idx_prescreening_questions_company ON study_prescreening_questions(company_id);

CREATE TRIGGER study_prescreening_questions_updated_at
  BEFORE UPDATE ON study_prescreening_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE study_prescreening_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prescreening_questions_select" ON study_prescreening_questions
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_leads')
  );

CREATE POLICY "prescreening_questions_insert" ON study_prescreening_questions
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  );

CREATE POLICY "prescreening_questions_update" ON study_prescreening_questions
  FOR UPDATE USING (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  );

-- ============================================================
-- LEAD_PRESCREENINGS  (FK -> companies, leads, studies, profiles)
-- One row per prescreening ATTEMPT — a lead may be prescreened for multiple
-- studies, or re-prescreened for the same study, without ever overwriting a
-- prior attempt. The most recent row per (lead_id, study_id) is authoritative
-- for conversion eligibility; older rows are kept for history, never deleted.
-- ============================================================

CREATE TABLE lead_prescreenings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  lead_id               uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  study_id              uuid        NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  computed_outcome      text        NOT NULL,
  manual_outcome        text,
  manual_override_reason text,
  manual_override_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  manual_override_at    timestamptz,
  completed_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_lead_prescreenings_computed CHECK (
    computed_outcome IN ('potentially_eligible', 'needs_review', 'not_eligible')
  ),
  CONSTRAINT chk_lead_prescreenings_manual CHECK (
    manual_outcome IS NULL OR manual_outcome IN ('potentially_eligible', 'needs_review', 'not_eligible')
  )
);

CREATE INDEX idx_lead_prescreenings_lead    ON lead_prescreenings(lead_id);
CREATE INDEX idx_lead_prescreenings_study   ON lead_prescreenings(study_id);
CREATE INDEX idx_lead_prescreenings_company ON lead_prescreenings(company_id);

ALTER TABLE lead_prescreenings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_prescreenings_select" ON lead_prescreenings
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_leads')
  );

CREATE POLICY "lead_prescreenings_insert" ON lead_prescreenings
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_lead')
  );

CREATE POLICY "lead_prescreenings_update" ON lead_prescreenings
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('edit_lead')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_lead')
  );

-- ============================================================
-- LEAD_PRESCREENING_ANSWERS  (FK -> companies, lead_prescreenings, study_prescreening_questions)
-- question_text/question_type are snapshotted at answer time so a later edit
-- or deactivation of the source question never changes the meaning of a
-- historical answer.
-- ============================================================

CREATE TABLE lead_prescreening_answers (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  lead_prescreening_id uuid        NOT NULL REFERENCES lead_prescreenings(id) ON DELETE CASCADE,
  question_id          uuid        REFERENCES study_prescreening_questions(id) ON DELETE SET NULL,
  question_text        text        NOT NULL,
  question_type        text        NOT NULL,
  answer_value         text        NOT NULL,
  is_eligible_answer    boolean,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prescreening_answers_prescreening ON lead_prescreening_answers(lead_prescreening_id);
CREATE INDEX idx_prescreening_answers_company      ON lead_prescreening_answers(company_id);

ALTER TABLE lead_prescreening_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prescreening_answers_select" ON lead_prescreening_answers
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_leads')
  );

CREATE POLICY "prescreening_answers_insert" ON lead_prescreening_answers
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_lead')
  );

-- ============================================================
-- PERMISSIONS — recruitment module
-- view_lead_phi/edit_lead_phi are NOT added to any exclusion list — unlike
-- reopen_visit/force_archive_*, they ARE part of the Administrator default
-- grant (see CompanyService.ts / bootstrap_admin.sql), matching Subject PHI's
-- current (post-migration-013) state.
-- ============================================================

INSERT INTO permissions (key, module, description)
VALUES
  ('view_leads',               'recruitment', 'View the recruitment pipeline and lead pool'),
  ('create_lead',               'recruitment', 'Create new leads'),
  ('edit_lead',                 'recruitment', 'Edit lead pipeline status, prescreening, and site/study assignment'),
  ('view_lead_phi',             'recruitment', 'View lead contact information (name, DOB, phone, email) and contact log'),
  ('edit_lead_phi',             'recruitment', 'Edit lead contact information and log contact attempts'),
  ('convert_lead',              'recruitment', 'Convert an eligible lead into an enrolled Subject'),
  ('manage_referral_sources',   'recruitment', 'Create and manage the company''s referral source list')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROLLBACK
-- DELETE FROM permissions WHERE key IN ('view_leads', 'create_lead', 'edit_lead', 'view_lead_phi', 'edit_lead_phi', 'convert_lead', 'manage_referral_sources');
-- DROP POLICY IF EXISTS "prescreening_answers_insert" ON lead_prescreening_answers;
-- DROP POLICY IF EXISTS "prescreening_answers_select" ON lead_prescreening_answers;
-- DROP TABLE IF EXISTS lead_prescreening_answers CASCADE;
-- DROP POLICY IF EXISTS "lead_prescreenings_update" ON lead_prescreenings;
-- DROP POLICY IF EXISTS "lead_prescreenings_insert" ON lead_prescreenings;
-- DROP POLICY IF EXISTS "lead_prescreenings_select" ON lead_prescreenings;
-- DROP TABLE IF EXISTS lead_prescreenings CASCADE;
-- DROP POLICY IF EXISTS "prescreening_questions_update" ON study_prescreening_questions;
-- DROP POLICY IF EXISTS "prescreening_questions_insert" ON study_prescreening_questions;
-- DROP POLICY IF EXISTS "prescreening_questions_select" ON study_prescreening_questions;
-- DROP TABLE IF EXISTS study_prescreening_questions CASCADE;
-- DROP POLICY IF EXISTS "lead_contact_log_insert" ON lead_contact_log;
-- DROP POLICY IF EXISTS "lead_contact_log_select" ON lead_contact_log;
-- DROP TABLE IF EXISTS lead_contact_log CASCADE;
-- DROP POLICY IF EXISTS "lead_contact_info_update" ON lead_contact_info;
-- DROP POLICY IF EXISTS "lead_contact_info_insert" ON lead_contact_info;
-- DROP POLICY IF EXISTS "lead_contact_info_select" ON lead_contact_info;
-- DROP TABLE IF EXISTS lead_contact_info CASCADE;
-- DROP POLICY IF EXISTS "leads_update" ON leads;
-- DROP POLICY IF EXISTS "leads_insert" ON leads;
-- DROP POLICY IF EXISTS "leads_select" ON leads;
-- DROP TABLE IF EXISTS leads CASCADE;
-- DROP POLICY IF EXISTS "referral_sources_update" ON referral_sources;
-- DROP POLICY IF EXISTS "referral_sources_insert" ON referral_sources;
-- DROP POLICY IF EXISTS "referral_sources_select" ON referral_sources;
-- DROP TABLE IF EXISTS referral_sources CASCADE;
-- ============================================================
