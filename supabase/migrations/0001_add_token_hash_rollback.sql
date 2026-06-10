-- Rollback / cleanup script for token_hash migration (if needed)
BEGIN;

-- Drop the token_hash column and its index
DROP INDEX IF EXISTS public.sessions_token_hash_idx;
ALTER TABLE public.sessions DROP COLUMN IF EXISTS token_hash;

COMMIT;
