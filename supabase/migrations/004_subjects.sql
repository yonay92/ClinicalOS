-- Migration: 004_subjects.sql
-- Description: Sprint 3 — Subject Management. Subjects, status history, notes,
--              documents, milestones, and clinical timeline.
-- Depends on: 001_companies_sites_users.sql, 002_roles_permissions.sql,
--   003_studies_visit_templates.sql (studies, visit_templates, visit_template_items, files)
-- Rollback: see ROLLBACK section at the bottom
--
-- Forward-dependency note: `visits` is formally owned by the Sprint 4 (Visits &
-- Calendar) domain (docs/DATABASE_Part_03 §8-11). Only the minimal columns needed
-- to generate a subject's scheduled visits and populate the Subject Profile Visits
-- tab (docs/API.md §11 GET /api/subjects/:id/visits) are created here — mirrors
-- Sprint 2's minimal pull-forward of `document_types`/`files`. Sprint 4 will
-- ALTER TABLE to add rescheduling/out-of-window support and will add
-- `visit_history`, `visit_notes`, and `calendar_events` alongside it; it must not
-- redefine this table.

-- ============================================================
-- EXTEND files_insert (defined in 003_studies_visit_templates.sql)
-- The Subject Documents "Upload Document" flow (docs/UI_UX_07_Subjects.md) inserts
-- into the shared `files` table too — widen the policy to also cover subject
-- create/edit permissions without touching the studies-flow conditions.
-- ============================================================

DROP POLICY IF EXISTS "files_insert" ON files;

CREATE POLICY "files_insert" ON files
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND (
      has_permission('create_study')
      OR has_permission('edit_study')
      OR has_permission('manage_studies')
      OR has_permission('create_subject')
      OR has_permission('edit_subject')
    )
  );

-- ============================================================
-- SUBJECTS  (FK -> companies, sites, studies, profiles)
-- GAP-REQ-02: subject_number is unique per study.
-- ============================================================

CREATE TABLE subjects (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  site_id            uuid        NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  study_id           uuid        NOT NULL REFERENCES studies(id) ON DELETE RESTRICT,
  subject_number     text        NOT NULL,
  initials           text,
  status             text        NOT NULL DEFAULT 'pre_screening',
  screening_date     date,
  baseline_date      date,
  randomization_date date,
  end_of_study_date  date,
  created_by         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_subjects_study_number UNIQUE (study_id, subject_number),
  CONSTRAINT chk_subjects_status CHECK (
    status IN (
      'pre_screening', 'screening', 'screen_failed', 'randomized',
      'active', 'completed', 'early_terminated', 'lost_to_follow_up'
    )
  )
);

CREATE INDEX idx_subjects_company ON subjects(company_id);
CREATE INDEX idx_subjects_site    ON subjects(site_id);
CREATE INDEX idx_subjects_study   ON subjects(company_id, study_id);
CREATE INDEX idx_subjects_status  ON subjects(company_id, status);

CREATE TRIGGER subjects_updated_at
  BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subjects_select" ON subjects
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_subjects')
    AND can_access_site(site_id)
  );

CREATE POLICY "subjects_insert" ON subjects
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('create_subject')
    AND can_access_site(site_id)
  );

CREATE POLICY "subjects_update" ON subjects
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('edit_subject')
    AND can_access_site(site_id)
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_subject')
    AND can_access_site(site_id)
  );

-- ============================================================
-- SUBJECT STATUS HISTORY  (FK -> companies, subjects, profiles)
-- ============================================================

CREATE TABLE subject_status_history (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  subject_id uuid        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  old_status text,
  new_status text        NOT NULL,
  changed_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason     text
);

CREATE INDEX idx_subject_status_history_subject ON subject_status_history(subject_id);
CREATE INDEX idx_subject_status_history_company ON subject_status_history(company_id);

ALTER TABLE subject_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subject_status_history_select" ON subject_status_history
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_subjects')
  );

-- No direct INSERT policy for authenticated users — rows are written exclusively
-- by SubjectService.updateStatus() via the server client alongside the subjects
-- UPDATE, matching the "server-side validation only" architecture rule.
CREATE POLICY "subject_status_history_insert" ON subject_status_history
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_subject')
  );

-- ============================================================
-- SUBJECT NOTES  (FK -> companies, subjects, profiles)
-- ============================================================

CREATE TABLE subject_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  subject_id uuid        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  note       text        NOT NULL,
  visibility text        NOT NULL DEFAULT 'internal',
  created_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_subject_notes_visibility CHECK (
    visibility IN ('internal', 'crc_only', 'admin_only')
  )
);

CREATE INDEX idx_subject_notes_subject ON subject_notes(subject_id);
CREATE INDEX idx_subject_notes_company ON subject_notes(company_id);

ALTER TABLE subject_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subject_notes_select" ON subject_notes
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_subjects')
  );

CREATE POLICY "subject_notes_insert" ON subject_notes
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_subject')
  );

-- ============================================================
-- SUBJECT DOCUMENTS  (FK -> companies, subjects, files, profiles)
-- ============================================================

CREATE TABLE subject_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  subject_id    uuid        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  file_id       uuid        NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  document_type text,
  uploaded_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  notes         text
);

CREATE INDEX idx_subject_documents_subject ON subject_documents(subject_id);
CREATE INDEX idx_subject_documents_file    ON subject_documents(file_id);
CREATE INDEX idx_subject_documents_company ON subject_documents(company_id);

ALTER TABLE subject_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subject_documents_select" ON subject_documents
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_subjects')
  );

CREATE POLICY "subject_documents_insert" ON subject_documents
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_subject')
  );

-- ============================================================
-- SUBJECT MILESTONES  (FK -> companies, subjects, profiles)
-- ============================================================

CREATE TABLE subject_milestones (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  subject_id     uuid        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  milestone_type text        NOT NULL,
  milestone_date date        NOT NULL,
  created_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_subject_milestones_type CHECK (
    milestone_type IN (
      'consent_signed', 'screening', 'randomized', 'first_dose',
      'last_dose', 'end_of_treatment', 'end_of_study'
    )
  )
);

CREATE INDEX idx_subject_milestones_subject ON subject_milestones(subject_id);
CREATE INDEX idx_subject_milestones_company ON subject_milestones(company_id);

ALTER TABLE subject_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subject_milestones_select" ON subject_milestones
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_subjects')
  );

CREATE POLICY "subject_milestones_insert" ON subject_milestones
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('edit_subject')
  );

-- ============================================================
-- SUBJECT TIMELINE  (FK -> companies, subjects, profiles)
-- Narrative event log for display — kept alongside subject_status_history
-- per GAP-DUP-01 (both serve distinct purposes; both are written on status change).
-- ============================================================

CREATE TABLE subject_timeline (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  subject_id          uuid        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  event_type          text        NOT NULL,
  event_date          timestamptz NOT NULL,
  description         text,
  related_record_type text,
  related_record_id   uuid,
  created_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subject_timeline_subject ON subject_timeline(subject_id);
CREATE INDEX idx_subject_timeline_company ON subject_timeline(company_id);

ALTER TABLE subject_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subject_timeline_select" ON subject_timeline
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_subjects')
  );

-- No direct INSERT policy for authenticated users — timeline entries are written
-- exclusively by SubjectService via the server client alongside the originating
-- action (create, status change), same pattern as subject_status_history.
CREATE POLICY "subject_timeline_insert" ON subject_timeline
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('create_subject') OR has_permission('edit_subject'))
  );

-- ============================================================
-- VISITS  (minimal pull-forward from DATABASE_Part_03 §8 — see header note)
-- FK -> companies, sites, studies, subjects, visit_template_items, profiles
-- ============================================================

CREATE TABLE visits (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  site_id                uuid        NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  study_id               uuid        NOT NULL REFERENCES studies(id) ON DELETE RESTRICT,
  subject_id             uuid        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  visit_template_item_id uuid        REFERENCES visit_template_items(id) ON DELETE SET NULL,
  visit_name             text        NOT NULL,
  visit_type             text        NOT NULL DEFAULT 'scheduled',
  target_date            date,
  scheduled_date         date,
  window_start           date,
  window_end             date,
  status                 text        NOT NULL DEFAULT 'scheduled',
  created_by             uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_visits_type CHECK (visit_type IN ('scheduled', 'unscheduled')),
  CONSTRAINT chk_visits_status CHECK (
    status IN (
      'scheduled', 'confirmed', 'in_progress', 'completed',
      'missed', 'rescheduled', 'cancelled', 'out_of_window'
    )
  )
);

CREATE INDEX idx_visits_company     ON visits(company_id);
CREATE INDEX idx_visits_site        ON visits(site_id);
CREATE INDEX idx_visits_subject     ON visits(subject_id);
CREATE INDEX idx_visits_target_date ON visits(target_date);
CREATE INDEX idx_visits_status      ON visits(company_id, status);

CREATE TRIGGER visits_updated_at
  BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visits_select" ON visits
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_visits')
    AND can_access_site(site_id)
  );

-- Visits are only ever created by SubjectService.generateVisitSchedule() as part
-- of subject creation/baseline-date update in Sprint 3. Sprint 4 adds the
-- unscheduled-visit creation flow and reschedule/cancel policies on top of this.
CREATE POLICY "visits_insert" ON visits
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('create_subject') OR has_permission('manage_visits'))
    AND can_access_site(site_id)
  );

CREATE POLICY "visits_update" ON visits
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('manage_visits')
    AND can_access_site(site_id)
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_visits')
    AND can_access_site(site_id)
  );

-- ============================================================
-- STORAGE BUCKET
-- subject-documents: files uploaded via the Subject Profile Documents tab
-- (docs/UI_UX_07_Subjects.md "Upload Document" action). Objects are stored under
-- `${company_id}/${subject_id}/...` — RLS enforces the folder prefix matches the
-- uploader's own company, same pattern as Sprint 2's `protocols`/`studies` buckets.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('subject-documents', 'subject-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "subject_documents_bucket_insert_own_company" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'subject-documents'
    AND (storage.foldername(name))[1] = current_company_id()::text
  );

CREATE POLICY "subject_documents_bucket_select_own_company" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'subject-documents'
    AND (storage.foldername(name))[1] = current_company_id()::text
  );

-- ============================================================
-- ROLLBACK
-- DROP POLICY IF EXISTS "subject_documents_bucket_select_own_company" ON storage.objects;
-- DROP POLICY IF EXISTS "subject_documents_bucket_insert_own_company" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id IN ('subject-documents');
-- DROP POLICY IF EXISTS "visits_update" ON visits;
-- DROP POLICY IF EXISTS "visits_insert" ON visits;
-- DROP POLICY IF EXISTS "visits_select" ON visits;
-- DROP TABLE IF EXISTS visits CASCADE;
-- DROP POLICY IF EXISTS "subject_timeline_insert" ON subject_timeline;
-- DROP POLICY IF EXISTS "subject_timeline_select" ON subject_timeline;
-- DROP TABLE IF EXISTS subject_timeline CASCADE;
-- DROP POLICY IF EXISTS "subject_milestones_insert" ON subject_milestones;
-- DROP POLICY IF EXISTS "subject_milestones_select" ON subject_milestones;
-- DROP TABLE IF EXISTS subject_milestones CASCADE;
-- DROP POLICY IF EXISTS "subject_documents_insert" ON subject_documents;
-- DROP POLICY IF EXISTS "subject_documents_select" ON subject_documents;
-- DROP TABLE IF EXISTS subject_documents CASCADE;
-- DROP POLICY IF EXISTS "subject_notes_insert" ON subject_notes;
-- DROP POLICY IF EXISTS "subject_notes_select" ON subject_notes;
-- DROP TABLE IF EXISTS subject_notes CASCADE;
-- DROP POLICY IF EXISTS "subject_status_history_insert" ON subject_status_history;
-- DROP POLICY IF EXISTS "subject_status_history_select" ON subject_status_history;
-- DROP TABLE IF EXISTS subject_status_history CASCADE;
-- DROP POLICY IF EXISTS "subjects_update" ON subjects;
-- DROP POLICY IF EXISTS "subjects_insert" ON subjects;
-- DROP POLICY IF EXISTS "subjects_select" ON subjects;
-- DROP TABLE IF EXISTS subjects CASCADE;
-- DROP POLICY IF EXISTS "files_insert" ON files;
-- CREATE POLICY "files_insert" ON files
--   FOR INSERT WITH CHECK (
--     company_id = current_company_id()
--     AND (has_permission('create_study') OR has_permission('edit_study') OR has_permission('manage_studies'))
--   );
-- ============================================================
