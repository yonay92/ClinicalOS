-- Seed: 001_roles.sql
-- Description: Default system roles seeded at company provisioning time.
-- These are inserted per-company by CompanyService.provision() — not globally.
-- This file documents the canonical role definitions for reference.

-- System roles (is_system_role = true) cannot be deleted.
-- role keys must match SECURITY.md §5 and CODING_STANDARDS.md role definitions.

-- INSERT pattern used by CompanyService.provision(company_id uuid):
--
-- INSERT INTO roles (company_id, name, key, description, is_system_role) VALUES
--   (company_id, 'Administrator',  'admin',      'Full system access including settings, users, and audit logs', true),
--   (company_id, 'CEO',            'ceo',        'Executive read access to dashboards and reports', true),
--   (company_id, 'CRC',            'crc',        'Clinical Research Coordinator — manages subjects, visits, and chart readiness', true),
--   (company_id, 'Data Entry',     'data_entry', 'Enters chart data in EDC system', true),
--   (company_id, 'Regulatory',     'regulatory', 'Manages regulatory documents, binders, and expiration tracking', true),
--   (company_id, 'PI',             'pi',         'Principal Investigator — read access to assigned studies and subjects', true);
