-- =============================================================================
-- scripts/013-reports.sql
--
-- Additive only. Safe to run before or after the reports deploy.
-- Does not drop or rewrite existing objects. Does not write visitor sign-ins.
--
-- Why this exists: scheduled CSV reports need durable schedule and run rows,
-- and training completions need a site so Training reports can filter by
-- location. Completions already have visitor, visitor type, completed, expiry,
-- and source. Location was missing.
--
-- Run order: deploy the new application code first. The app treats a missing
-- table or column as optional (Postgres 42P01 / 42703) and skips scheduled
-- sends until this script has been applied. After deploy, run this script in
-- the Supabase SQL editor. Do not run this against a live database from the app.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Site on training completions
-- ---------------------------------------------------------------------------

ALTER TABLE public.training_completions
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS training_completions_location_completed_idx
  ON public.training_completions (location_id, completed_at DESC);

-- Prefer the visitor type's site (types are per location in production).
UPDATE public.training_completions AS tc
SET location_id = vt.location_id
FROM public.visitor_types AS vt
WHERE tc.location_id IS NULL
  AND tc.visitor_type_id = vt.id
  AND vt.location_id IS NOT NULL;

-- Remaining rows: the visitor's latest sign-in site.
UPDATE public.training_completions AS tc
SET location_id = latest.location_id
FROM (
  SELECT DISTINCT ON (visitor_id) visitor_id, location_id
  FROM public.sign_ins
  WHERE location_id IS NOT NULL
  ORDER BY visitor_id, sign_in_time DESC
) AS latest
WHERE tc.location_id IS NULL
  AND tc.visitor_id = latest.visitor_id;

-- ---------------------------------------------------------------------------
-- 2. Schedules
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('visitors', 'employees', 'training')),
  location_ids UUID[] NOT NULL DEFAULT '{}',
  visitor_type_ids UUID[] NOT NULL DEFAULT '{}',
  range_type TEXT NOT NULL CHECK (range_type IN ('previous_day', 'previous_week', 'previous_month', 'last_n_days')),
  last_n_days INTEGER,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  weekday INTEGER CHECK (weekday IS NULL OR (weekday >= 0 AND weekday <= 6)),
  month_day INTEGER CHECK (month_day IS NULL OR (month_day >= 1 AND month_day <= 31)),
  send_time TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  recipients TEXT[] NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'summary', 'both')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_schedules_next_run_idx
  ON public.report_schedules (enabled, next_run_at);

-- ---------------------------------------------------------------------------
-- 3. Runs. Scheduled sends are idempotent on (schedule_id, period_start).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.report_schedules(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'sent', 'failed', 'skipped')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  row_count INTEGER,
  recipients TEXT[],
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS report_runs_schedule_started_idx
  ON public.report_runs (schedule_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS report_runs_schedule_period_scheduled_idx
  ON public.report_runs (schedule_id, period_start)
  WHERE trigger = 'scheduled';

-- ---------------------------------------------------------------------------
-- 4. RLS: admins and super_admins read; service role writes
-- ---------------------------------------------------------------------------

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read report_schedules" ON public.report_schedules;
CREATE POLICY "Admins can read report_schedules" ON public.report_schedules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can read report_runs" ON public.report_runs;
CREATE POLICY "Admins can read report_runs" ON public.report_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

GRANT SELECT ON public.report_schedules TO authenticated;
GRANT SELECT ON public.report_runs TO authenticated;
GRANT ALL ON public.report_schedules TO service_role;
GRANT ALL ON public.report_runs TO service_role;
GRANT SELECT, UPDATE ON public.training_completions TO service_role;
