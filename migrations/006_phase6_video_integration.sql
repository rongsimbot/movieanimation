-- Phase 6: Video Generation Integration
-- Adds generation_jobs, cost_tracking, scene_prompts, and webhook support

BEGIN;

-- ─── Generation Jobs (Queue-aware video generation tracking) ─────────────

CREATE TABLE IF NOT EXISTS generation_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_id        UUID REFERENCES scenes(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Job metadata
    job_type        VARCHAR(50) NOT NULL DEFAULT 'text_to_video', -- text_to_video, image_to_video, batch
    api_name        VARCHAR(50) NOT NULL DEFAULT 'sora',          -- sora, runway, luma, seedance
    priority        INTEGER NOT NULL DEFAULT 0,                    -- higher = more urgent (default 0)
    
    -- Prompt engineering
    raw_prompt      TEXT,                                          -- original scene prompt
    enhanced_prompt TEXT,                                          -- AI-enhanced cinematic prompt
    prompt_style    VARCHAR(50),                                   -- cinematic, realistic, anime, etc.
    
    -- Character injection
    character_refs  JSONB,                                         -- [{name, image_url, description}]
    
    -- Generation params
    params          JSONB NOT NULL DEFAULT '{}',                   -- API-specific params (duration, quality, etc.)
    
    -- Status tracking
    status          VARCHAR(50) NOT NULL DEFAULT 'queued',         -- queued, processing, completed, failed, cancelled
    progress_pct    INTEGER DEFAULT 0,                             -- 0-100
    status_message  TEXT,
    
    -- API response data
    api_request_id  VARCHAR(500),                                  -- external API job ID
    api_response    JSONB,
    
    -- Output
    video_url       TEXT,
    thumbnail_url   TEXT,
    duration_sec    NUMERIC(10,2),
    file_size_bytes BIGINT,
    
    -- Cost
    estimated_cost  NUMERIC(10,6) DEFAULT 0,
    actual_cost     NUMERIC(10,6) DEFAULT 0,
    currency        VARCHAR(3) DEFAULT 'USD',
    
    -- Retry/DLQ
    retry_count     INTEGER DEFAULT 0,
    max_retries     INTEGER DEFAULT 3,
    last_error      TEXT,
    error_category  VARCHAR(50),                                   -- rate_limit, content_policy, api_error, timeout, etc.
    
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_generation_jobs_project_id ON generation_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_scene_id ON generation_jobs(scene_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_api_name ON generation_jobs(api_name);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_priority ON generation_jobs(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_created_at ON generation_jobs(created_at);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_generation_jobs_updated_at ON generation_jobs;
CREATE TRIGGER trg_generation_jobs_updated_at
    BEFORE UPDATE ON generation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ─── Cost Tracking (Detailed per-generation cost records) ────────────────

CREATE TABLE IF NOT EXISTS cost_tracking (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Cost details
    api_name        VARCHAR(50) NOT NULL,
    cost_type       VARCHAR(50) NOT NULL DEFAULT 'generation',     -- generation, storage, bandwidth, compute
    amount          NUMERIC(10,6) NOT NULL DEFAULT 0,
    currency        VARCHAR(3) DEFAULT 'USD',
    unit_count      NUMERIC(10,2),                                 -- seconds generated, tokens used, etc.
    unit_type       VARCHAR(50),                                  -- second, token, clip, mb, request
    
    -- Billing
    billed          BOOLEAN DEFAULT FALSE,
    billed_at       TIMESTAMPTZ,
    
    -- Metadata
    metadata        JSONB,
    
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cost_tracking_user_id ON cost_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_project_id ON cost_tracking(project_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_created_at ON cost_tracking(created_at);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_api_name ON cost_tracking(api_name);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_billed ON cost_tracking(billed);


-- ─── Scene Prompt Templates (Pre-built prompt engineering templates) ────

CREATE TABLE IF NOT EXISTS prompt_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    
    -- Template content
    style           VARCHAR(50) NOT NULL DEFAULT 'cinematic',     -- cinematic, realistic, anime, noir, etc.
    template_text   TEXT NOT NULL,                                 -- Prompt template with {{placeholders}}
    
    -- Default params
    default_duration    INTEGER DEFAULT 5,
    default_quality     VARCHAR(50) DEFAULT 'high',
    default_aspect      VARCHAR(20) DEFAULT '16:9',
    
    -- API compatibility
    compatible_apis     JSONB DEFAULT '["sora"]',                  -- ["sora", "runway", "luma", "seedance"]
    
    -- Cost estimate
    estimated_cost_per_sec NUMERIC(10,6) DEFAULT 0.10,
    
    -- Active flag
    is_active       BOOLEAN DEFAULT TRUE,
    
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- ─── Webhook Logs (For real-time progress tracking) ──────────────────────

CREATE TABLE IF NOT EXISTS webhook_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES generation_jobs(id) ON DELETE CASCADE,
    
    event_type      VARCHAR(100) NOT NULL,                         -- generation.started, generation.progress, generation.completed, etc.
    payload         JSONB NOT NULL,
    
    source_ip       VARCHAR(45),
    received_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_job_id ON webhook_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at ON webhook_logs(received_at);


-- ─── Seed prompt templates ─────────────────────────────────────────────────

INSERT INTO prompt_templates (name, description, style, template_text, default_duration, compatible_apis, estimated_cost_per_sec) VALUES
(
    'Cinematic Hero Shot',
    'Wide cinematic hero shots with dramatic lighting for establishing character presence',
    'cinematic',
    'Cinematic wide shot, {{character_description}}. {{action}}. {{setting}}. Dramatic lighting, 4K quality, film grain, professional color grading, shallow depth of field, anamorphic lens',
    8,
    '["sora", "runway"]',
    0.20
),
(
    'Character Close-Up',
    'Tight close-up shots for emotional character moments and dialogue',
    'cinematic',
    'Professional close-up shot, {{character_description}}. {{action}}. Soft key lighting, 85mm lens equivalent, shallow depth of field, cinematic color palette, {{mood}} mood',
    5,
    '["sora", "runway", "luma"]',
    0.15
),
(
    'Action Sequence',
    'Dynamic action sequences with camera movement and motion blur',
    'cinematic',
    'Dynamic action sequence, {{character_description}}. {{action}}. {{setting}}. Fast camera movement, motion blur, dust particles, dramatic angles, 24fps cinematic, Hollywood blockbuster style',
    8,
    '["sora", "runway", "seedance"]',
    0.20
),
(
    'Establishing Location Shot',
    'Wide establishing shots showing the scene location and atmosphere',
    'cinematic',
    'Establishing shot of {{setting}}. {{description}}. Golden hour lighting, drone shot, sweeping camera movement, atmospheric haze, photorealistic detail, {{mood}} atmosphere',
    8,
    '["sora", "runway", "luma"]',
    0.15
),
(
    'Anime Scene',
    'Anime-style scenes for animated projects',
    'anime',
    'Anime style, {{character_description}}. {{action}}. {{setting}}. Studio Ghibli inspired, hand-drawn animation feel, vibrant colors, detailed backgrounds, 24fps, {{mood}} atmosphere',
    5,
    '["sora", "seedance"]',
    0.20
),
(
    'Sci-Fi Environment',
    'Futuristic sci-fi environments with neon lighting and advanced technology',
    'cinematic',
    'Sci-fi environment, {{setting}}. {{description}}. Neon lighting, holographic displays, cyberpunk aesthetic, volumetric fog, ray tracing quality, futuristic architecture, {{mood}} atmosphere',
    8,
    '["sora", "runway"]',
    0.20
);

-- ─── Update video_clips to link to generation_jobs ────────────────────────

ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL;

-- ─── Add enhanced_prompt and prompt_style to scenes ───────────────────────

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS enhanced_prompt TEXT;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS prompt_style VARCHAR(50) DEFAULT 'cinematic';
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS character_images JSONB;  -- [{name, image_url}]

-- ─── Add smart_router fields to scenes ────────────────────────────────────

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS preferred_api VARCHAR(50);
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS fallback_api VARCHAR(50);
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(10,6);

COMMIT;
