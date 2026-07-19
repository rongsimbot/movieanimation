-- ============================================================================
-- Phase 9: User Authentication Enhancements — MovieAnimation Backend
-- Migration 011
--
-- Adds:
--   - Email verification columns to users table
--   - Password reset columns to users table
--   - Refresh token support on users table
--   - OAuth accounts table
-- ============================================================================

-- ═══ Users Table Enhancements ════════════════════════════════════════════════

-- Email verification
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_token VARCHAR(128),
  ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;

-- Password reset
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128),
  ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

-- Refresh token (long-lived, stored server-side)
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_expires TIMESTAMPTZ;

-- Timestamp tracking for last login
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

-- ═══ OAuth Accounts Table ════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'github')),
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email  VARCHAR(255),
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  
  -- One account per provider per user
  UNIQUE(user_id, provider),
  -- One provider account can only link to one MovieAnimation user
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_provider_lookup ON oauth_accounts(provider, provider_user_id);

-- ═══ Trigger: Auto-update updated_at ═════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_users_updated_at'
  ) THEN
    CREATE TRIGGER set_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_oauth_updated_at'
  ) THEN
    CREATE TRIGGER set_oauth_updated_at
      BEFORE UPDATE ON oauth_accounts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ═══ Done ═════════════════════════════════════════════════════════════════════

COMMENT ON TABLE oauth_accounts IS 'OAuth provider accounts linked to MovieAnimation users';
COMMENT ON COLUMN users.email_verified IS 'Whether the user has verified their email address';
COMMENT ON COLUMN users.verification_token IS 'Token for email verification';
COMMENT ON COLUMN users.reset_token IS 'Token for password reset';
COMMENT ON COLUMN users.refresh_token IS 'Long-lived refresh token for session management';
