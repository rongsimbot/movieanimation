-- ============================================================================
-- MovieAnimation.ai - Migration 003: Consolidated Complete Schema
-- Date: 2026-07-19
-- Description: Master schema with ALL tables using UUID primary keys.
--              Fixes UUID/INTEGER incompatibility between main and backend
--              migration sets. Includes all 8 core tables plus extension tables.
-- Database: movieanimation_db
-- Usage: psql -U sim_admin -d movieanimation_db -f 003_consolidated_schema.sql
-- ============================================================================

BEGIN;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- 1. USERS — Core user accounts with auth, subscription & tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    -- Subscription
    stripe_customer_id VARCHAR(255),
    tier VARCHAR(50) DEFAULT 'free',
    -- Auth & Verification
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    verification_token_expires TIMESTAMPTZ,
    -- Password Reset
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMPTZ,
    -- Sessions
    refresh_token TEXT,
    refresh_token_expires TIMESTAMPTZ,
    -- Tracking
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

-- ============================================================================
-- 2. OAUTH_ACCOUNTS — OAuth provider account linking
-- ============================================================================
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
    UNIQUE(provider, provider_user_id),
    UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);

-- ============================================================================
-- 3. PROJECTS — User video production projects
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    genre VARCHAR(100),
    status VARCHAR(50) DEFAULT 'draft',
    duration_estimate INTEGER,
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ============================================================================
-- 4. SCRIPTS — Screenplay content with AI enhancement tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(500),
    content TEXT NOT NULL,
    raw_text TEXT,
    enhanced_text TEXT,
    word_count INTEGER,
    scene_count INTEGER DEFAULT 0,
    language VARCHAR(50) DEFAULT 'en',
    format VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scripts_project_id ON scripts(project_id);

-- ============================================================================
-- 5. SCENES — Individual scenes extracted from scripts
-- ============================================================================
CREATE TABLE IF NOT EXISTS scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    description TEXT,
    action TEXT,
    dialogue JSONB,
    characters JSONB,
    setting TEXT,
    duration_estimate INTEGER,
    duration_sec INTEGER,
    mood VARCHAR(100),
    visual_prompt TEXT,
    prompt TEXT,
    generation_status VARCHAR(50) DEFAULT 'pending',
    video_url TEXT,
    audio_url TEXT,
    api_used VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_script_id ON scenes(script_id);
CREATE INDEX IF NOT EXISTS idx_scenes_status ON scenes(generation_status);
CREATE INDEX IF NOT EXISTS idx_scenes_scene_number ON scenes(project_id, scene_number);
CREATE INDEX IF NOT EXISTS idx_scenes_prompt ON scenes USING gin(to_tsvector('english', COALESCE(prompt, '')));

-- ============================================================================
-- 6. VIDEO_CLIPS — AI-generated video clips from all providers
-- ============================================================================
CREATE TABLE IF NOT EXISTS video_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    api_used VARCHAR(50) NOT NULL,
    api_provider VARCHAR(255),
    job_id VARCHAR(500),
    api_request_id VARCHAR(500),
    prompt TEXT,
    generation_params JSONB,
    file_url TEXT,
    url TEXT,
    thumbnail_url TEXT,
    duration_ms INTEGER,
    duration_sec NUMERIC(10,2),
    resolution VARCHAR(20),
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    cost_usd NUMERIC(10,6) DEFAULT 0,
    cost NUMERIC(10,6),
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_clips_project_id ON video_clips(project_id);
CREATE INDEX IF NOT EXISTS idx_video_clips_scene_id ON video_clips(scene_id);
CREATE INDEX IF NOT EXISTS idx_video_clips_status ON video_clips(status);

-- ============================================================================
-- 7. RENDERS — Final video compositions
-- ============================================================================
CREATE TABLE IF NOT EXISTS renders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(500),
    file_url TEXT,
    output_url TEXT,
    file_size BIGINT,
    duration_ms INTEGER,
    resolution VARCHAR(20) DEFAULT '1080p',
    format VARCHAR(20) DEFAULT 'mp4',
    scene_order JSONB,
    transitions JSONB,
    status VARCHAR(50) DEFAULT 'processing',
    progress_pct INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_renders_project_id ON renders(project_id);
CREATE INDEX IF NOT EXISTS idx_renders_user_id ON renders(user_id);
CREATE INDEX IF NOT EXISTS idx_renders_status ON renders(status);

-- ============================================================================
-- 8. API_USAGE — API call tracking & cost accounting
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    api_name VARCHAR(50) NOT NULL,
    provider VARCHAR(255),
    endpoint VARCHAR(255),
    credits_used NUMERIC(10,4) DEFAULT 0,
    tokens_or_seconds NUMERIC(10,2),
    cost_usd NUMERIC(10,6) DEFAULT 0,
    cost NUMERIC(10,6),
    response_time_ms INTEGER,
    status_code INTEGER,
    success BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_api_name ON api_usage(api_name);
CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage(provider);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at);

-- ============================================================================
-- 9. USER_ASSETS — Uploaded media files
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    filename VARCHAR(500) NOT NULL,
    file_url TEXT NOT NULL,
    storage_url TEXT,
    file_size BIGINT,
    mime_type VARCHAR(100),
    asset_type VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_asset_type ON user_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_user_assets_project_id ON user_assets(project_id);

-- ============================================================================
-- EXTENSION TABLES (non-core, but needed for platform features)
-- ============================================================================

-- 10. USER_SUBSCRIPTIONS — Stripe subscription tracking
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'incomplete',
    plan_id VARCHAR(100),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);

-- 11. BETA_TESTERS
CREATE TABLE IF NOT EXISTS beta_testers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'pending',
    invited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMPTZ
);

-- 12. BETA_FEEDBACK
CREATE TABLE IF NOT EXISTS beta_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100),
    feedback TEXT NOT NULL,
    rating INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. ANALYTICS_EVENTS
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_name VARCHAR(255) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 14. PERFORMANCE_METRICS
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(255) NOT NULL,
    metric_value NUMERIC,
    tags JSONB,
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- AUTO-UPDATE TRIGGER (sets updated_at on modification)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'updated_at'
        AND table_schema = 'public'
        AND table_name IN ('users', 'projects', 'scenes', 'oauth_accounts', 'user_subscriptions')
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;
            CREATE TRIGGER trg_%s_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        ', tbl, tbl, tbl, tbl);
    END LOOP;
END $$;

-- ============================================================================
-- VERIFY INTEGRITY
-- ============================================================================
DO $$
DECLARE
    tbl_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO tbl_count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 003 completed successfully.';
    RAISE NOTICE 'Total tables created: %', tbl_count;
    RAISE NOTICE 'Core tables: users, projects, scripts, scenes, video_clips, renders, api_usage, user_assets';
    RAISE NOTICE 'Extension tables: oauth_accounts, user_subscriptions, beta_testers, beta_feedback, analytics_events, performance_metrics';
    RAISE NOTICE '========================================';
END $$;

COMMIT;
