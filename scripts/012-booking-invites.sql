-- =============================================================================
-- scripts/012-booking-invites.sql
--
-- Additive only. Safe to run more than once (IF NOT EXISTS).
-- Does not drop or rewrite existing objects. Does not write visitor data.
--
-- Why this exists: pre-registration invite emails need a language, a send
-- mode, a scheduled send time, and a durable send status so the cron can
-- claim a row once and never double-send.
--
-- Run order: deploy the application first. After deploy, run this script in
-- the Supabase SQL editor. Do not run this against a live database from the
-- app. Caleb creates the Render cron (talus-reports) separately.
-- =============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS invite_mode TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS invite_lead_minutes INTEGER;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS invite_send_at TIMESTAMPTZ;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS invite_status TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS invite_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS invite_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_preferred_language_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_preferred_language_check
      CHECK (preferred_language IN ('en', 'es'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_invite_mode_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_invite_mode_check
      CHECK (invite_mode IN ('now', 'scheduled', 'manual'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_invite_status_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_invite_status_check
      CHECK (invite_status IN ('none', 'scheduled', 'sending', 'sent', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS bookings_invite_due_idx
  ON public.bookings (invite_status, invite_send_at)
  WHERE invite_status = 'scheduled' AND invite_send_at IS NOT NULL;
