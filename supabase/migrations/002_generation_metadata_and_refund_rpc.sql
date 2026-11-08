-- ============================================================================
-- VIDSYNTH AI — VERSIONED MIGRATION 002
-- Adds extended generation metadata columns and idempotent credit refund RPC
-- ============================================================================

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS model_id text DEFAULT 'vs-flux-2-klein-4b',
  ADD COLUMN IF NOT EXISTS reference_metadata jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS input_storage_path text DEFAULT '',
  ADD COLUMN IF NOT EXISTS output_storage_path text DEFAULT '',
  ADD COLUMN IF NOT EXISTS output_mime_type text DEFAULT 'image/jpeg',
  ADD COLUMN IF NOT EXISTS width integer DEFAULT 1024,
  ADD COLUMN IF NOT EXISTS height integer DEFAULT 1024,
  ADD COLUMN IF NOT EXISTS guidance numeric(4,2) DEFAULT 3.5,
  ADD COLUMN IF NOT EXISTS seed bigint,
  ADD COLUMN IF NOT EXISTS credit_transaction_id uuid;

-- Allow 'text-to-image' and 'image-to-image' in generation_type check constraint
ALTER TABLE public.generations
  DROP CONSTRAINT IF EXISTS generations_generation_type_check;

ALTER TABLE public.generations
  ADD CONSTRAINT generations_generation_type_check
  CHECK (generation_type IN ('image', 'video', 'text-to-image', 'image-to-image'));

-- Idempotent atomic credit refund function (prevents duplicate refunds for the same generation_id)
CREATE OR REPLACE FUNCTION public.refund_generation_credit(
  p_user_id uuid,
  p_generation_id uuid,
  p_reason text DEFAULT 'Generation failed — automatic credit refund'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_refunded boolean;
  v_was_deducted boolean;
  v_new_balance integer;
BEGIN
  -- 1. Check if a refund already exists for this generation_id
  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND generation_id = p_generation_id
      AND transaction_type = 'refund'
  ) INTO v_already_refunded;

  IF v_already_refunded THEN
    SELECT credits INTO v_new_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_new_balance, 0);
  END IF;

  -- 2. Verify a deduction actually occurred for this generation_id
  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND generation_id = p_generation_id
      AND amount < 0
  ) INTO v_was_deducted;

  IF NOT v_was_deducted THEN
    SELECT credits INTO v_new_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_new_balance, 0);
  END IF;

  -- 3. Refund 1 credit atomically and decrement total_generations
  UPDATE public.profiles
  SET credits = credits + 1,
      total_generations = GREATEST(0, total_generations - 1),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_user_id
  RETURNING credits INTO v_new_balance;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    description,
    generation_id
  ) VALUES (
    p_user_id,
    1,
    'refund',
    p_reason,
    p_generation_id
  );

  RETURN v_new_balance;
END;
$$;
