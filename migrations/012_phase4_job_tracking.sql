-- Phase 4: Redis Job Queue — Job Tracking & Status Tables
-- MovieAnimation Backend

-- Core job status tracking table
CREATE TABLE IF NOT EXISTS job_tracking (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(255) UNIQUE NOT NULL,
  queue_name VARCHAR(100) NOT NULL,
  job_type VARCHAR(100) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  project_id INTEGER,
  scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  data JSONB,
  result JSONB,
  error TEXT,
  error_stack TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  estimated_duration_sec INTEGER,
  actual_duration_sec INTEGER,
  webhook_url TEXT,
  webhook_last_sent TIMESTAMP WITH TIME ZONE,
  priority INTEGER DEFAULT 0,
  tags TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dead Letter Queue table
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(255) NOT NULL,
  queue_name VARCHAR(100) NOT NULL,
  job_type VARCHAR(100) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  project_id INTEGER,
  original_data JSONB,
  error TEXT NOT NULL,
  error_stack TEXT,
  attempts_made INTEGER DEFAULT 3,
  failed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'unresolved',
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job status change log
CREATE TABLE IF NOT EXISTS job_status_log (
  id SERIAL PRIMARY KEY,
  job_tracking_id INTEGER,
  job_id VARCHAR(255) NOT NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  message TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_tracking_job_id ON job_tracking(job_id);
CREATE INDEX IF NOT EXISTS idx_job_tracking_user_id ON job_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_job_tracking_project_id ON job_tracking(project_id);
CREATE INDEX IF NOT EXISTS idx_job_tracking_status ON job_tracking(status);
CREATE INDEX IF NOT EXISTS idx_job_tracking_queue_name ON job_tracking(queue_name);
CREATE INDEX IF NOT EXISTS idx_job_tracking_created_at ON job_tracking(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_tracking_status_queue ON job_tracking(status, queue_name);

CREATE INDEX IF NOT EXISTS idx_dlq_job_id ON dead_letter_queue(job_id);
CREATE INDEX IF NOT EXISTS idx_dlq_queue_name ON dead_letter_queue(queue_name);
CREATE INDEX IF NOT EXISTS idx_dlq_status ON dead_letter_queue(status);

CREATE INDEX IF NOT EXISTS idx_queue_health_queue_name ON queue_health_snapshots(queue_name);
CREATE INDEX IF NOT EXISTS idx_queue_health_snapshot_at ON queue_health_snapshots(snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_status_log_job_id ON job_status_log(job_id);
CREATE INDEX IF NOT EXISTS idx_job_status_log_changed_at ON job_status_log(changed_at DESC);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_job_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_job_tracking_updated_at ON job_tracking;
CREATE TRIGGER trigger_job_tracking_updated_at
  BEFORE UPDATE ON job_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_job_tracking_updated_at();
