-- =============================================================================
-- scripts/010-requires-photo.sql
--
-- Additive only. Safe to run before or after the ui-fixes deploy.
-- Does not drop or rewrite existing objects. Does not write visitor data.
--
-- Why this exists: some visitor types (for example contractors) always need a
-- badge photo, and some (for example short interviews) do not. The app used to
-- treat every type as photo-required. This flag keeps that default while letting
-- staff turn it off per type. The kiosk still has a staff override.
--
-- Run order: deploy the new application code first. The app treats a missing
-- column as optional (Postgres 42703) and falls back to "photo required" so
-- current behaviour does not change. After deploy, run this script in the
-- Supabase SQL editor. Do not run this against a live database from the app.
-- =============================================================================

ALTER TABLE public.visitor_types
  ADD COLUMN IF NOT EXISTS requires_photo BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.visitor_types.requires_photo IS
  'When true, kiosk and QR ask for a badge photo. Default true matches prior behaviour. Staff can override on the kiosk.';
