-- Phase 8: Final Rendering & Export Pipeline
-- Tables: exports, export_logs, share_links

-- Exports: One per export operation, tracks all render jobs
CREATE TABLE IF NOT EXISTS exports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER,
    timeline_id INTEGER REFERENCES timelines(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL DEFAULT 'Export',
    input_path TEXT NOT NULL,           -- Path to the assembled video
    output_path TEXT,                   -- Final rendered output path
    output_filename VARCHAR(255),
    output_size_bytes BIGINT,
    output_duration_seconds NUMERIC(10,2),
    resolution VARCHAR(20) NOT NULL DEFAULT '1080p',  -- 720p, 1080p, 4k
    format VARCHAR(20) NOT NULL DEFAULT 'mp4',        -- mp4, mov, webm
    bitrate VARCHAR(20) DEFAULT '8M',
    framerate INTEGER DEFAULT 30,
    include_audio BOOLEAN DEFAULT true,
    compression_level VARCHAR(20) DEFAULT 'medium',   -- fast, medium, slow (quality)
    metadata JSONB DEFAULT '{}',       -- Custom metadata tags
    status VARCHAR(50) DEFAULT 'queued', -- queued, processing, completed, failed, expired
    progress INTEGER DEFAULT 0,        -- 0-100
    job_id VARCHAR(100),               -- Redis/BullMQ job ID
    error_message TEXT,
    ffmpeg_command TEXT,               -- Full command for debugging
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    expires_at TIMESTAMP,              -- When the download link expires
    download_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_exports_user ON exports(user_id);
CREATE INDEX IF NOT EXISTS idx_exports_timeline ON exports(timeline_id);
CREATE INDEX IF NOT EXISTS idx_exports_status ON exports(status);
CREATE INDEX IF NOT EXISTS idx_exports_expires ON exports(expires_at) WHERE expires_at IS NOT NULL;

-- Export logs: Granular progress tracking during render
CREATE TABLE IF NOT EXISTS export_logs (
    id SERIAL PRIMARY KEY,
    export_id INTEGER NOT NULL REFERENCES exports(id) ON DELETE CASCADE,
    job_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'processing',
    progress INTEGER DEFAULT 0,
    stage VARCHAR(100),                -- e.g., 'scaling', 'encoding', 'audio_muxing', 'complete'
    message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_logs_export ON export_logs(export_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_job ON export_logs(job_id);

-- Share links: Generate shareable download links with expiry
CREATE TABLE IF NOT EXISTS share_links (
    id SERIAL PRIMARY KEY,
    export_id INTEGER NOT NULL REFERENCES exports(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,        -- Unique share token
    url_token VARCHAR(128) NOT NULL UNIQUE,   -- URL-safe token for sharing
    is_active BOOLEAN DEFAULT true,
    max_downloads INTEGER,                    -- NULL = unlimited
    download_count INTEGER DEFAULT 0,
    password_hash VARCHAR(255),              -- Optional password protection (bcrypt)
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,           -- Mandatory expiry
    last_accessed_at TIMESTAMP,
    created_by_ip VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_share_links_export ON share_links(export_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(url_token);
CREATE INDEX IF NOT EXISTS idx_share_links_expires ON share_links(expires_at);
