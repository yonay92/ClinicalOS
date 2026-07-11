-- Migration: 007_sites_module.sql
-- Description: Completes the Sites schema for the full Site Management module
--   (previously just a Sprint 1 foundation table + Sprint 3-era CRUD placeholder).
--   Adds the fields the Site Profile needs (PI, timezone), an 'archived' status
--   value so Sites get the same Active/Archived/All lifecycle as Studies, and the
--   force_archive_site override permission — reusing the exact same "dangerous
--   operation" pattern as force_archive_study (see BUSINESS_RULES_02_Studies.md).
-- Depends on: 001_companies_sites_users.sql (sites), 006_study_archive_and_role_permission_management.sql
-- Rollback: see ROLLBACK section at the bottom

-- ============================================================
-- SITES — new profile fields
-- ============================================================

ALTER TABLE sites
  ADD COLUMN principal_investigator text,
  ADD COLUMN timezone text;

-- ============================================================
-- SITES — archived status
-- Existing values (active/inactive/closed) are kept for schema stability;
-- the new UI only ever exposes Active / Inactive / Archived.
--
-- The original constraint was an unnamed inline column CHECK
-- (001_companies_sites_users.sql), so Postgres auto-generated its name —
-- find and drop it dynamically rather than guessing.
-- ============================================================

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'sites'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sites DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE sites
  ADD CONSTRAINT chk_sites_status CHECK (status IN ('active', 'inactive', 'closed', 'archived'));

-- ============================================================
-- PERMISSIONS — force_archive_site
-- Not inserted into role_permissions for any role here — same as
-- force_archive_study, a company owner must consciously enable it per-role
-- from Settings > Roles.
-- ============================================================

INSERT INTO permissions (key, module, description)
VALUES (
  'force_archive_site',
  'settings',
  'Archive a site that still has enrolled subjects (overrides the normal block)'
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROLLBACK
-- DELETE FROM permissions WHERE key = 'force_archive_site';
-- ALTER TABLE sites DROP CONSTRAINT IF EXISTS chk_sites_status;
-- ALTER TABLE sites ADD CONSTRAINT chk_sites_status CHECK (status IN ('active', 'inactive', 'closed'));
-- ALTER TABLE sites DROP COLUMN IF EXISTS timezone;
-- ALTER TABLE sites DROP COLUMN IF EXISTS principal_investigator;
-- ============================================================
