-- Migration: Enforce token_hash not null and unique
BEGIN;

-- Verify there are no NULL token_hash values.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sessions WHERE token_hash IS NULL) THEN
    RAISE EXCEPTION 'Cannot set token_hash NOT NULL: NULL values exist';
  END IF;
END
$$;

-- Verify token_hash values are unique.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM (
        SELECT token_hash
        FROM public.sessions
        GROUP BY token_hash
        HAVING COUNT(*) > 1
      ) dup) > 0 THEN
    RAISE EXCEPTION 'Cannot enforce unique token_hash: duplicate hash values exist';
  END IF;
END
$$;

ALTER TABLE public.sessions ALTER COLUMN token_hash SET NOT NULL;
DROP INDEX IF EXISTS public.sessions_token_hash_idx;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON public.sessions(token_hash);

COMMIT;
