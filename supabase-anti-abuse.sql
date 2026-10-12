-- ============================================================
-- Field Report: profiles + device + phone anti-abuse (idempotent)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.phone_registrations (
  phone text PRIMARY KEY,
  last_registered_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS phone_registrations_last_idx ON public.phone_registrations (last_registered_at);
ALTER TABLE public.phone_registrations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.device_registrations (
  fingerprint text PRIMARY KEY,
  last_trial_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_registrations_last_idx ON public.device_registrations (last_trial_at);
ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  phone_number text,
  device_fingerprint text,
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  plan text NOT NULL DEFAULT 'trial',
  is_pro boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS device_fingerprint text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pro boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- backfill defaults if null
UPDATE public.profiles SET trial_started_at = coalesce(trial_started_at, now()) WHERE trial_started_at IS NULL;
UPDATE public.profiles SET trial_ends_at = coalesce(trial_ends_at, trial_started_at + interval '14 days', now() + interval '14 days') WHERE trial_ends_at IS NULL;
UPDATE public.profiles SET plan = coalesce(plan, 'trial') WHERE plan IS NULL;
UPDATE public.profiles SET is_pro = coalesce(is_pro, false) WHERE is_pro IS NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
  phone text;
  fp text;
BEGIN
  meta := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  phone := nullif(trim(coalesce(meta->>'phone_number', meta->>'phone', '')), '');
  fp := nullif(trim(coalesce(meta->>'device_fingerprint', meta->>'device_id', '')), '');

  INSERT INTO public.profiles (
    id, email, phone_number, device_fingerprint,
    trial_started_at, trial_ends_at, plan, is_pro
  ) VALUES (
    NEW.id,
    NEW.email,
    phone,
    fp,
    now(),
    now() + interval '14 days',
    'trial',
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = coalesce(EXCLUDED.email, public.profiles.email),
    phone_number = coalesce(EXCLUDED.phone_number, public.profiles.phone_number),
    device_fingerprint = coalesce(EXCLUDED.device_fingerprint, public.profiles.device_fingerprint),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.check_phone_cooldown(p_phone text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE last_at timestamptz; normalized text;
BEGIN
  normalized := regexp_replace(coalesce(p_phone, ''), '\s', '', 'g');
  IF normalized = '' THEN RETURN true; END IF;
  SELECT last_registered_at INTO last_at FROM public.phone_registrations WHERE phone = normalized;
  IF last_at IS NULL THEN RETURN false; END IF;
  RETURN (now() - last_at) < interval '90 days';
END;
$$;
REVOKE ALL ON FUNCTION public.check_phone_cooldown(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_phone_cooldown(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_device_trial(p_fingerprint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE last_at timestamptz; fp text;
BEGIN
  fp := trim(coalesce(p_fingerprint, ''));
  IF fp = '' OR length(fp) < 8 THEN RETURN true; END IF;
  SELECT last_trial_at INTO last_at FROM public.device_registrations WHERE fingerprint = fp;
  IF last_at IS NULL THEN RETURN false; END IF;
  RETURN (now() - last_at) < interval '90 days';
END;
$$;
REVOKE ALL ON FUNCTION public.check_device_trial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_device_trial(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_phone_for_trial(p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE normalized text; last_at timestamptz; uid uuid;
BEGIN
  uid := auth.uid();
  normalized := regexp_replace(coalesce(p_phone, ''), '\s', '', 'g');
  IF normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Phone required');
  END IF;
  SELECT last_registered_at INTO last_at FROM public.phone_registrations WHERE phone = normalized;
  IF last_at IS NOT NULL AND (now() - last_at) < interval '90 days' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This phone number was already used for a free trial recently.');
  END IF;
  INSERT INTO public.phone_registrations (phone, last_registered_at, user_id)
  VALUES (normalized, now(), uid)
  ON CONFLICT (phone) DO UPDATE SET last_registered_at = now(),
    user_id = coalesce(EXCLUDED.user_id, public.phone_registrations.user_id);
  UPDATE public.profiles SET phone_number = normalized, updated_at = now() WHERE id = uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_phone_for_trial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_phone_for_trial(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_device_for_trial(p_fingerprint text, p_user_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fp text; last_at timestamptz; uid uuid;
BEGIN
  uid := auth.uid();
  fp := trim(coalesce(p_fingerprint, ''));
  IF fp = '' OR length(fp) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Device verification failed. Please try another browser.');
  END IF;
  SELECT last_trial_at INTO last_at FROM public.device_registrations WHERE fingerprint = fp;
  IF last_at IS NOT NULL AND (now() - last_at) < interval '90 days' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This device has already used a free trial. Please sign in or subscribe.');
  END IF;
  INSERT INTO public.device_registrations (fingerprint, last_trial_at, user_id, user_agent)
  VALUES (fp, now(), uid, left(coalesce(p_user_agent, ''), 500))
  ON CONFLICT (fingerprint) DO UPDATE SET last_trial_at = now(),
    user_id = coalesce(EXCLUDED.user_id, public.device_registrations.user_id),
    user_agent = coalesce(EXCLUDED.user_agent, public.device_registrations.user_agent);
  UPDATE public.profiles SET device_fingerprint = fp, updated_at = now() WHERE id = uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_device_for_trial(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_device_for_trial(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.profiles%ROWTYPE; uid uuid; expired boolean; days_left int; ends_at timestamptz;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  SELECT * INTO r FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, email, trial_started_at, trial_ends_at, plan, is_pro)
    VALUES (uid, null, now(), now() + interval '14 days', 'trial', false)
    RETURNING * INTO r;
  END IF;
  IF lower(coalesce(r.email, '')) IN ('nbrp.global@gmail.com', 'admin@nbrp.com')
     OR r.is_pro = true OR r.plan IN ('pro', 'standard', 'paid') THEN
    RETURN jsonb_build_object('ok', true, 'is_pro', true, 'plan', coalesce(r.plan, 'pro'),
      'trial_expired', false, 'days_left', null, 'trial_ends_at', r.trial_ends_at);
  END IF;
  ends_at := coalesce(r.trial_ends_at, r.trial_started_at + interval '14 days');
  expired := now() >= ends_at;
  days_left := greatest(0, ceil(extract(epoch from (ends_at - now())) / 86400.0)::int);
  RETURN jsonb_build_object('ok', true, 'is_pro', false, 'plan', r.plan,
    'trial_expired', expired, 'days_left', days_left, 'trial_ends_at', ends_at,
    'phone_number', r.phone_number, 'device_fingerprint', r.device_fingerprint);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;
