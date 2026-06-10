-- Migration: Add food_type column to profiles
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS food_type TEXT DEFAULT 'indian';

COMMIT;
