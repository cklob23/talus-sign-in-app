-- =============================================================================
-- scripts/015-location-auto-signout.sql
--
-- Additive only. Safe to run more than once (IF NOT EXISTS).
-- Does not drop or rewrite existing objects. Does not write sign-in rows.
--
-- Why this exists: end-of-day auto sign-out times must be configurable per
-- location. Global settings (location_id IS NULL) stay the fallback:
--   auto_sign_out_employees      default on
--   auto_sign_out_employees_time default 18:00
--   auto_sign_out_visitors       default on
--   auto_sign_out_visitors_time  default 23:45
-- A NULL column on locations means "use the global value". A non-null value
-- is a per-location override. Times are local wall-clock in locations.timezone.
--
-- Today's sites all use 18:00 local for employees:
--   US (Boone, Eagle Grove, Test) = 18:00 America/Chicago (6 PM CT)
--   Kenya Site, Kenya Farm Site   = 18:00 Africa/Nairobi (6 PM EAT)
--   Spain Site                    = 18:00 Europe/Madrid (6 PM local)
-- Visitor default stays 23:45 local unless an admin sets an override.
-- This script does NOT write clock-time overrides. 18:00 local is already
-- the global employee default. Future divergence is set in Admin > Locations.
--
-- Run order: deploy the application first. The app treats a missing column as
-- optional (Postgres 42703) and keeps using global settings until this script
-- has been applied. After deploy, run this script in the Supabase SQL editor.
-- Do not run this against a live database from the app.
--
-- After this script, confirm in Admin > Locations:
--   Boone / Eagle Grove / Test use America/Chicago
--   Kenya Site and Kenya Farm Site use Africa/Nairobi
--   Spain Site uses Europe/Madrid
-- Then leave employee time on the global 18:00 default, or set a per-location
-- override when a site needs a different clock time.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-location overrides. NULL = use the matching global setting.
-- ---------------------------------------------------------------------------

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS auto_sign_out_employees BOOLEAN;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS auto_sign_out_employees_time TEXT;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS auto_sign_out_visitors BOOLEAN;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS auto_sign_out_visitors_time TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'locations_auto_sign_out_employees_time_hm'
  ) THEN
    ALTER TABLE public.locations
      ADD CONSTRAINT locations_auto_sign_out_employees_time_hm
      CHECK (
        auto_sign_out_employees_time IS NULL
        OR auto_sign_out_employees_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'locations_auto_sign_out_visitors_time_hm'
  ) THEN
    ALTER TABLE public.locations
      ADD CONSTRAINT locations_auto_sign_out_visitors_time_hm
      CHECK (
        auto_sign_out_visitors_time IS NULL
        OR auto_sign_out_visitors_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Align known site timezones. Clock times stay on the global 18:00 default.
--    Names are matched exactly (plus a few US aliases). Review in admin after.
-- ---------------------------------------------------------------------------

UPDATE public.locations
SET timezone = 'America/Chicago',
    updated_at = NOW()
WHERE name IN (
  'Boone',
  'Boone Site',
  'Eagle Grove',
  'Eagle Grove Site',
  'Test',
  'Test Site',
  'Test Location'
);

UPDATE public.locations
SET timezone = 'Africa/Nairobi',
    updated_at = NOW()
WHERE name IN (
  'Kenya Site',
  'Kenya Farm Site'
);

UPDATE public.locations
SET timezone = 'Europe/Madrid',
    updated_at = NOW()
WHERE name IN (
  'Spain Site'
);
