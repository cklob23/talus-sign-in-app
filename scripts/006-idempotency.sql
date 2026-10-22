-- =============================================================================
-- scripts/006-idempotency.sql
--
-- Additive only. Safe to run before or after the live-reliability deploy.
-- Does not drop or rewrite existing objects.
--
-- Why this exists: Cloudflare / HTTP3 can replay a POST while the app is
-- blocked on SMTP. One visitor tap then creates multiple sign_ins rows and
-- multiple host emails. The unique idempotency key plus the notification
-- marker make those repeats return the original result and send at most one
-- email/SMS per sign-in and type.
--
-- Run order: deploy the new application code, confirm kiosk and QR sign-in
-- still work, then run this script in the Supabase SQL editor. The app
-- tolerates a missing column or table (it retries without the key / skips
-- the claim) so a short gap is safe. Full replay protection starts once
-- this script has been applied.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Client-generated idempotency key on the sign-in row
-- ---------------------------------------------------------------------------

ALTER TABLE public.sign_ins
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sign_ins_idempotency_key_uidx
  ON public.sign_ins (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. At-most-once host notification marker
--
-- Unique on (sign_in_id, notification_type) once a visit exists.
-- Unique on idempotency_key so a training-start email (no sign_in yet)
-- cannot be sent twice for the same client submit.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.host_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sign_in_id UUID REFERENCES public.sign_ins(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS host_notifications_sign_in_type_uidx
  ON public.host_notifications (sign_in_id, notification_type)
  WHERE sign_in_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS host_notifications_idempotency_key_uidx
  ON public.host_notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
