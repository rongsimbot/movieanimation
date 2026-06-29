-- ============================================================================
-- MovieAnimation.ai - Migration 001: Initial Schema
-- Created: Phase 0 (pre-June 2026)
-- Description: Core database schema for multi-API AI video generation platform
-- Database: movieanimation_db
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Table: users
-- Core user accounts and subscription management
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    stripe_customer_id VARCHAR(255),
    tier VARCHAR(50) DEFAULT 'free'
);

-- ============================================================================
-- Table: projects
-- User video production projects
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
-- Table: scripts
-- Screenplay/script content with AI enhancement tracking
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
-- Table: scenes
-- Individual scenes extracted from scripts for video generation
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

-- ============================================================================
-- Table: video_clips
-- AI-generated video clips from Luma, Runway, Kling, etc.
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
-- Table: renders
-- Final video compositions assembled from video_clips
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
-- Table: api_usage
-- API call tracking and cost accounting per user
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
-- Table: user_assets
-- User-uploaded media (images, audio, reference files)
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

-- ============================================================================
-- Extension tables (Phase 0 extras)
-- ============================================================================

-- Beta testing
CREATE TABLE IF NOT EXISTS beta_testers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'pending',
    invited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS beta_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100),
    feedback TEXT NOT NULL,
    rating INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Analytics
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_name VARCHAR(255) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(255) NOT NULL,
    metric_value NUMERIC,
    tags JSONB,
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
