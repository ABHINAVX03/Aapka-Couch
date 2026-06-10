-- Safe, non-destructive migration to add `token_hash` to sessions
-- This migration adds the column and backfills values, but does NOT drop the existing `token` column.
BEGIN;

-- Ensure pgcrypto available for hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add token_hash column without constraints for safety
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Backfill token_hash from existing plaintext token where token is present
UPDATE public.sessions
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token IS NOT NULL AND (token_hash IS NULL OR token_hash = '');

-- Create index on token_hash (non-unique to avoid failures during rollout)
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON public.sessions(token_hash);

COMMIT;

-- Post-migration verification SQL suggestions:
-- 1) Count total sessions and sessions with token_hash populated:
--    SELECT COUNT(*) AS total, SUM(CASE WHEN token_hash IS NOT NULL THEN 1 ELSE 0 END) AS hashed FROM public.sessions;
-- 2) Spot-check a few rows:
--    SELECT id, user_id, token, token_hash, expires_at FROM public.sessions ORDER BY created_at DESC LIMIT 10;
-- 3) Ensure no accidental NULLs where token existed:
--    SELECT COUNT(*) FROM public.sessions WHERE token IS NOT NULL AND (token_hash IS NULL OR token_hash = '');
