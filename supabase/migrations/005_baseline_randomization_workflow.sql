-- Migration: 005_baseline_randomization_workflow.sql
-- Description: Refines the Subject creation workflow to match real CRC operations —
--   Baseline is no longer collected at subject creation; it is recorded when the
--   Baseline visit is completed, which then anchors generation of the rest of the
--   protocol visit schedule. Randomization becomes a dedicated Subject Profile action
--   (Randomization Number + Date) instead of a creation-time field.
-- Depends on: 003_studies_visit_templates.sql (visit_template_items),
--   004_subjects.sql (subjects, visits)
-- Rollback: see ROLLBACK section at the bottom

-- ============================================================
-- VISIT_TEMPLATE_ITEMS — designate exactly one item per template as the Baseline
-- visit. SubjectService uses this to (a) create a placeholder Baseline visit at
-- subject creation and (b) anchor the rest of the schedule once it's completed.
-- ============================================================

ALTER TABLE visit_template_items
  ADD COLUMN is_baseline boolean NOT NULL DEFAULT false;

-- At most one Baseline item per template.
CREATE UNIQUE INDEX uq_visit_template_items_one_baseline
  ON visit_template_items (template_id)
  WHERE is_baseline;

-- Backfill: templates approved before this migration have no is_baseline item yet.
-- VisitTemplateService.createTemplate will require exactly one going forward, but
-- already-approved templates must keep working — mark the offset_days = 0 item as
-- Baseline where exactly one such item exists (matches the DATABASE_Part_02
-- convention: Baseline = offset 0).
WITH candidate AS (
  SELECT i.id
  FROM visit_template_items i
  JOIN visit_templates t ON t.id = i.template_id
  WHERE t.status = 'approved'
    AND i.offset_days = 0
    AND NOT EXISTS (
      SELECT 1 FROM visit_template_items i2
      WHERE i2.template_id = i.template_id AND i2.is_baseline
    )
    AND (
      SELECT count(*) FROM visit_template_items i3
      WHERE i3.template_id = i.template_id AND i3.offset_days = 0
    ) = 1
)
UPDATE visit_template_items
SET is_baseline = true
WHERE id IN (SELECT id FROM candidate);

-- ============================================================
-- SUBJECTS — randomization_number (IWRS-issued), recorded alongside
-- randomization_date via the dedicated Randomize action.
-- ============================================================

ALTER TABLE subjects
  ADD COLUMN randomization_number text;

-- ============================================================
-- ROLLBACK
-- ALTER TABLE subjects DROP COLUMN IF EXISTS randomization_number;
-- DROP INDEX IF EXISTS uq_visit_template_items_one_baseline;
-- ALTER TABLE visit_template_items DROP COLUMN IF EXISTS is_baseline;
-- ============================================================
