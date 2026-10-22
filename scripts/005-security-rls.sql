-- =============================================================================
-- scripts/005-security-rls.sql
--
-- Caleb: run this ONLY AFTER the new application code is deployed and the
-- kiosk has been verified (receptionist unlock, visitor sign-in, sign-out,
-- and a QR check-in if you use posters).
--
-- Why order matters: the live kiosk currently reads and writes visitors and
-- sign_ins with the browser anon key. The new code moves those calls behind
-- authenticated server routes. Dropping the anon policies before that deploy
-- will break every kiosk on site.
--
-- The live schema is not fully in git, so every statement is defensive
-- (IF EXISTS / OR REPLACE). Review pg_policies if a name does not match.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Remove anonymous access to visitor PII and sign-in records
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow anonymous to insert visitors" ON public.visitors;
DROP POLICY IF EXISTS "Allow anonymous to view visitors" ON public.visitors;
DROP POLICY IF EXISTS "Allow anonymous users to insert visitors" ON public.visitors;
DROP POLICY IF EXISTS "Allow anonymous users to view visitors" ON public.visitors;
DROP POLICY IF EXISTS "anon insert visitors" ON public.visitors;
DROP POLICY IF EXISTS "anon select visitors" ON public.visitors;

DROP POLICY IF EXISTS "Allow anonymous to insert sign-ins" ON public.sign_ins;
DROP POLICY IF EXISTS "Allow anonymous to update sign_ins" ON public.sign_ins;
DROP POLICY IF EXISTS "Allow anonymous to insert sign_ins" ON public.sign_ins;
DROP POLICY IF EXISTS "Allow anonymous to update sign-ins" ON public.sign_ins;
DROP POLICY IF EXISTS "Allow anonymous users to insert sign_ins" ON public.sign_ins;
DROP POLICY IF EXISTS "Allow anonymous users to update sign_ins" ON public.sign_ins;
DROP POLICY IF EXISTS "anon insert sign_ins" ON public.sign_ins;
DROP POLICY IF EXISTS "anon update sign_ins" ON public.sign_ins;

-- ---------------------------------------------------------------------------
-- 2. Stop a signed-in user from promoting themselves
--
-- The existing "users update their own profile" policy has no column
-- restriction. A trigger (not a policy rewrite) is used so admins can still
-- change roles through the service-role admin API, and so we do not have to
-- know the exact live policy name.
--
-- Privileged columns blocked for non-admin, non-service-role updates:
--   role, is_active, custom_role_id, directory_status, account_locked_until
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text;
  actor_role text;
BEGIN
  jwt_role := coalesce(auth.role(), current_setting('role', true), '');
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT p.role INTO actor_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF actor_role IN ('admin', 'super_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.custom_role_id IS DISTINCT FROM OLD.custom_role_id
     OR NEW.directory_status IS DISTINCT FROM OLD.directory_status
     OR NEW.account_locked_until IS DISTINCT FROM OLD.account_locked_until
  THEN
    RAISE EXCEPTION 'Cannot modify privileged profile columns';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_privileged_profile_columns ON public.profiles;
CREATE TRIGGER protect_privileged_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privileged_profile_columns();

-- Tighten the self-update policy if the name from scripts/002 is still live.
-- WITH CHECK keeps the row owned by the same user after the update.
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
CREATE POLICY "Allow users to update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
