-- Migration: 003_studies_visit_templates.sql
-- Description: Sprint 2 — Study Management. Studies, study-site/staff assignment,
--              versioned visit templates, protocol/document storage, and AI extraction review.
-- Depends on: 001_companies_sites_users.sql, 002_roles_permissions.sql
--   (current_company_id(), has_permission(), can_access_site() already exist)
-- Rollback: see ROLLBACK section at the bottom
--
-- Forward-dependency note: `document_types` and `files` are formally owned by the
-- Sprint 6 (Regulatory / Enterprise Document Center) domain (docs/DATABASE_Part_05).
-- Only the minimal columns needed by Sprint 2 are created here. Sprint 6 will
-- ALTER TABLE to add the richer Regulatory-specific columns — it must not redefine
-- these tables.

-- ============================================================
-- DOCUMENT TYPES  (minimal pull-forward from Part_05 §2; FK dep for study_document_requirements)
-- ============================================================

CREATE TABLE document_types (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name                text        NOT NULL,
  category            text,
  required_by_default boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_types_company_name UNIQUE (company_id, name)
);

CREATE INDEX idx_document_types_company ON document_types(company_id);

CREATE TRIGGER document_types_updated_at
  BEFORE UPDATE ON document_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;

-- Read-only reference catalog for authenticated company members (same pattern as `roles`).
-- No INSERT/UPDATE/DELETE policy for authenticated users — seeded by migration/service-role only,
-- matching Sprint 1's `permissions` table pattern until Sprint 6 builds a management UI.
CREATE POLICY "document_types_select" ON document_types
  FOR SELECT USING (company_id = current_company_id());

-- ============================================================
-- FILES  (minimal pull-forward from Part_05 §9, exact schema; generic file metadata)
-- ============================================================

CREATE TABLE files (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  file_name      text        NOT NULL,
  original_name  text,
  file_extension text,
  mime_type      text,
  file_size      bigint,
  storage_path   text        NOT NULL,
  uploaded_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  checksum       text,
  ai_processed   boolean     NOT NULL DEFAULT false
);

CREATE INDEX idx_files_company ON files(company_id);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "files_select" ON files
  FOR SELECT USING (company_id = current_company_id());

-- INSERT is scoped to users who can create/edit studies (the only Sprint 2 upload flow).
-- Sprint 6/7 (Regulatory / Enterprise Document Center) will add further INSERT policies
-- for their own upload flows without altering this one.
CREATE POLICY "files_insert" ON files
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND (
      has_permission('create_study')
      OR has_permission('edit_study')
      OR has_permission('manage_studies')
    )
  );

-- ============================================================
-- STUDIES
-- ============================================================

CREATE TABLE studies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  study_name       text        NOT NULL,
  protocol_number  text,
  sponsor          text,
  cro              text,
  phase            text,
  therapeutic_area text,
  status           text        NOT NULL DEFAULT 'draft',
  start_date       date,
  end_date         date,
  protocol_version text,
  ai_generated     boolean     NOT NULL DEFAULT false,
  created_by       uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_studies_status CHECK (status IN ('draft', 'active', 'on_hold', 'closed', 'archived'))
);

CREATE INDEX idx_studies_company ON studies(company_id);
CREATE INDEX idx_studies_status  ON studies(company_id, status);

CREATE TRIGGER studies_updated_at
  BEFORE UPDATE ON studies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studies_select" ON studies
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_studies')
  );

CREATE POLICY "studies_insert" ON studies
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('create_study')
  );

CREATE POLICY "studies_update" ON studies
  FOR UPDATE USING (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  );

-- ============================================================
-- STUDY SITES  (FK -> companies, studies, sites)
-- ============================================================

CREATE TABLE study_sites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  study_id   uuid        NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  site_id    uuid        NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  status     text        NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_study_sites UNIQUE (study_id, site_id),
  CONSTRAINT chk_study_sites_status CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX idx_study_sites_study   ON study_sites(study_id);
CREATE INDEX idx_study_sites_site    ON study_sites(site_id);
CREATE INDEX idx_study_sites_company ON study_sites(company_id);

ALTER TABLE study_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_sites_select" ON study_sites
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_studies')
  );

CREATE POLICY "study_sites_insert" ON study_sites
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_studies')
  );

CREATE POLICY "study_sites_delete" ON study_sites
  FOR DELETE USING (
    company_id = current_company_id()
    AND has_permission('manage_studies')
  );

-- ============================================================
-- STUDY STAFF  (FK -> companies, studies, profiles)
-- ============================================================

CREATE TABLE study_staff (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  study_id   uuid        NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_role text        NOT NULL,
  start_date date,
  end_date   date,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_study_staff UNIQUE (study_id, user_id, staff_role),
  CONSTRAINT chk_study_staff_role CHECK (
    staff_role IN ('pi', 'sub_i', 'crc', 'data_entry', 'regulatory', 'site_director', 'other')
  )
);

CREATE INDEX idx_study_staff_study   ON study_staff(study_id);
CREATE INDEX idx_study_staff_user    ON study_staff(user_id);
CREATE INDEX idx_study_staff_company ON study_staff(company_id);

ALTER TABLE study_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_staff_select" ON study_staff
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_studies')
  );

CREATE POLICY "study_staff_insert" ON study_staff
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_studies')
  );

CREATE POLICY "study_staff_update" ON study_staff
  FOR UPDATE USING (
    company_id = current_company_id()
    AND has_permission('manage_studies')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_studies')
  );

CREATE POLICY "study_staff_delete" ON study_staff
  FOR DELETE USING (
    company_id = current_company_id()
    AND has_permission('manage_studies')
  );

-- ============================================================
-- VISIT TEMPLATES  (FK -> companies, studies, profiles)
-- Versioned: amendments insert a new row rather than mutating an approved version.
-- ============================================================

CREATE TABLE visit_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  study_id     uuid        NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  version      integer     NOT NULL DEFAULT 1,
  source       text        NOT NULL DEFAULT 'manual',
  status       text        NOT NULL DEFAULT 'draft',
  approved_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at  timestamptz,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_visit_templates_version UNIQUE (study_id, version),
  CONSTRAINT chk_visit_templates_source CHECK (source IN ('manual', 'ai_generated', 'imported')),
  CONSTRAINT chk_visit_templates_status CHECK (status IN ('draft', 'approved', 'archived'))
);

CREATE INDEX idx_visit_templates_study   ON visit_templates(study_id);
CREATE INDEX idx_visit_templates_company ON visit_templates(company_id);

CREATE TRIGGER visit_templates_updated_at
  BEFORE UPDATE ON visit_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE visit_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_templates_select" ON visit_templates
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_studies')
  );

CREATE POLICY "visit_templates_insert" ON visit_templates
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  );

CREATE POLICY "visit_templates_update" ON visit_templates
  FOR UPDATE USING (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  );

-- ============================================================
-- VISIT TEMPLATE ITEMS  (FK -> companies, visit_templates)
-- ============================================================

CREATE TABLE visit_template_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  template_id   uuid        NOT NULL REFERENCES visit_templates(id) ON DELETE CASCADE,
  visit_name    text        NOT NULL,
  visit_order   integer     NOT NULL,
  offset_days   integer     NOT NULL DEFAULT 0,
  window_before integer     NOT NULL DEFAULT 0,
  window_after  integer     NOT NULL DEFAULT 0,
  visit_type    text        NOT NULL DEFAULT 'scheduled',
  is_required   boolean     NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_visit_template_items_type CHECK (visit_type IN ('scheduled', 'unscheduled'))
);

CREATE INDEX idx_visit_template_items_template ON visit_template_items(template_id);
CREATE INDEX idx_visit_template_items_company  ON visit_template_items(company_id);

CREATE TRIGGER visit_template_items_updated_at
  BEFORE UPDATE ON visit_template_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE visit_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_template_items_select" ON visit_template_items
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_studies')
  );

CREATE POLICY "visit_template_items_insert" ON visit_template_items
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  );

CREATE POLICY "visit_template_items_update" ON visit_template_items
  FOR UPDATE USING (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  );

CREATE POLICY "visit_template_items_delete" ON visit_template_items
  FOR DELETE USING (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  );

-- ============================================================
-- STUDY DOCUMENTS  (FK -> companies, studies, files, profiles)
-- ============================================================

CREATE TABLE study_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  study_id      uuid        NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  file_id       uuid        NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  document_type text        NOT NULL,
  uploaded_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  ai_processed  boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_study_documents_type CHECK (
    document_type IN (
      'protocol', 'icf', 'investigator_brochure', 'pharmacy_manual',
      'laboratory_manual', 'schedule_of_assessments', 'other'
    )
  )
);

CREATE INDEX idx_study_documents_study   ON study_documents(study_id);
CREATE INDEX idx_study_documents_file    ON study_documents(file_id);
CREATE INDEX idx_study_documents_company ON study_documents(company_id);

ALTER TABLE study_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_documents_select" ON study_documents
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_studies')
  );

CREATE POLICY "study_documents_insert" ON study_documents
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('create_study') OR has_permission('edit_study') OR has_permission('manage_studies'))
  );

-- ============================================================
-- STUDY AI EXTRACTIONS  (FK -> companies, studies, profiles)
-- AI output never becomes production data until reviewed and approved.
-- ============================================================

CREATE TABLE study_ai_extractions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  study_id        uuid        NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  extraction_type text        NOT NULL,
  confidence      numeric(5,4),
  extracted_data  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  approved        boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_study_ai_extractions_type CHECK (
    extraction_type IN (
      'study_profile', 'visit_template', 'inclusion_criteria', 'exclusion_criteria',
      'schedule_of_assessments', 'protocol_amendment_comparison'
    )
  )
);

CREATE INDEX idx_study_ai_extractions_study   ON study_ai_extractions(study_id);
CREATE INDEX idx_study_ai_extractions_company ON study_ai_extractions(company_id);

ALTER TABLE study_ai_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_ai_extractions_select" ON study_ai_extractions
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_studies')
  );

-- No INSERT policy for authenticated users — extractions are written exclusively by the
-- `protocol-ai` Edge Function via the service-role client (matches notification_email_queue's
-- service-role-only write pattern).

CREATE POLICY "study_ai_extractions_update" ON study_ai_extractions
  FOR UPDATE USING (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (has_permission('edit_study') OR has_permission('manage_studies'))
  );

-- ============================================================
-- STUDY DOCUMENT REQUIREMENTS  (FK -> companies, studies, document_types)
-- Populated by StudyService.activateStudy() from document_types.required_by_default
-- (GAP-BL-05) — plain synchronous step for now; revisit via the Business Rule Engine
-- once it exists (Sprint 9).
-- ============================================================

CREATE TABLE study_document_requirements (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  study_id            uuid        NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  document_type_id    uuid        NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
  required            boolean     NOT NULL DEFAULT true,
  expiration_required boolean     NOT NULL DEFAULT false,
  applies_to          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_study_document_requirements UNIQUE (study_id, document_type_id)
);

CREATE INDEX idx_study_document_requirements_study ON study_document_requirements(study_id);
CREATE INDEX idx_study_document_requirements_type  ON study_document_requirements(document_type_id);
CREATE INDEX idx_study_document_requirements_company ON study_document_requirements(company_id);

ALTER TABLE study_document_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_document_requirements_select" ON study_document_requirements
  FOR SELECT USING (
    company_id = current_company_id()
    AND has_permission('view_studies')
  );

CREATE POLICY "study_document_requirements_insert" ON study_document_requirements
  FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND has_permission('manage_studies')
  );

-- ============================================================
-- STORAGE BUCKETS
-- protocols: uploaded protocol PDFs (signed URLs, 1hr expiry, enforced client-side)
-- studies:   other study-related files (manuals, supporting docs)
-- Objects are stored under `${company_id}/...` — RLS enforces the folder prefix
-- matches the uploader's own company.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('protocols', 'protocols', false), ('studies', 'studies', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "protocols_insert_own_company" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'protocols'
    AND (storage.foldername(name))[1] = current_company_id()::text
  );

CREATE POLICY "protocols_select_own_company" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'protocols'
    AND (storage.foldername(name))[1] = current_company_id()::text
  );

CREATE POLICY "studies_bucket_insert_own_company" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'studies'
    AND (storage.foldername(name))[1] = current_company_id()::text
  );

CREATE POLICY "studies_bucket_select_own_company" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'studies'
    AND (storage.foldername(name))[1] = current_company_id()::text
  );

-- ============================================================
-- ROLLBACK
-- DROP POLICY IF EXISTS "studies_bucket_select_own_company" ON storage.objects;
-- DROP POLICY IF EXISTS "studies_bucket_insert_own_company" ON storage.objects;
-- DROP POLICY IF EXISTS "protocols_select_own_company" ON storage.objects;
-- DROP POLICY IF EXISTS "protocols_insert_own_company" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id IN ('protocols', 'studies');
-- DROP TABLE IF EXISTS study_document_requirements CASCADE;
-- DROP TABLE IF EXISTS study_ai_extractions CASCADE;
-- DROP TABLE IF EXISTS study_documents CASCADE;
-- DROP TABLE IF EXISTS visit_template_items CASCADE;
-- DROP TABLE IF EXISTS visit_templates CASCADE;
-- DROP TABLE IF EXISTS study_staff CASCADE;
-- DROP TABLE IF EXISTS study_sites CASCADE;
-- DROP TABLE IF EXISTS studies CASCADE;
-- DROP TABLE IF EXISTS files CASCADE;
-- DROP TABLE IF EXISTS document_types CASCADE;
-- ============================================================
