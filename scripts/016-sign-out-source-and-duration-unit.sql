-- =============================================================================
-- scripts/016-sign-out-source-and-duration-unit.sql
--
-- Additive only. Safe to run more than once (IF NOT EXISTS).
-- Does not drop or rewrite existing objects. Does not write sign-in rows.
--
-- Why this exists:
--   1. Admins need to see whether a visitor or employee signed out manually
--      (kiosk / admin / visit page / QR) or automatically (end-of-day cron
--      or scheduled location sign-out).
--   2. Visitor and employee reports need a stored Minutes vs Hours choice
--      for on-site duration. Training reports ignore this column.
--
-- Run order: deploy the application first. The app treats a missing column
-- as optional (Postgres 42703) and keeps signing people out / defaulting
-- duration to minutes until this script has been applied. After deploy, run
-- this script in the Supabase SQL editor. Do not run this against a live
-- database from the app.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sign-out source on visitor and employee visits
-- ---------------------------------------------------------------------------

ALTER TABLE public.sign_ins
  ADD COLUMN IF NOT EXISTS sign_out_source TEXT;

ALTER TABLE public.employee_sign_ins
  ADD COLUMN IF NOT EXISTS sign_out_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sign_ins_sign_out_source_check'
  ) THEN
    ALTER TABLE public.sign_ins
      ADD CONSTRAINT sign_ins_sign_out_source_check
      CHECK (sign_out_source IS NULL OR sign_out_source IN ('manual', 'auto'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_sign_ins_sign_out_source_check'
  ) THEN
    ALTER TABLE public.employee_sign_ins
      ADD CONSTRAINT employee_sign_ins_sign_out_source_check
      CHECK (sign_out_source IS NULL OR sign_out_source IN ('manual', 'auto'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sign_ins_sign_out_source_idx
  ON public.sign_ins (sign_out_source)
  WHERE sign_out_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS employee_sign_ins_sign_out_source_idx
  ON public.employee_sign_ins (sign_out_source)
  WHERE sign_out_source IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Duration unit on scheduled reports (minutes default = current behavior)
-- ---------------------------------------------------------------------------

ALTER TABLE public.report_schedules
  ADD COLUMN IF NOT EXISTS duration_unit TEXT;

UPDATE public.report_schedules
SET duration_unit = 'minutes'
WHERE duration_unit IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'report_schedules_duration_unit_check'
  ) THEN
    ALTER TABLE public.report_schedules
      ADD CONSTRAINT report_schedules_duration_unit_check
      CHECK (duration_unit IS NULL OR duration_unit IN ('minutes', 'hours'));
  END IF;
END $$;

ALTER TABLE public.report_schedules
  ALTER COLUMN duration_unit SET DEFAULT 'minutes';
