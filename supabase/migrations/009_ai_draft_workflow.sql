-- Migration: 009_ai_draft_workflow.sql
-- Description: Guided AI Draft workflow. Protocol uploads for a *new* study no longer create a
--              real `studies` row immediately — the AI extraction lands in a temporary
--              `study_drafts` row, which a human reviews and edits before "Finalize" creates the
--              real study, visit template, and protocol document in one step.
-- Depends on: 003_studies_visit_templates.sql (companies, files, studies, has_permission(),
--             current_company_id(), update_updated_at_column())
-- Rollback: see ROLLBACK section at the bottom

-- ============================================================
-- STUDY DRAFTS  (FK -> companies, files, studies, profiles)
-- ============================================================

CREATE TABLE study_drafts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  file_id               uuid        NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  status                text        NOT NULL DEFAULT 'processing',
  confidence            numeric(5,4),
  uncertain_fields      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  extracted_profile     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  extracted_visit_items jsonb       NOT NULL DEFAULT '[]'::jsonb,
  extracted_extra       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error_message         text,
  study_id              uuid        REFERENCES studies(id) ON DELETE SET NULL,
  created_by            uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_study_drafts_status CHECK (status IN ('processing', 'ready', 'failed', 'finalized'))
);

CREATE INDEX idx_study_drafts_company ON study_drafts(company_id);
CREATE INDEX idx_study_drafts_file    ON study_drafts(file_id);
CREATE INDEX idx_study_drafts_status  ON study_drafts(company_id, status);

CREATE TRIGGER study_drafts_updated_at
  BEFORE UPDATE ON study_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE study_drafts ENABLE ROW LEVEL SECURITY;

-- All operations are gated on create_study — the same permission required to kick off the
-- upload in the first place. The protocol-ai Edge Function writes extraction results via the
-- service-role client and bypasses RLS entirely (same pattern as study_ai_extractions).

CREATE POLICY "study_drafts_select" ON study_drafts
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('create_study')
  );

CREATE POLICY "study_drafts_insert" ON study_drafts
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('create_study')
  );

CREATE POLICY "study_drafts_update" ON study_drafts
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('create_study')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('create_study')
  );

CREATE POLICY "study_drafts_delete" ON study_drafts
  FOR DELETE USING (
    company_id = current_company_id()
    AND has_permission('create_study')
  );

-- ============================================================
-- ROLLBACK
-- DROP TABLE IF EXISTS study_drafts CASCADE;
-- ============================================================
