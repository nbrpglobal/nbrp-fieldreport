-- Field Report: safe re-runnable init (idempotent)
-- Run in Supabase SQL Editor

-- 1) App configuration (Stripe payment links)
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_public_read" ON public.app_config;
CREATE POLICY "app_config_public_read"
  ON public.app_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- Seed / update Sandbox Payment Links (edit values later for Live — no code change)
INSERT INTO public.app_config (key, value) VALUES
  ('plan_standard_monthly', 'https://buy.stripe.com/28E5kD0tIaL9Fre6j0sU04'),
  ('plan_pro_monthly',      'https://buy.stripe.com/7sYeVddgu6vm2cZ6DR0sU05'),
  ('plan_standard_yearly',  'https://buy.stripe.com/dRm7sL5025ridVH3Rf0sU06'),
  ('plan_pro_yearly',       'https://buy.stripe.com/bJe00jdgubPG4l77HV0sU07')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- 2) Admin emails (identity survives UUID rebuild)
CREATE TABLE IF NOT EXISTS public.admin_emails (
  email text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_emails_public_read" ON public.admin_emails;
CREATE POLICY "admin_emails_public_read"
  ON public.admin_emails FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.admin_emails (email, note) VALUES
  ('nbrp.global@gmail.com', 'Core admin — email fallback if UUID changes')
ON CONFLICT (email) DO NOTHING;
