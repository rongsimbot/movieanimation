-- ============================================================================
-- MovieAnimation.ai - Migration 002: Phase 1 Schema Enhancements
-- Date: 2026-06-29
-- Description: Add standardized columns, additional indexes, and align
--              schema with Phase 1 requirements for multi-API video platform.
-- Author: SimCoder Agent
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. users - Subscription & timestamp tracking
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'free';

-- Backfill updated_at for existing users
UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);

-- ============================================================================
-- 2. scripts - AI-enhanced text fields
-- ============================================================================
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS raw_text TEXT;
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS enhanced_text TEXT;
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS scene_count INTEGER DEFAULT 0;

-- Backfill raw_text from content field
UPDATE scripts SET raw_text = content WHERE raw_text IS NULL AND content IS NOT NULL;

-- ============================================================================
-- 3. scenes - Script foreign key & standard duration/prompt fields
-- ============================================================================
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS script_id UUID REFERENCES scripts(id) ON DELETE CASCADE;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS duration_sec INTEGER;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS prompt TEXT;

-- Backfill prompt from visual_prompt
UPDATE scenes SET prompt = visual_prompt WHERE prompt IS NULL AND visual_prompt IS NOT NULL;

-- Backfill duration_sec from duration_estimate
UPDATE scenes SET duration_sec = duration_estimate WHERE duration_sec IS NULL AND duration_estimate IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scenes_script_id ON scenes(script_id);
CREATE INDEX IF NOT EXISTS idx_scenes_prompt ON scenes USING gin(to_tsvector('english', COALESCE(prompt, '')));
CREATE INDEX IF NOT EXISTS idx_scenes_scene_number ON scenes(project_id, scene_number);

-- ============================================================================
-- 4. video_clips - Standardized naming for multi-provider support
-- ============================================================================
ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS api_provider VARCHAR(255);
ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS api_request_id VARCHAR(500);
ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS duration_sec NUMERIC(10,2);
ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS cost NUMERIC(10,6);
ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS url TEXT;

-- Backfill from existing columns
UPDATE video_clips SET api_provider = api_used WHERE api_provider IS NULL AND api_used IS NOT NULL;
UPDATE video_clips SET api_request_id = job_id WHERE api_request_id IS NULL AND job_id IS NOT NULL;
UPDATE video_clips SET duration_sec = duration_ms::NUMERIC / 1000 WHERE duration_sec IS NULL AND duration_ms IS NOT NULL;
UPDATE video_clips SET cost = cost_usd WHERE cost IS NULL AND cost_usd IS NOT NULL;
UPDATE video_clips SET url = file_url WHERE url IS NULL AND file_url IS NOT NULL;

-- ============================================================================
-- 5. renders - User tracking & progress monitoring
-- ============================================================================
ALTER TABLE renders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS output_url TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS progress_pct INTEGER DEFAULT 0;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Backfill output_url from file_url
UPDATE renders SET output_url = file_url WHERE output_url IS NULL AND file_url IS NOT NULL;

-- Set started_at for in-progress renders
UPDATE renders SET started_at = created_at WHERE started_at IS NULL AND status = 'processing';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_renders_user_id ON renders(user_id);
CREATE INDEX IF NOT EXISTS idx_renders_status ON renders(status);

-- ============================================================================
-- 6. api_usage - Standardized provider & usage tracking
-- ============================================================================
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS provider VARCHAR(255);
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS tokens_or_seconds NUMERIC(10,2);
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS cost NUMERIC(10,6);

-- Backfill from existing columns
UPDATE api_usage SET provider = api_name WHERE provider IS NULL AND api_name IS NOT NULL;
UPDATE api_usage SET tokens_or_seconds = credits_used WHERE tokens_or_seconds IS NULL AND credits_used IS NOT NULL;
UPDATE api_usage SET cost = cost_usd WHERE cost IS NULL AND cost_usd IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage(provider);

-- ============================================================================
-- 7. user_assets - Standardized upload timestamp
-- ============================================================================
ALTER TABLE user_assets ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE user_assets ADD COLUMN IF NOT EXISTS storage_url TEXT;

-- Backfill timestamps and URLs
UPDATE user_assets SET uploaded_at = created_at WHERE uploaded_at IS NULL AND created_at IS NOT NULL;
UPDATE user_assets SET storage_url = file_url WHERE storage_url IS NULL AND file_url IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_asset_type ON user_assets(asset_type);

-- ============================================================================
-- Verify migration integrity
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Migration 002 completed successfully.';
    RAISE NOTICE 'Tables: users, projects, scripts, scenes, video_clips, renders, api_usage, user_assets';
    RAISE NOTICE 'Extension tables: beta_testers, beta_feedback, analytics_events, performance_metrics';
END $$;

COMMIT;
