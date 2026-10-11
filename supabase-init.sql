-- Field Report: config + admin anti-rebuild protection
-- Run in Supabase SQL Editor

-- 1) App configuration (payment links, etc.) — public read for anon
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

-- Only service role / dashboard should write; no public INSERT/UPDATE for anon

-- 2) Seed Stripe Sandbox Payment Links (update values in Table Editor for Live)
INSERT INTO public.app_config (key, value) VALUES
  ('plan_standard_monthly', 'https://buy.stripe.com/28E5kD0tIaL9Fre6j0sU04'),
  ('plan_pro_monthly',      'https://buy.stripe.com/7sYeVddgu6vm2cZ6DR0sU05'),
  ('plan_standard_yearly',  'https://buy.stripe.com/dRm7sL5025ridVH3Rf0sU06'),
  ('plan_pro_yearly',       'https://buy.stripe.com/bJe00jdgubPG4l77HV0sU07')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- 3) Optional: mark admin emails (email-first identity; survives UUID rebuild)
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

-- 4) Optional profile flag (UUID may change; email remains source of truth)
-- If you use auth.users metadata, set app_metadata.is_admin via Dashboard for UUID:
--   c5f54b67-8568-444f-8482-8dab7a7ae428
-- Prefer email check on the client + RLS policies that use auth.jwt() ->> 'email'

COMMENT ON TABLE public.app_config IS 'Dynamic Stripe payment links and app settings';
COMMENT ON TABLE public.admin_emails IS 'Admin identity by email (anti-rebuild)';
