-- Sprint 3: AI Draft workflow overhaul — new Study metadata fields extracted
-- (or manually entered) as part of the guided AI Draft review screen.

alter table studies
  add column if not exists indication text,
  add column if not exists estimated_enrollment integer,
  add column if not exists study_duration text,
  add column if not exists study_design text,
  add column if not exists primary_endpoint text;
