-- ============================================================
-- backend-migration.sql
-- Database migration to support the fixed SAL auth flow.
--
-- Run this ONCE on your database before deploying the new code.
-- Safe to run on existing data — uses IF NOT EXISTS / defaults.
-- ============================================================

-- ── 1. Ensure is_password_created column exists ──────────────
-- If your users table already has this column, this is a no-op.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_password_created BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Backfill: any user who already has a password_hash ────
--    should have is_password_created = true.
--    This ensures the check (password_hash OR is_password_created)
--    works correctly for all existing users.
UPDATE users
SET    is_password_created = TRUE
WHERE  password_hash IS NOT NULL
  AND  password_hash <> ''
  AND  is_password_created = FALSE;

-- ── 3. Ensure refresh_tokens table exists ────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens(user_id);

-- ── 4. Cleanup: remove any orphaned refresh tokens ───────────
DELETE FROM refresh_tokens WHERE expires_at < NOW();

-- ── Verification query — run after migration ─────────────────
-- Expected: 0 rows (no activated users with flag still false)
-- SELECT COUNT(*) FROM users
-- WHERE password_hash IS NOT NULL AND is_password_created = FALSE;
