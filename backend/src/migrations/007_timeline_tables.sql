-- Phase 7: Video Assembly - Timeline Tables
-- Creates the tables needed for clip ordering, transitions, and assembly

-- Timelines: One per project, stores the assembly configuration
CREATE TABLE IF NOT EXISTS timelines (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    animation_id INTEGER,
    name VARCHAR(255) NOT NULL DEFAULT 'Unnamed Timeline',
    status VARCHAR(50) DEFAULT 'draft', -- draft, assembling, completed, failed
    total_duration_seconds NUMERIC(8,2) DEFAULT 0,
    output_path TEXT,
    output_size_bytes BIGINT,
    output_resolution VARCHAR(20) DEFAULT '1080p',
    assembly_started_at TIMESTAMP,
    assembly_completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Timeline Clips: Individual clips in the timeline with ordering and transitions
CREATE TABLE IF NOT EXISTS timeline_clips (
    id SERIAL PRIMARY KEY,
    timeline_id INTEGER NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
    scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
    clip_source TEXT, -- file path or URL to the video clip
    clip_order INTEGER NOT NULL, -- position in timeline (0-based)
    label VARCHAR(255), -- display label for the clip
    duration_seconds NUMERIC(8,2), -- clip duration from video metadata
    trim_start_seconds NUMERIC(6,2) DEFAULT 0,
    trim_end_seconds NUMERIC(6,2),
    volume NUMERIC(3,2) DEFAULT 1.0,
    
    -- Transition settings (applied at start of this clip)
    transition_type VARCHAR(20) DEFAULT 'cut', -- cut, fade, dissolve, wipe
    transition_duration_ms INTEGER DEFAULT 0, -- duration of the transition in ms
    
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, ready, failed
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure ordering is unique per timeline
    CONSTRAINT unique_clip_order UNIQUE (timeline_id, clip_order)
);

-- Index for fast timeline lookups
CREATE INDEX IF NOT EXISTS idx_timelines_project ON timelines(project_id);
CREATE INDEX IF NOT EXISTS idx_timeline_clips_timeline ON timeline_clips(timeline_id);
CREATE INDEX IF NOT EXISTS idx_timeline_clips_order ON timeline_clips(timeline_id, clip_order);

-- Assembly logs: Track assembly jobs and their results
CREATE TABLE IF NOT EXISTS assembly_logs (
    id SERIAL PRIMARY KEY,
    timeline_id INTEGER NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    job_id VARCHAR(100), -- Redis/BullMQ job ID
    status VARCHAR(50) DEFAULT 'queued', -- queued, processing, completed, failed
    progress INTEGER DEFAULT 0, -- 0-100
    output_path TEXT,
    output_size_bytes BIGINT,
    duration_seconds NUMERIC(8,2),
    error_message TEXT,
    ffmpeg_command TEXT, -- the full ffmpeg command for debugging
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assembly_logs_timeline ON assembly_logs(timeline_id);
CREATE INDEX IF NOT EXISTS idx_assembly_logs_job ON assembly_logs(job_id);
