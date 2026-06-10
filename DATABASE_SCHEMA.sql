-- Complete Database Schema for AapkaCoach (Independent Email Auth)

-- Users table (core authentication)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- OTP codes table (temporary tokens for email auth)
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Sessions table (custom session management)
CREATE TABLE IF NOT EXISTS public.sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- User profiles table (stores personal health data)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT,
  age INTEGER,
  sex TEXT CHECK (sex IN ('male', 'female')),
  height_cm FLOAT,
  weight_kg FLOAT,
  body_fat_percent FLOAT,
  visceral_fat FLOAT,
  waist_inches FLOAT,
  upper_abdomen_inches FLOAT,
  hips_inches FLOAT,
  body_age INTEGER,
  rmr_estimated FLOAT,
  dietary_pattern TEXT,
  meal_timing TEXT,
  eating_environment TEXT,
  daily_budget FLOAT,
  activity_level TEXT,
  sleep_hours FLOAT,
  stress_level INTEGER,
  primary_goal TEXT,
  target_bf_percent FLOAT,
  timeframe_weeks INTEGER,
  supplements TEXT,
  plan_notes TEXT,
  paid_weeks INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Body composition scans table (tracks progress)
CREATE TABLE IF NOT EXISTS public.bca_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scan_date DATE NOT NULL,
  weight_kg FLOAT,
  body_fat_percent FLOAT,
  waist_inches FLOAT,
  upper_abdomen_inches FLOAT,
  hips_inches FLOAT,
  visceral_fat FLOAT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  UNIQUE(user_id, scan_date)
);

-- Meal plans table (stores generated plans)
CREATE TABLE IF NOT EXISTS public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_week INTEGER NOT NULL DEFAULT 1,
  plan_json JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  valid_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS otp_codes_email_idx ON public.otp_codes(email);
CREATE INDEX IF NOT EXISTS otp_codes_expires_idx ON public.otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON public.sessions(token_hash);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON public.sessions(expires_at);
CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS bca_scans_user_id_idx ON public.bca_scans(user_id);
CREATE INDEX IF NOT EXISTS bca_scans_scan_date_idx ON public.bca_scans(scan_date);
CREATE INDEX IF NOT EXISTS meal_plans_user_id_idx ON public.meal_plans(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bca_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own user record"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- RLS Policies for otp_codes table (no direct user access)
CREATE POLICY "otp_codes_no_access"
  ON public.otp_codes FOR ALL
  USING (FALSE);

-- RLS Policies for sessions table (no direct user access)
CREATE POLICY "sessions_no_access"
  ON public.sessions FOR ALL
  USING (FALSE);

-- RLS Policies for profiles table
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for bca_scans table
CREATE POLICY "Users can view their own scans"
  ON public.bca_scans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scans"
  ON public.bca_scans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for meal_plans table
CREATE POLICY "Users can view their own meal plans"
  ON public.meal_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meal plans"
  ON public.meal_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);
