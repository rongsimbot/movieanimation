-- ============================================================================
-- Migration: heygen_avatar_integration
-- Description: Tables for HeyGen Avatar Integration
-- Date: 2026-06-01
-- ============================================================================

-- ─── HeyGen Avatars (created once, reused across scenes) ────────────────────
CREATE TABLE IF NOT EXISTS heygen_avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_name VARCHAR(100) NOT NULL UNIQUE,
  avatar_group_id VARCHAR(100) NOT NULL,
  default_look_id VARCHAR(100),
  photo_url TEXT,
  status VARCHAR(20) DEFAULT 'active',       -- active, processing, failed
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heygen_avatars_character ON heygen_avatars(character_name);
CREATE INDEX IF NOT EXISTS idx_heygen_avatars_status ON heygen_avatars(status);

-- ─── HeyGen Assets (uploaded backgrounds, audio, images) ─────────────────────
CREATE TABLE IF NOT EXISTS heygen_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id VARCHAR(100) NOT NULL,
  asset_type VARCHAR(20) NOT NULL,            -- 'background', 'audio', 'image'
  scene_id UUID,
  mime_type VARCHAR(50),
  size_bytes INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heygen_assets_type ON heygen_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_heygen_assets_scene ON heygen_assets(scene_id);

-- ─── HeyGen Videos (generated video tracking) ───────────────────────────────
CREATE TABLE IF NOT EXISTS heygen_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID UNIQUE,
  session_id VARCHAR(100),
  heygen_video_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',       -- pending, processing, completed, failed
  video_url TEXT,
  thumbnail_url TEXT,
  local_path TEXT,
  duration_seconds DECIMAL(10, 2),
  failure_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_heygen_videos_status ON heygen_videos(status);
CREATE INDEX IF NOT EXISTS idx_heygen_videos_scene ON heygen_videos(scene_id);

-- ─── Function: Update timestamps automatically ──────────────────────────────
CREATE OR REPLACE FUNCTION update_heygen_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS trg_heygen_avatars_updated ON heygen_avatars;
CREATE TRIGGER trg_heygen_avatars_updated
  BEFORE UPDATE ON heygen_avatars
  FOR EACH ROW EXECUTE FUNCTION update_heygen_timestamp();

DROP TRIGGER IF EXISTS trg_heygen_videos_updated ON heygen_videos;
CREATE TRIGGER trg_heygen_videos_updated
  BEFORE UPDATE ON heygen_videos
  FOR EACH ROW EXECUTE FUNCTION update_heygen_timestamp();
