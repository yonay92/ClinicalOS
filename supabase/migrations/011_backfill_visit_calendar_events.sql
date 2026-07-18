-- Migration: 011_backfill_visit_calendar_events.sql
-- Description: One-time, idempotent data backfill for visits whose calendar_events
--   row was never created — e.g. visits generated (SubjectService.generateVisitSchedule)
--   before calendar-event creation existed (010_visit_calendar.sql wired it in), or
--   whose event was otherwise lost. Confirm/Start/Reschedule/Cancel/Reopen/Complete
--   only ever UPDATE the linked calendar_events row keyed by related_record_id, so a
--   visit with no such row silently never appears on the Calendar even though every
--   action on it succeeds. VisitService.upsertCalendarEventForVisit fixes this
--   self-healing going forward; this migration backfills the rows that already exist.
-- Depends on: 010_visit_calendar.sql (calendar_events, visits)
-- Rollback: see ROLLBACK section at the bottom — safe to re-run in either direction,
--   this only ever inserts rows keyed on (related_record_type, related_record_id)
--   that don't already exist, so running it twice never creates duplicates.

INSERT INTO calendar_events (
  company_id, site_id, event_type, title, description,
  start_datetime, end_datetime, related_record_type, related_record_id,
  status, created_by
)
SELECT
  v.company_id,
  v.site_id,
  'patient_visit',
  v.visit_name,
  NULL,
  (v.target_date::text || 'T00:00:00Z')::timestamptz,
  (v.target_date::text || 'T00:00:00Z')::timestamptz,
  'visits',
  v.id,
  -- Mirrors mapVisitStatusToCalendarStatus() in VisitService.ts — calendar_events.status
  -- only models scheduled/confirmed/completed/cancelled, narrower than visits.status.
  CASE v.status
    WHEN 'completed' THEN 'completed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'confirmed' THEN 'confirmed'
    WHEN 'in_progress' THEN 'confirmed'
    ELSE 'scheduled'
  END,
  v.created_by
FROM visits v
WHERE v.target_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM calendar_events ce
    WHERE ce.related_record_type = 'visits'
      AND ce.related_record_id = v.id
  );

-- ============================================================
-- ROLLBACK
-- Removes only the rows this backfill could have created (visits-linked
-- patient_visit events) — never touches events created through the normal
-- application flow's own inserts, since those are indistinguishable from a
-- backfilled row by design (same columns) and are not meant to be undone here.
-- If a true rollback of this specific backfill run is needed, restore from a
-- pre-migration snapshot instead.
-- ============================================================
