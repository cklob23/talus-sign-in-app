-- =============================================================================
-- scripts/014-reports-alltime.sql
--
-- Additive only. Safe to run more than once.
-- Expands report_schedules.range_type so scheduled reports can use Today and
-- All time. Does not drop tables or rewrite existing rows.
--
-- Run after deploy, in the Supabase SQL editor. The app can show the new
-- range options before this script is applied. Saving a Today or All time
-- schedule fails until the check constraint is updated.
-- =============================================================================

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'report_schedules'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%range_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.report_schedules DROP CONSTRAINT IF EXISTS %I', cname);
  END LOOP;
END $$;

ALTER TABLE public.report_schedules
  ADD CONSTRAINT report_schedules_range_type_check
  CHECK (range_type IN ('previous_day', 'previous_week', 'previous_month', 'last_n_days', 'today', 'all_time'));
