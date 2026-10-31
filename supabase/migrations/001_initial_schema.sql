-- ============================================================================
-- VIDSYNTH STUDIO — SUPABASE POSTGRESQL SCHEMA & ROW LEVEL SECURITY (RLS)
-- Migration: 001_initial_schema.sql
-- ============================================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE (1:1 with auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  organization TEXT DEFAULT '',
  plan_tier TEXT NOT NULL DEFAULT 'sandbox' CHECK (plan_tier IN ('sandbox', 'pro_vfx', 'enterprise')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'pending_verification', 'suspended')),
  available_credits INTEGER NOT NULL DEFAULT 100 CHECK (available_credits >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trigger to automatically create profile & initial sandbox credit ledger entry on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, organization, plan_tier, available_credits)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'organization', ''),
    'sandbox',
    100
  );

  INSERT INTO public.credit_ledger (user_id, delta, balance_after, reason, reference_type)
  VALUES (
    NEW.id,
    100,
    100,
    'Initial Sandbox Evaluation Allocation',
    'system_grant'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. PROJECTS TABLE (User Studio Projects)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2 AND char_length(name) <= 120),
  transformation_mode TEXT NOT NULL DEFAULT 'Character Transformation'
    CHECK (transformation_mode IN (
      'Character Transformation',
      'Segmentation Mask',
      'Depth Relighting',
      'Identity Preservation',
      'Temporal Consistency'
    )),
  model_id TEXT NOT NULL DEFAULT 'VS-CHAR-2.4',
  motion_preset TEXT NOT NULL DEFAULT 'Dolly In',
  resolution TEXT NOT NULL DEFAULT '1920x1080' CHECK (resolution IN ('1280x720', '1920x1080', '2560x1440', '3840x2160')),
  fps INTEGER NOT NULL DEFAULT 24 CHECK (fps IN (24, 30, 60)),
  export_format TEXT NOT NULL DEFAULT 'MP4 (H.264)' CHECK (export_format IN ('MP4 (H.264)', 'WebM (VP9)', 'ProRes 422 HQ', '16-bit OpenEXR')),
  project_status TEXT NOT NULL DEFAULT 'configured' CHECK (project_status IN ('draft', 'configured', 'simulated_complete', 'archived')),
  render_status TEXT NOT NULL DEFAULT 'idle' CHECK (render_status IN ('idle', 'queued', 'processing', 'completed', 'failed')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id, updated_at DESC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. RENDER JOBS TABLE (Execution & Simulation Log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name_snapshot TEXT NOT NULL,
  model_id TEXT NOT NULL,
  pass_type TEXT NOT NULL,
  resolution TEXT NOT NULL,
  frame_count INTEGER NOT NULL DEFAULT 96,
  credits_consumed INTEGER NOT NULL DEFAULT 10 CHECK (credits_consumed >= 0),
  execution_mode TEXT NOT NULL DEFAULT 'sandbox_simulation' CHECK (execution_mode IN ('sandbox_simulation', 'cloud_gpu_batch')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_render_jobs_user_id ON public.render_jobs(user_id, created_at DESC);

ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own render jobs"
  ON public.render_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own render jobs"
  ON public.render_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. CREDIT LEDGER TABLE (Auditable Credit Consumption)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL,
  reference_type TEXT NOT NULL DEFAULT 'render_job',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON public.credit_ledger(user_id, created_at DESC);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit ledger"
  ON public.credit_ledger FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can append own credit ledger"
  ON public.credit_ledger FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. EARLY ACCESS LEADS TABLE (Public Waitlist & Enterprise Inquiries)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.early_access_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  work_email TEXT NOT NULL UNIQUE CHECK (work_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  company TEXT NOT NULL CHECK (char_length(trim(company)) >= 2),
  use_case TEXT NOT NULL,
  project_scale TEXT DEFAULT 'Evaluation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.early_access_leads ENABLE ROW LEVEL SECURITY;

-- Allow anonymous or authenticated users to submit an early access request,
-- but NEVER allow public SELECT on leads to protect registrant privacy.
CREATE POLICY "Anyone can insert early access lead"
  ON public.early_access_leads FOR INSERT
  WITH CHECK (true);
