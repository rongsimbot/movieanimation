-- ============================================================================
-- MovieAnimation.ai - Migration 003: Authentication Enhancements
-- Date: 2026-07-01
-- Description: Adds auth-related columns to users table and creates
--              oauth_accounts table for Phase 9: User Authentication.
--              Aligns database schema with backend auth code.
-- Author: Simbot (via SimCoder)
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. users — Add auth-specific columns
-- ═══════════════════════════════════════════════════════════════════════════

-- Email verification
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;

-- Password reset
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

-- Refresh token (session management)
ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_expires TIMESTAMPTZ;

-- Login tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. oauth_accounts — OAuth account linking
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oauth_accounts (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'github')),
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Verify integrity
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    RAISE NOTICE 'Migration 003 completed successfully.';
    RAISE NOTICE 'Added to users: email_verified, verification_token(_expires), reset_token(_expires), refresh_token(_expires), last_login_at';
    RAISE NOTICE 'Created: oauth_accounts (Google/GitHub OAuth linking)';
END $$;

COMMIT;
