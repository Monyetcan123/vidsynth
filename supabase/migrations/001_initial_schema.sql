-- ============================================================================
-- VIDSYNTH AI — COMPLETE SUPABASE DATABASE SCHEMA, RLS & STORAGE POLICIES
-- Migration: supabase/migrations/001_initial_schema.sql
-- Project URL: https://bypicewulwgbxypthdpf.supabase.co
-- ============================================================================
-- Run this script in the Supabase Dashboard -> SQL Editor to provision all
-- tables, triggers, atomic credit functions, RLS policies, and Storage rules.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TABLE: public.profiles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  username TEXT UNIQUE,
  email TEXT,
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  country TEXT DEFAULT '',
  website TEXT DEFAULT '',
  credits INTEGER NOT NULL DEFAULT 2 CHECK (credits >= 0),
  total_generations INTEGER NOT NULL DEFAULT 0 CHECK (total_generations >= 0),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  privacy_settings JSONB NOT NULL DEFAULT '{
    "profile_visibility": "private",
    "history_visibility": "private",
    "default_asset_visibility": "private",
    "data_privacy_opt_out": true
  }'::jsonb,
  notification_settings JSONB NOT NULL DEFAULT '{
    "email_notifications": true,
    "generation_completion": true,
    "product_announcements": false
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Prevent regular authenticated users from manipulating credits, total_generations, or is_verified
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    NEW.credits := OLD.credits;
    NEW.total_generations := OLD.total_generations;
    NEW.is_verified := OLD.is_verified;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- ----------------------------------------------------------------------------
-- 2. TABLE: public.generations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id TEXT UNIQUE,
  title TEXT NOT NULL DEFAULT 'Untitled Transformation',
  description TEXT DEFAULT '',
  prompt TEXT NOT NULL,
  negative_prompt TEXT DEFAULT '',
  generation_type TEXT NOT NULL DEFAULT 'image' CHECK (generation_type IN ('image', 'video')),
  style_preset TEXT DEFAULT 'Cinematic Editorial Realism',
  aspect_ratio TEXT DEFAULT '16:9',
  processing_mode TEXT DEFAULT 'VS-CHAR-2.4',
  input_image_url TEXT DEFAULT '',
  output_image_url TEXT DEFAULT '',
  output_video_url TEXT DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  error_message TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_generations_user_created ON public.generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_status ON public.generations(user_id, status);

ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own generations" ON public.generations;
CREATE POLICY "Users can read own generations"
  ON public.generations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own generations" ON public.generations;
CREATE POLICY "Users can delete own generations"
  ON public.generations FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. TABLE: public.credit_transactions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (
    transaction_type IN ('initial_grant', 'generation_deduction', 'generation_refund', 'admin_allocation')
  ),
  description TEXT NOT NULL,
  generation_id UUID REFERENCES public.generations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user_created ON public.credit_transactions(user_id, created_at DESC);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own credit transactions" ON public.credit_transactions;
CREATE POLICY "Users can read own credit transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. TABLE: public.developer_api_requests & public.early_access_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.developer_api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  website TEXT DEFAULT '',
  intended_use_case TEXT NOT NULL,
  expected_usage TEXT NOT NULL,
  additional_description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.developer_api_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit developer api request" ON public.developer_api_requests;
CREATE POLICY "Anyone can submit developer api request"
  ON public.developer_api_requests FOR INSERT
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.early_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  interest TEXT NOT NULL,
  source TEXT DEFAULT 'website',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.early_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit early access request" ON public.early_access_requests;
CREATE POLICY "Anyone can submit early access request"
  ON public.early_access_requests FOR INSERT
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5. TRIGGER: Auto-create profile with 2 FREE SANDBOX CREDITS on signup
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_username := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'))
                || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);

  INSERT INTO public.profiles (
    id, full_name, username, email, avatar_url, credits, total_generations, is_verified
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_username,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    2,
    0,
    (NEW.email_confirmed_at IS NOT NULL)
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.credit_transactions (
    user_id, amount, transaction_type, description
  )
  VALUES (
    NEW.id,
    2,
    'initial_grant',
    'Initial 2 Free Sandbox Generation Credits'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 6. ATOMIC CREDIT DEDUCTION & REFUND FUNCTIONS (Server-Side / Security Definer)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_generation_credit(
  p_user_id UUID,
  p_generation_id UUID,
  p_description TEXT DEFAULT 'VidSynth AI Generation'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  SELECT credits INTO v_credits
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_credits IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  IF v_credits < 1 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  UPDATE public.profiles
  SET credits = credits - 1,
      total_generations = total_generations + 1,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING credits INTO v_credits;

  INSERT INTO public.credit_transactions (
    user_id, amount, transaction_type, description, generation_id
  )
  VALUES (
    p_user_id, -1, 'generation_deduction', p_description, p_generation_id
  );

  RETURN v_credits;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. SUPABASE STORAGE BUCKETS & RLS POLICIES
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('generation-inputs', 'generation-inputs', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('generation-outputs', 'generation-outputs', false, 26214400, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

-- Avatars Policies: Public read, authenticated owner write/update/delete in folder {user_id}/*
DROP POLICY IF EXISTS "Avatar images are publicly readable" ON storage.objects;
CREATE POLICY "Avatar images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Generation Inputs Policies: Private per-user folder {user_id}/*
DROP POLICY IF EXISTS "Users can read own generation inputs" ON storage.objects;
CREATE POLICY "Users can read own generation inputs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'generation-inputs'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can upload own generation inputs" ON storage.objects;
CREATE POLICY "Users can upload own generation inputs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'generation-inputs'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own generation inputs" ON storage.objects;
CREATE POLICY "Users can delete own generation inputs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'generation-inputs'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Generation Outputs Policies: Private per-user folder {user_id}/*
DROP POLICY IF EXISTS "Users can read own generation outputs" ON storage.objects;
CREATE POLICY "Users can read own generation outputs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'generation-outputs'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own generation outputs" ON storage.objects;
CREATE POLICY "Users can delete own generation outputs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'generation-outputs'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Enable Realtime on generations and profiles
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.generations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
