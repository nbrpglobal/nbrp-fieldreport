-- Clean init for new Supabase project
-- Run once in SQL Editor

CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_config_public_read ON public.app_config;
CREATE POLICY app_config_public_read ON public.app_config
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.app_config (key, value) VALUES
  ('plan_standard_monthly', 'https://buy.stripe.com/28E5kD0tIaL9Fre6j0sU04'),
  ('plan_pro_monthly',      'https://buy.stripe.com/7sYeVddgu6vm2cZ6DR0sU05'),
  ('plan_standard_yearly',  'https://buy.stripe.com/dRm7sL5025ridVH3Rf0sU06'),
  ('plan_pro_yearly',       'https://buy.stripe.com/bJe00jdgubPG4l77HV0sU07')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  is_pro boolean NOT NULL DEFAULT false,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_own_read ON public.profiles;
CREATE POLICY profiles_own_read ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, is_pro, plan)
  VALUES (
    NEW.id,
    NEW.email,
    lower(NEW.email) = 'nbrp.global@gmail.com',
    CASE WHEN lower(NEW.email) = 'nbrp.global@gmail.com' THEN 'pro' ELSE 'free' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid();
  RETURN json_build_object(
    'is_pro', COALESCE(p.is_pro, false) OR lower(COALESCE(p.email, '')) = 'nbrp.global@gmail.com',
    'plan', COALESCE(p.plan, 'free'),
    'trial_expired', false,
    'days_left', 14
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reports_own_insert ON public.reports;
CREATE POLICY reports_own_insert ON public.reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS reports_own_select ON public.reports;
CREATE POLICY reports_own_select ON public.reports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
