#!/usr/bin/env node
/**
 * MovieAnimation.ai - Database Migration Script
 * 
 * Connects to movieanimation_db and creates/updates all tables.
 * Run: node db/migrate.js
 */

const { Pool } = require('pg');

const DB_URL = process.env.DATABASE_URL || 
  'postgresql://sim_admin:SimData_Vector_2026!@localhost:5432/movieanimation_db';

const pool = new Pool({ connectionString: DB_URL });

const schema = `
-- Users: Core user accounts (only if not existing)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  email_verify_token VARCHAR(255),
  email_verify_expires TIMESTAMPTZ,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  oauth_provider VARCHAR(50),
  oauth_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  tier VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Projects
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

-- Scripts
CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(500),
  content TEXT NOT NULL,
  word_count INTEGER,
  language VARCHAR(50) DEFAULT 'en',
  format VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Characters (NEW per task)
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  role VARCHAR(100),
  gender VARCHAR(50),
  age_range VARCHAR(100),
  voice_profile TEXT,
  visual_description TEXT,
  image_url TEXT,
  traits JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Scenes
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  description TEXT,
  action TEXT,
  dialogue JSONB,
  characters JSONB,
  setting TEXT,
  duration_estimate INTEGER,
  mood VARCHAR(100),
  visual_prompt TEXT,
  generation_status VARCHAR(50) DEFAULT 'pending',
  video_url TEXT,
  audio_url TEXT,
  api_used VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Generation Jobs (NEW per task)
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  job_type VARCHAR(50) NOT NULL,
  api_name VARCHAR(50) NOT NULL,
  api_job_id VARCHAR(500),
  prompt TEXT,
  params JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  result_url TEXT,
  error_message TEXT,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  priority INTEGER DEFAULT 0,
  estimated_duration_sec INTEGER,
  actual_duration_sec INTEGER,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Video Clips
CREATE TABLE IF NOT EXISTS video_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  api_used VARCHAR(50) NOT NULL,
  job_id VARCHAR(500),
  prompt TEXT,
  generation_params JSONB,
  file_url TEXT,
  thumbnail_url TEXT,
  duration_ms INTEGER,
  resolution VARCHAR(20),
  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_project_id ON generation_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`;

async function migrate() {
  console.log('🔄 Running MovieAnimation.ai database migration...');
  
  try {
    const client = await pool.connect();
    
    // Test connection
    const { rows } = await client.query("SELECT version()");
    console.log(`✅ Connected: ${rows[0].version.substring(0, 50)}...`);
    
    // Run schema
    await client.query(schema);
    console.log('✅ Schema applied successfully');
    
    // Verify tables
    const { rows: tables } = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log(`📊 Tables created (${tables.length}):`);
    tables.forEach(t => console.log(`   - ${t.table_name}`));

    // Check specifically for the 6 required tables
    const requiredTables = ['users', 'projects', 'scripts', 'characters', 'scenes', 'generation_jobs'];
    const existing = tables.map(t => t.table_name);
    const missing = requiredTables.filter(t => !existing.includes(t));
    
    if (missing.length > 0) {
      console.log(`⚠️  Missing tables: ${missing.join(', ')}`);
    } else {
      console.log('✅ All 6 required tables present!');
    }

    client.release();
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    
    // Fallback: try alternate connection
    console.log('🔄 Trying alternate connection (SSH tunnel:5432 => GPU node)...');
    try {
      const altPool = new Pool({
        connectionString: process.env.DATABASE_URL_SSH || 
          'postgresql://sim_admin:SimData_Vector_2026!@192.168.1.138:5432/movieanimation_db',
        connectionTimeoutMillis: 5000,
      });
      const client = await altPool.connect();
      await client.query(schema);
      console.log('✅ Schema applied via alternate connection');
      
      const { rows: tables } = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
      );
      console.log(`📊 Tables (${tables.length}):`);
      tables.forEach(t => console.log(`   - ${t.table_name}`));
      client.release();
    } catch (altErr) {
      console.error('❌ Alternate connection also failed:', altErr.message);
      console.log('💡 The schema SQL is saved in db/schema.sql — apply manually when DB is reachable');
    }
  } finally {
    await pool.end();
  }
}

migrate();
