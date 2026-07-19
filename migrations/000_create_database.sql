-- ============================================================================
-- MovieAnimation.ai - Migration 000: Database Creation
-- Description: Create the movieanimation_db database if it doesn't exist.
-- Run as PostgreSQL superuser.
-- Usage: psql -U postgres -f 000_create_database.sql
-- ============================================================================

-- Check if database exists
SELECT 'Checking for movieanimation_db...' AS status;

-- Create database if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'movieanimation_db') THEN
        PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE movieanimation_db');
        RAISE NOTICE 'Created database: movieanimation_db';
    ELSE
        RAISE NOTICE 'Database movieanimation_db already exists';
    END IF;
END $$;

-- Note: If dblink is not available, run this manually:
-- CREATE DATABASE movieanimation_db;
-- Then grant privileges:
-- GRANT ALL PRIVILEGES ON DATABASE movieanimation_db TO sim_admin;
