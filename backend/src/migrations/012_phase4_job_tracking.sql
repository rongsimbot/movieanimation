-- Phase 4: Redis Job Queue — Job Tracking & Status Tables
-- MovieAnimation Backend
-- Centralized job status tracking for all BullMQ queues

-- Core job status tracking table
CREATE TABLE IF NOT EXISTS job_tracking (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(255) UNIQUE NOT NULL,       -- BullMQ job ID
  queue_name VARCHAR(100) NOT NULL,           -- Queue name (video-generation, script-parsing, etc.)
  job_type VARCHAR(100) NOT NULL,             -- Job type (generate-video, parse-script, etc.)
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, active, completed, failed, cancelled, delayed
  progress INTEGER DEFAULT 0,                 -- 0-100
  attempts INTEGER DEFAULT 0,                 -- Current attempt number
  max_attempts INTEGER DEFAULT 3,             -- Max retry attempts
  data JSONB,                                 -- Job input data (sanitized)
  result JSONB,                               -- Job output result
  error TEXT,                                 -- Last error message
  error_stack TEXT,                           -- Full error stack trace
  started_at TIMESTAMP WITH TIME ZONE,        -- When job started processing
  completed_at TIMESTAMP WITH TIME ZONE,      -- When job finished (success or fail)
  estimated_duration_sec INTEGER,             -- Estimated job duration in seconds
  actual_duration_sec INTEGER,                -- Actual job duration in seconds
  webhook_url TEXT,                           -- Webhook URL for status updates
  webhook_last_sent TIMESTAMP WITH TIME ZONE, -- Last webhook delivery timestamp
  priority INTEGER DEFAULT 0,                 -- Job priority (-10=lowest, 10=highest)
  tags TEXT[],                                -- Searchable tags
  metadata JSONB DEFAULT '{}',                -- Arbitrary metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dead Letter Queue table (jobs that exhausted all retries)
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(255) NOT NULL,
  queue_name VARCHAR(100) NOT NULL,
  job_type VARCHAR(100) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  original_data JSONB,                        -- Original job data
  error TEXT NOT NULL,                         -- Final error that caused DLQ
  error_stack TEXT,
  attempts_made INTEGER DEFAULT 3,
  failed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'unresolved',     -- unresolved, retrying, resolved, discarded
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Queue health snapshot (periodic)
CREATE TABLE IF NOT EXISTS queue_health_snapshots (
  id SERIAL PRIMARY KEY,
  queue_name VARCHAR(100) NOT NULL,
  waiting INTEGER DEFAULT 0,
  active INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  delayed INTEGER DEFAULT 0,
  paused BOOLEAN DEFAULT FALSE,
  worker_count INTEGER DEFAULT 0,
  avg_completion_ms INTEGER,
  snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job status change log (audit trail)
CREATE TABLE IF NOT EXISTS job_status_log (
  id SERIAL PRIMARY KEY,
  job_tracking_id INTEGER REFERENCES job_tracking(id) ON DELETE CASCADE,
  job_id VARCHAR(255) NOT NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  message TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
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

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_job_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_job_tracking_updated_at ON job_tracking;
CREATE TRIGGER trigger_job_tracking_updated_at
  BEFORE UPDATE ON job_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_job_tracking_updated_at();
