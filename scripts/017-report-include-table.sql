-- =============================================================================
-- scripts/017-report-include-table.sql
--
-- Additive only. Safe to run more than once (IF NOT EXISTS).
-- Does not drop or rewrite existing objects. Does not write sign-in rows.
--
-- Why this exists: scheduled reports can attach a CSV, and optionally also
-- put the same table in the email body. Existing schedules stay CSV-only
-- (include_table defaults to false) so nothing changes until an admin
-- turns the option on.
--
-- Run order: deploy the application first. The app treats a missing column
-- as optional (Postgres 42703) and keeps include_table = false until this
-- script has been applied. After deploy, run this script in the Supabase
-- SQL editor. Do not run this against a live database from the app.
-- =============================================================================

ALTER TABLE public.report_schedules
  ADD COLUMN IF NOT EXISTS include_table BOOLEAN;

UPDATE public.report_schedules
SET include_table = false
WHERE include_table IS NULL;

ALTER TABLE public.report_schedules
  ALTER COLUMN include_table SET DEFAULT false;
