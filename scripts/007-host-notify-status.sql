-- =============================================================================
-- scripts/007-host-notify-status.sql
--
-- Additive only. Safe to run before or after the host-email-retry deploy.
-- Does not drop or rewrite existing objects.
--
-- Why this exists: host_notifications used to insert a row before SMTP ran.
-- A connect timeout then left the claim in place, so a later retry for the
-- same sign_in + type was treated as a duplicate and never sent. Status lets
-- the app record sent or failed (with a short error) and reclaim a failed row.
--
-- Existing rows default to sent so a successful email from before this script
-- is not sent again. New inserts set status to pending, then sent or failed.
-- The app tolerates a missing column (it skips the status write).
-- =============================================================================

ALTER TABLE public.host_notifications
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';

ALTER TABLE public.host_notifications
  ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE public.host_notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
