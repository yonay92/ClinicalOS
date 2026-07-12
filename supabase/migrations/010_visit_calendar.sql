-- Migration: 010_visit_calendar.sql
-- Description: Sprint 4 — Visit Calendar (patient visits only). Adds visit_history
--   (structured status-change log, mirrors subject_status_history),
--   visit_notes (mirrors subject_notes — used by Reschedule, which doesn't change
--   status so has nothing to write to visit_history), and calendar_events (mirrors
--   docs/DATABASE_Part_03_Subjects_Visits_Calendar.md §9-11 verbatim). Also adds the
--   reopen_visit "dangerous operation" override permission, same pattern as
--   force_archive_study/force_archive_site (006/007).
-- Depends on: 004_subjects.sql (visits, subject_status_history, subject_notes),
--   002_roles_permissions.sql (permissions)
-- Rollback: see ROLLBACK section at the bottom

-- ============================================================
-- VISIT_HISTORY  (FK -> companies, visits, profiles)
-- Append-only structured status-change log — exactly like subject_status_history.
-- ============================================================

CREATE TABLE visit_history (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  visit_id   uuid        NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  old_status text,
  new_status text        NOT NULL,
  changed_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason     text
);

CREATE INDEX idx_visit_history_visit   ON visit_history(visit_id);
CREATE INDEX idx_visit_history_company ON visit_history(company_id);

ALTER TABLE visit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_history_select" ON visit_history
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_visits')
  );

-- No direct INSERT policy for authenticated users beyond manage_visits — rows are
-- written exclusively by VisitService alongside the originating visits UPDATE,
-- same pattern as subject_status_history.
CREATE POLICY "visit_history_insert" ON visit_history
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_visits')
  );

-- ============================================================
-- VISIT_NOTES  (FK -> companies, visits, profiles)
-- Used by Reschedule (reason + old/new date) since visit_history is specifically
-- an old_status/new_status table and reschedule doesn't change status.
-- ============================================================

CREATE TABLE visit_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  visit_id   uuid        NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  note       text        NOT NULL,
  created_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_visit_notes_visit   ON visit_notes(visit_id);
CREATE INDEX idx_visit_notes_company ON visit_notes(company_id);

ALTER TABLE visit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_notes_select" ON visit_notes
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_visits')
  );

CREATE POLICY "visit_notes_insert" ON visit_notes
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_visits')
  );

-- ============================================================
-- CALENDAR_EVENTS  (FK -> companies, sites, profiles)
-- docs/DATABASE_Part_03_Subjects_Visits_Calendar.md §11. Full event_type CHECK
-- constraint included even though only 'patient_visit' is used this sprint — the
-- other types are calendar_events-only records with no `visits` row, deferred to a
-- future "operational calendar events" sprint; widening later would require a
-- migration just to relax the CHECK, so it's defined complete now.
-- related_record_id is intentionally polymorphic (no FK) — related_record_type
-- names which table it points into (only 'visits' this sprint).
-- ============================================================

CREATE TABLE calendar_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  site_id             uuid        NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  event_type          text        NOT NULL,
  title               text        NOT NULL,
  description         text,
  start_datetime      timestamptz NOT NULL,
  end_datetime        timestamptz,
  related_record_type text,
  related_record_id   uuid,
  status              text        NOT NULL DEFAULT 'scheduled',
  created_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_calendar_events_type CHECK (
    event_type IN (
      'patient_visit', 'monitoring_visit', 'sponsor_visit',
      'investigator_meeting', 'staff_meeting', 'training'
    )
  )
);

CREATE INDEX idx_calendar_events_company_site  ON calendar_events(company_id, site_id);
CREATE INDEX idx_calendar_events_start         ON calendar_events(company_id, start_datetime);
CREATE INDEX idx_calendar_events_related       ON calendar_events(related_record_type, related_record_id);

CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_events_select" ON calendar_events
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_visits')
    AND can_access_site(site_id)
  );

-- System-generated only this sprint (VisitService writes these alongside visits
-- inserts/updates) — no manual-create UI, since that's for the deferred event types.
CREATE POLICY "calendar_events_insert" ON calendar_events
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_visits')
    AND can_access_site(site_id)
  );

CREATE POLICY "calendar_events_update" ON calendar_events
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
-- PERMISSIONS — reopen_visit
-- Not inserted into role_permissions for any role here — bootstrap_admin.sql
-- excludes it from the Administrator role's default grant below, same as
-- force_archive_study/force_archive_site: a company owner must consciously
-- elevate a role via Settings > Roles.
-- ============================================================

INSERT INTO permissions (key, module, description)
VALUES (
  'reopen_visit',
  'visits',
  'Reopen a completed visit back to In Progress (overrides the normal one-way completion)'
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROLLBACK
-- DELETE FROM permissions WHERE key = 'reopen_visit';
-- DROP POLICY IF EXISTS "calendar_events_update" ON calendar_events;
-- DROP POLICY IF EXISTS "calendar_events_insert" ON calendar_events;
-- DROP POLICY IF EXISTS "calendar_events_select" ON calendar_events;
-- DROP TABLE IF EXISTS calendar_events CASCADE;
-- DROP POLICY IF EXISTS "visit_notes_insert" ON visit_notes;
-- DROP POLICY IF EXISTS "visit_notes_select" ON visit_notes;
-- DROP TABLE IF EXISTS visit_notes CASCADE;
-- DROP POLICY IF EXISTS "visit_history_insert" ON visit_history;
-- DROP POLICY IF EXISTS "visit_history_select" ON visit_history;
-- DROP TABLE IF EXISTS visit_history CASCADE;
-- ============================================================
