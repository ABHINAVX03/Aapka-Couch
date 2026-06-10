Migration checklist: Add `token_hash` safely

1) Backup
- Take a full logical DB dump or snapshot before running any migration.

2) Run the safe migration
- Use Supabase SQL editor or psql to run `supabase/migrations/0001_add_token_hash_safe.sql`.

3) Verify backfill
- Run the verification queries included in the SQL (counts and spot-checks).
- Confirm `token_hash` populated for sessions where `token` existed.

4) Monitor app behavior
- Keep current code that reads `token_hash` in place (deployed already), but do not remove `token` yet.
- Test login/verify flows on staging and ensure cookies still accepted.

5) Enforce constraints (optional)
- After verifying data consistency, you may alter the column to `SET NOT NULL` and enforce uniqueness on `token_hash`.
- Example (only after verification):
  BEGIN;
  ALTER TABLE public.sessions ALTER COLUMN token_hash SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON public.sessions(token_hash);
  COMMIT;

6) Remove plaintext token (destructive, optional)
- After a safe window and final verification, run the destructive migration to drop `token` and old index: `supabase/migrations/0002_drop_plaintext_token.sql`.

7) Enforce schema constraints
- Once plaintext `token` is removed and verified, run `supabase/migrations/0003_enforce_token_hash.sql` to set `token_hash` NOT NULL and enforce uniqueness.

8) Rollback (if needed)
- If you need to revert the safe migration, run `supabase/migrations/0001_add_token_hash_rollback.sql`.

Verification queries (copy/paste):
- Count hashed rows:
  SELECT COUNT(*) AS total, SUM(CASE WHEN token_hash IS NOT NULL THEN 1 ELSE 0 END) AS hashed FROM public.sessions;
- If `token` still exists: rows with token and no hash (should be 0 after backfill):
  SELECT COUNT(*) FROM public.sessions WHERE token IS NOT NULL AND (token_hash IS NULL OR token_hash = '');
- Spot-check rows:
  SELECT id, user_id, token_hash, expires_at FROM public.sessions ORDER BY created_at DESC LIMIT 10;

Notes:
- Keep backups for at least 24-72 hours after destructive changes.
- Coordinate with any running app instances to avoid race conditions; deploy app code that handles both `token` and `token_hash` if you have mixed versions during rollout.
