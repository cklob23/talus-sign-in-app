-- =============================================================================
-- scripts/008-sync-runs.sql
--
-- Additive only. Safe to run before or after the Sync page deploy.
-- Does not drop or rewrite existing objects.
--
-- Why this exists: cron and manual connector syncs need a durable run row
-- so the admin Sync page can show live progress (phase, counts, heartbeat)
-- and a history table. Older history still comes from audit_logs
-- (scheduled_sync.*) until this table is populated.
--
-- Run order: deploy the new application code first. The app treats a missing
-- table as optional (Postgres 42P01) and keeps syncing. After deploy, run
-- this script in the Supabase SQL editor. Live progress and the new history
-- rows start once it has been applied. Do not run this against a live
-- database from the app.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Run rows
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('azure', 'ramp')),
  trigger TEXT NOT NULL CHECK (trigger IN ('cron', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  phase TEXT,
  progress_current INTEGER,
  progress_total INTEGER,
  synced INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  deactivated INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_runs_started_at_idx
  ON public.sync_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS sync_runs_status_idx
  ON public.sync_runs (status);

CREATE INDEX IF NOT EXISTS sync_runs_provider_idx
  ON public.sync_runs (provider);

-- ---------------------------------------------------------------------------
-- 2. RLS: admins read, service role writes (service_role bypasses RLS)
-- ---------------------------------------------------------------------------

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read sync_runs" ON public.sync_runs;
CREATE POLICY "Admins can read sync_runs" ON public.sync_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

GRANT SELECT ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;
