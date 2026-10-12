-- ============================================================
-- Field Report: production anti-abuse + trial (run in SQL Editor)
-- Idempotent / safe to re-run
-- ============================================================

-- 1) Phone registrations (90-day cooldown)
CREATE TABLE IF NOT EXISTS public.phone_registrations (
  phone text PRIMARY KEY,
  last_registered_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS phone_registrations_last_idx
  ON public.phone_registrations (last_registered_at);

ALTER TABLE public.phone_registrations ENABLE ROW LEVEL SECURITY;

-- No direct table reads/writes for clients — only via SECURITY DEFINER RPCs
DROP POLICY IF EXISTS "phone_no_direct_select" ON public.phone_registrations;
DROP POLICY IF EXISTS "phone_no_direct_insert" ON public.phone_registrations;

-- 2) User profiles (trial start + plan)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  plan text NOT NULL DEFAULT 'trial',
  is_pro boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, trial_started_at, plan, is_pro)
  VALUES (NEW.id, NEW.email, now(), 'trial', false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) RPC: is phone on 90-day cooldown? (true = BLOCKED)
CREATE OR REPLACE FUNCTION public.check_phone_cooldown(p_phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_at timestamptz;
  normalized text;
BEGIN
  normalized := regexp_replace(coalesce(p_phone, ''), '\s', '', 'g');
  IF normalized = '' THEN
    RETURN true; -- empty phone treat as blocked
  END IF;
  SELECT last_registered_at INTO last_at
  FROM public.phone_registrations
  WHERE phone = normalized;
  IF last_at IS NULL THEN
    RETURN false;
  END IF;
  RETURN (now() - last_at) < interval '90 days';
END;
$$;

REVOKE ALL ON FUNCTION public.check_phone_cooldown(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_phone_cooldown(text) TO anon, authenticated;

-- 4) RPC: claim phone after successful signup (records cooldown)
CREATE OR REPLACE FUNCTION public.claim_phone_for_trial(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text;
  last_at timestamptz;
  uid uuid;
BEGIN
  uid := auth.uid();
  normalized := regexp_replace(coalesce(p_phone, ''), '\s', '', 'g');
  IF normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Phone required');
  END IF;

  SELECT last_registered_at INTO last_at
  FROM public.phone_registrations
  WHERE phone = normalized;

  IF last_at IS NOT NULL AND (now() - last_at) < interval '90 days' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This phone number was already used for a free trial recently.'
    );
  END IF;

  INSERT INTO public.phone_registrations (phone, last_registered_at, user_id)
  VALUES (normalized, now(), uid)
  ON CONFLICT (phone) DO UPDATE
    SET last_registered_at = now(),
        user_id = coalesce(EXCLUDED.user_id, public.phone_registrations.user_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_phone_for_trial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_phone_for_trial(text) TO authenticated;

-- 5) RPC: get my trial/plan status
CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.profiles%ROWTYPE;
  uid uuid;
  expired boolean;
  days_left int;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO r FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, trial_started_at, plan, is_pro)
    VALUES (uid, now(), 'trial', false)
    RETURNING * INTO r;
  END IF;

  -- Admin email never expires
  IF lower(coalesce(r.email, '')) IN ('nbrp.global@gmail.com', 'admin@nbrp.com')
     OR r.is_pro = true
     OR r.plan IN ('pro', 'standard', 'paid') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_pro', true,
      'plan', coalesce(r.plan, 'pro'),
      'trial_expired', false,
      'days_left', null,
      'trial_started_at', r.trial_started_at
    );
  END IF;

  expired := (now() - r.trial_started_at) >= interval '14 days';
  days_left := greatest(0, ceil(extract(epoch from (r.trial_started_at + interval '14 days' - now())) / 86400.0)::int);

  RETURN jsonb_build_object(
    'ok', true,
    'is_pro', false,
    'plan', r.plan,
    'trial_expired', expired,
    'days_left', days_left,
    'trial_started_at', r.trial_started_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;

COMMENT ON TABLE public.phone_registrations IS '90-day phone cooldown for free trial anti-abuse';
COMMENT ON TABLE public.profiles IS 'Trial start + plan; source of truth for paywall';
