-- Migration: Remove plaintext session token after token_hash is fully populated
-- This migration verifies that every row with token has already been backfilled to token_hash.
BEGIN;

-- Pre-check: ensure no session row has a token without a token_hash
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.sessions
      WHERE token IS NOT NULL AND (token_hash IS NULL OR token_hash = '')) > 0 THEN
    RAISE EXCEPTION 'Cannot drop plaintext token: some sessions still lack token_hash';
  END IF;
END
$$;

-- Drop old token index if it exists
DROP INDEX IF EXISTS public.sessions_token_idx;

-- Drop plaintext token column
ALTER TABLE public.sessions DROP COLUMN IF EXISTS token;

COMMIT;
