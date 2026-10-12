-- Clear previous trial locks and remove earlier test accounts
-- Keep only the company management account
-- Run once in Supabase SQL Editor

DELETE FROM public.phone_registrations;
DELETE FROM public.device_registrations;

-- Remove previously registered accounts (keeps nbrp.global@gmail.com)
DELETE FROM auth.users
WHERE lower(email) <> 'nbrp.global@gmail.com';

-- Ensure the management account has full Pro access if its profile exists
UPDATE public.profiles
SET is_pro = true,
    plan = 'pro',
    updated_at = now()
WHERE lower(email) = 'nbrp.global@gmail.com';
