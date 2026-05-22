-- Phase 5: Video Assembly Pipeline - Preview Support
-- Adds preview and thumbnail paths to timeline_clips
-- Adds scene_clip_linking table for scene-to-clip mapping

-- Add preview generation fields to timeline_clips
ALTER TABLE timeline_clips 
  ADD COLUMN IF NOT EXISTS preview_path TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_path TEXT,
  ADD COLUMN IF NOT EXISTS preview_status VARCHAR(50) DEFAULT 'none'; -- none, generating, ready, failed

-- Index for preview status queries
CREATE INDEX IF NOT EXISTS idx_timeline_clips_preview_status ON timeline_clips(preview_status);

-- Scene-to-clip link table (allows scenes to map to specific video clips)
CREATE TABLE IF NOT EXISTS scene_clips (
    id SERIAL PRIMARY KEY,
    scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    clip_source TEXT NOT NULL, -- file path or URL to the video clip
    clip_type VARCHAR(50) DEFAULT 'generated', -- generated, uploaded, reference
    label VARCHAR(255),
    duration_seconds NUMERIC(8,2),
    preview_path TEXT,
    thumbnail_path TEXT,
    preview_status VARCHAR(50) DEFAULT 'none',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scene_clips_scene ON scene_clips(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_clips_type ON scene_clips(clip_type);

-- Preview jobs table for tracking batch preview generation
CREATE TABLE IF NOT EXISTS preview_jobs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    entity_type VARCHAR(50) NOT NULL, -- 'timeline', 'scene', 'clip'
    entity_id INTEGER NOT NULL,
    total_clips INTEGER DEFAULT 0,
    completed_clips INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'queued', -- queued, processing, completed, failed
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preview_jobs_entity ON preview_jobs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_preview_jobs_status ON preview_jobs(status);
