-- Phase 3: Script & Asset Management Migration
-- MovieAnimation - Phase 3 Script Upload & Editor System
-- Ensures all required tables exist for script management, assets, and characters

-- Scripts table (if not already created)
CREATE TABLE IF NOT EXISTS scripts (
    id SERIAL PRIMARY KEY,
    script_title VARCHAR(500) NOT NULL,
    script_content TEXT NOT NULL,
    version VARCHAR(20) DEFAULT '1.0',
    version_notes TEXT,
    author VARCHAR(255),
    genre VARCHAR(100),
    word_count INTEGER,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'archived')),
    created_at TIMESTAMP DEFAULT NOW(),
    last_modified TIMESTAMP DEFAULT NOW(),
    animation_id INTEGER,
    original_text TEXT,
    source_filename VARCHAR(500),
    uploaded_at TIMESTAMP
);

-- Characters table
CREATE TABLE IF NOT EXISTS characters (
    id SERIAL PRIMARY KEY,
    character_name VARCHAR(255) NOT NULL UNIQUE,
    character_type VARCHAR(20) CHECK (character_type IN ('protagonist', 'antagonist', 'supporting', 'minor', 'narrator')),
    description TEXT,
    appearance_notes TEXT,
    voice_notes TEXT,
    image_url VARCHAR(1000),
    default_prompt TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    last_modified TIMESTAMP DEFAULT NOW()
);

-- Scenes table
CREATE TABLE IF NOT EXISTS scenes (
    id SERIAL PRIMARY KEY,
    chapter_id INTEGER NOT NULL,
    scene_number INTEGER NOT NULL,
    scene_title VARCHAR(500),
    description TEXT,
    duration_seconds INTEGER,
    location VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    last_modified TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_chapter_scene UNIQUE (chapter_id, scene_number)
);

-- Scene-Character junction table
CREATE TABLE IF NOT EXISTS scene_characters (
    scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    action_notes TEXT,
    PRIMARY KEY (scene_id, character_id)
);

-- Animation-Character junction table
CREATE TABLE IF NOT EXISTS animation_characters (
    animation_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    role VARCHAR(50),
    PRIMARY KEY (animation_id, character_id)
);

-- Animations table
CREATE TABLE IF NOT EXISTS animations (
    id SERIAL PRIMARY KEY,
    animation_name VARCHAR(500) NOT NULL,
    script_id INTEGER REFERENCES scripts(id) ON DELETE SET NULL,
    owner VARCHAR(255),
    status VARCHAR(20) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Chapters table
CREATE TABLE IF NOT EXISTS chapters (
    id SERIAL PRIMARY KEY,
    animation_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    chapter_title VARCHAR(500),
    content_summary TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_animation_chapter UNIQUE (animation_id, chapter_number)
);

-- User Assets table
CREATE TABLE IF NOT EXISTS user_assets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    animation_id INTEGER,
    file_name VARCHAR(500) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    asset_type VARCHAR(50) DEFAULT 'character_photo',
    character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    last_modified TIMESTAMP DEFAULT NOW()
);

-- Users table (if not created by auth migration)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scripts_status ON scripts(status);
CREATE INDEX IF NOT EXISTS idx_scripts_animation ON scripts(animation_id);
CREATE INDEX IF NOT EXISTS idx_scripts_author ON scripts(author);
CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scenes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(character_name);
CREATE INDEX IF NOT EXISTS idx_user_assets_user ON user_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_type ON user_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_user_assets_character ON user_assets(character_id);
CREATE INDEX IF NOT EXISTS idx_chapters_animation ON chapters(animation_id);
CREATE INDEX IF NOT EXISTS idx_animations_script ON animations(script_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Trigger to update last_modified on scripts
CREATE OR REPLACE FUNCTION update_scripts_last_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_scripts_last_modified ON scripts;
CREATE TRIGGER trigger_scripts_last_modified
    BEFORE UPDATE ON scripts
    FOR EACH ROW
    EXECUTE FUNCTION update_scripts_last_modified();

-- Trigger to update last_modified on characters
CREATE OR REPLACE FUNCTION update_characters_last_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_characters_last_modified ON characters;
CREATE TRIGGER trigger_characters_last_modified
    BEFORE UPDATE ON characters
    FOR EACH ROW
    EXECUTE FUNCTION update_characters_last_modified();
