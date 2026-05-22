-- MovieAnimation.ai Database Schema
-- PostgreSQL - movieanimation_db
-- Phase 11: Beta Testing Complete Schema

-- ✅ Users table already exists in DB, adding to schema for reference
-- CREATE TABLE users (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name VARCHAR(255) NOT NULL,
--   email VARCHAR(255) UNIQUE NOT NULL,
--   password_hash VARCHAR(255) NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
-- );

-- Projects: Each movie project a user creates
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  genre VARCHAR(100),
  status VARCHAR(50) DEFAULT 'draft', -- draft, script_parsed, generating, assembling, completed, failed
  duration_estimate INTEGER, -- estimated total seconds
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Scripts: Uploaded or pasted movie scripts
CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(500),
  content TEXT NOT NULL,
  word_count INTEGER,
  language VARCHAR(50) DEFAULT 'en',
  format VARCHAR(50), -- pdf, txt, fountain, etc.
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Scenes: Parsed from scripts or manually created
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  description TEXT, -- e.g., "INT. COFFEE SHOP - DAY"
  action TEXT, -- narrative/stage directions
  dialogue JSONB, -- [{character, line}, ...]
  characters JSONB, -- ["JOHN", "SARAH"]
  setting TEXT,
  duration_estimate INTEGER, -- estimated seconds
  mood VARCHAR(100),
  visual_prompt TEXT, -- generated video prompt
  generation_status VARCHAR(50) DEFAULT 'pending', -- pending, generating, completed, failed
  video_url TEXT, -- generated video file URL
  audio_url TEXT, -- generated dialogue audio URL
  api_used VARCHAR(50), -- luma, runway, seedance
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- User Assets: Uploaded images (characters, backgrounds, props)
CREATE TABLE IF NOT EXISTS user_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  filename VARCHAR(500) NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  asset_type VARCHAR(50), -- character_photo, background, prop, reference
  metadata JSONB, -- face_encoding, tags, dimensions
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Video Clips: Generated video segments
CREATE TABLE IF NOT EXISTS video_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  api_used VARCHAR(50) NOT NULL, -- luma, runway, seedance
  job_id VARCHAR(500), -- API job/generation ID
  prompt TEXT,
  generation_params JSONB, -- full API params for reproducibility
  file_url TEXT, -- video file URL
  thumbnail_url TEXT,
  duration_ms INTEGER,
  resolution VARCHAR(20),
  status VARCHAR(50) DEFAULT 'pending', -- pending, generating, completed, failed
  error_message TEXT,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

-- Final Renders: Assembled movies
CREATE TABLE IF NOT EXISTS renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(500),
  file_url TEXT,
  file_size BIGINT,
  duration_ms INTEGER,
  resolution VARCHAR(20) DEFAULT '1080p',
  format VARCHAR(20) DEFAULT 'mp4',
  scene_order JSONB, -- ordered list of scene IDs
  transitions JSONB, -- transition configs
  status VARCHAR(50) DEFAULT 'processing', -- processing, completed, failed
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

-- API Usage Tracking: Cost monitoring and analytics
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  api_name VARCHAR(50) NOT NULL, -- luma, runway, claude, elevenlabs, dalle
  endpoint VARCHAR(255),
  credits_used DECIMAL(10, 4) DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  response_time_ms INTEGER,
  status_code INTEGER,
  success BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Beta Testers: Track beta program participants
CREATE TABLE IF NOT EXISTS beta_testers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code VARCHAR(50) UNIQUE,
  status VARCHAR(50) DEFAULT 'invited', -- invited, active, completed
  feedback_count INTEGER DEFAULT 0,
  projects_created INTEGER DEFAULT 0,
  invited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Beta Feedback: User feedback collection
CREATE TABLE IF NOT EXISTS beta_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(100), -- bug, feature_request, ui, performance, other
  severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
  title VARCHAR(500) NOT NULL,
  description TEXT,
  screenshot_url TEXT,
  status VARCHAR(50) DEFAULT 'open', -- open, acknowledged, in_progress, resolved, closed
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Analytics Events: Track user behavior
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(255),
  event_type VARCHAR(100) NOT NULL, -- page_view, button_click, generation_start, etc.
  event_data JSONB,
  user_agent TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Performance Metrics: Track system performance
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(255) NOT NULL,
  metric_value DECIMAL(10, 2),
  metric_unit VARCHAR(50),
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_status ON scenes(generation_status);
CREATE INDEX IF NOT EXISTS idx_video_clips_project_id ON video_clips(project_id);
CREATE INDEX IF NOT EXISTS idx_video_clips_status ON video_clips(status);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_api_name ON api_usage(api_name);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_status ON beta_feedback(status);
CREATE INDEX IF NOT EXISTS idx_renders_project_id ON renders(project_id);
