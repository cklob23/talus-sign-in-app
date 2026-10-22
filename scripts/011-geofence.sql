-- =============================================================================
-- scripts/011-geofence.sql
--
-- Additive only. Safe to run before or after this deploy.
-- Does not drop or rewrite existing objects.
-- Does not change any location rows (coordinates, radii, names, or flags).
--
-- Why this exists: optional durability for geofence jump detection, an
-- explicit per-site on/off flag, and a write-time radius guard so new values
-- cannot be 5,000 km again. Existing out-of-range radii stay as they are
-- until an admin edits them.
--
-- Run order: deploy the application first. The app treats a missing table or
-- column as optional (Postgres 42P01 / 42703). After deploy, run this script
-- in the Supabase SQL editor. Do not run this against a live database from
-- the app.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Optional per-site flag. NULL means "infer from radius" (0 = off).
-- ---------------------------------------------------------------------------

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS geofence_enabled BOOLEAN;

-- ---------------------------------------------------------------------------
-- 2. Recent device readings used for impossible-jump checks.
--    The app also keeps an in-process map and ignores a missing table.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.geofence_sightings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS geofence_sightings_scope_seen_idx
  ON public.geofence_sightings (scope_key, seen_at DESC);

ALTER TABLE public.geofence_sightings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read geofence_sightings" ON public.geofence_sightings;
CREATE POLICY "Admins can read geofence_sightings" ON public.geofence_sightings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

GRANT SELECT ON public.geofence_sightings TO authenticated;
GRANT ALL ON public.geofence_sightings TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Radius guard on INSERT / radius change. Leaves existing values alone.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.locations_radius_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.auto_signin_radius_meters IS NOT DISTINCT FROM OLD.auto_signin_radius_meters THEN
    RETURN NEW;
  END IF;

  IF NEW.auto_signin_radius_meters IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.auto_signin_radius_meters = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.auto_signin_radius_meters < 25 OR NEW.auto_signin_radius_meters > 5000 THEN
    RAISE EXCEPTION 'auto_signin_radius_meters must be 0 (off) or between 25 and 5000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS locations_radius_guard ON public.locations;
CREATE TRIGGER locations_radius_guard
  BEFORE INSERT OR UPDATE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.locations_radius_guard();
