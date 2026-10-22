-- =============================================================================
-- scripts/009-training-links.sql
--
-- Additive only. Safe to run before or after the training-links deploy.
-- Does not drop or rewrite existing objects. Does not write visitor data.
--
-- Why this exists: training links and 6-digit skip codes need durable rows.
-- Completions stay on training_completions. A source column records whether
-- the visitor finished from a link, the kiosk, or a QR poster so the shared
-- cleared check can skip the video (link) or send a code (returning visitor).
--
-- Run order: deploy the new application code first. The app treats a missing
-- table or column as optional (Postgres 42P01 / 42703) and falls back to the
-- video. After deploy, run this script in the Supabase SQL editor. Do not run
-- this against a live database from the app.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Completion source (link vs kiosk/QR). Existing rows stay valid.
-- ---------------------------------------------------------------------------

ALTER TABLE public.training_completions
  ADD COLUMN IF NOT EXISTS source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'training_completions_source_check'
  ) THEN
    ALTER TABLE public.training_completions
      ADD CONSTRAINT training_completions_source_check
      CHECK (source IS NULL OR source IN ('kiosk', 'qr', 'training_link', 'prior'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS training_completions_visitor_type_expires_idx
  ON public.training_completions (visitor_id, visitor_type_id, expires_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Normalized email lookup for the shared cleared check
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS visitors_email_normalized_idx
  ON public.visitors (lower(trim(email)))
  WHERE email IS NOT NULL AND trim(email) <> '';

-- ---------------------------------------------------------------------------
-- 3. One-time 6-digit training codes (hashed, 30 minutes, attempt capped)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL,
  visitor_type_id UUID NOT NULL REFERENCES public.visitor_types(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS training_codes_lookup_idx
  ON public.training_codes (email_normalized, visitor_type_id, created_at DESC);

CREATE INDEX IF NOT EXISTS training_codes_expires_idx
  ON public.training_codes (expires_at);

-- ---------------------------------------------------------------------------
-- 4. Audit of training links staff send (token itself is HMAC-signed)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_link_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_email TEXT NOT NULL,
  visitor_first_name TEXT NOT NULL,
  visitor_last_name TEXT NOT NULL,
  visitor_company TEXT,
  visitor_type_id UUID NOT NULL REFERENCES public.visitor_types(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  host_id UUID REFERENCES public.hosts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS training_link_sends_email_idx
  ON public.training_link_sends (lower(trim(visitor_email)), created_at DESC);

CREATE INDEX IF NOT EXISTS training_link_sends_booking_idx
  ON public.training_link_sends (booking_id)
  WHERE booking_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. RLS: staff read their own sends; service role writes everything
-- ---------------------------------------------------------------------------

ALTER TABLE public.training_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_link_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read training_codes" ON public.training_codes;
CREATE POLICY "Admins can read training_codes" ON public.training_codes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'staff')
    )
  );

DROP POLICY IF EXISTS "Staff can read training_link_sends" ON public.training_link_sends;
CREATE POLICY "Staff can read training_link_sends" ON public.training_link_sends
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'staff')
    )
  );

GRANT SELECT ON public.training_codes TO authenticated;
GRANT SELECT ON public.training_link_sends TO authenticated;
GRANT ALL ON public.training_codes TO service_role;
GRANT ALL ON public.training_link_sends TO service_role;
GRANT SELECT, UPDATE ON public.training_completions TO service_role;
