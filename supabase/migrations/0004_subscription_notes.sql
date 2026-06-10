-- Migration: Add subscription and feedback fields for week-wise plan upgrades
BEGIN;

-- Add profile fields for supplements, plan notes, and paid weeks
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS supplements TEXT,
  ADD COLUMN IF NOT EXISTS plan_notes TEXT,
  ADD COLUMN IF NOT EXISTS paid_weeks INTEGER NOT NULL DEFAULT 1;

-- Add plan_week to meal_plans to preserve weekly plan ordering
ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS plan_week INTEGER NOT NULL DEFAULT 1;

COMMIT;
