# MovieAnimation - AI-Powered Movie Creation Platform
## Project Overview

**Vision:** Users can log in, upload scripts + personal images, and generate complete animated movies using Multi-API AI video generation (Luma/Kling, Runway, Seedance).

**GitHub Repo:** https://github.com/rongsimbot/movieanimation

**Target Launch:** TBD (Phased rollout)

---

## 🎯 Core Features

### Phase 1: Foundation (Week 1-2)
- User authentication & accounts
- Script upload/editor interface
- Image/photo upload system
- Basic project dashboard

### Phase 2: AI Video Pipeline (Week 2-4)
- Multi-API video generation (Luma/Kling, Runway, Seedance)
- Intelligent API routing (quality vs. cost optimization)
- Scene breakdown from scripts
- Character image integration (user photos in generated scenes)

### Phase 3: Movie Assembly (Week 4-6)
- Video clip stitching/sequencing
- Audio integration (dialogue, music, SFX)
- Transitions & effects
- Preview & editing tools

### Phase 4: Production & Export (Week 6-8)
- Final rendering pipeline
- Export formats (MP4, MOV, etc.)
- Download & sharing features
- Gallery/portfolio for completed movies

---

## 🏗️ Technical Architecture

### Frontend
- **Framework:** React/Next.js
- **UI Library:** Tailwind CSS + shadcn/ui
- **Features:**
  - Script editor with scene breakdown
  - Drag-and-drop image uploader
  - Real-time generation status
  - Video preview player
  - Timeline editor for clip assembly

### Backend
- **Framework:** Node.js/Express (or Python/FastAPI)
- **Database:** PostgreSQL (`movieanimation_db`)
  - Tables: users, projects, scripts, scenes, assets, video_clips, renders
- **Storage:** S3-compatible (or local NFS for development)
- **Queue System:** Bull/Redis for async video generation jobs

### AI Video Integration
- **Primary:** OpenAI Sora 2 API (hero/cinematic content)
- **Secondary:** Runway Gen-4.5 API (professional polish)
- **Tertiary:** Seedance 2.0 API (volume/social clips)
- **Router Logic:** Smart selection based on:
  - Scene complexity
  - Quality requirements
  - Budget constraints
  - Generation speed needs

### Video Processing
- **FFmpeg:** Clip assembly, transitions, audio sync
- **Cloud Encoding:** Optional (AWS MediaConvert or similar)
- **Preview Generation:** Low-res previews for editing

---

## 📊 Database Schema (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'draft', -- draft, processing, completed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Scripts
CREATE TABLE scripts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  content TEXT NOT NULL,
  parsed_scenes JSONB, -- Auto-parsed scene breakdown
  created_at TIMESTAMP DEFAULT NOW()
);

-- User Assets (uploaded images)
CREATE TABLE user_assets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  project_id INTEGER REFERENCES projects(id),
  file_url TEXT NOT NULL,
  asset_type VARCHAR(50), -- character_photo, prop, background
  metadata JSONB, -- face_encoding, tags, etc.
  created_at TIMESTAMP DEFAULT NOW()
);

-- Scenes (parsed from script)
CREATE TABLE scenes (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  scene_number INTEGER,
  description TEXT,
  characters JSONB, -- Array of character names
  setting TEXT,
  duration_estimate INTEGER, -- seconds
  generation_status VARCHAR(50) DEFAULT 'pending', -- pending, generating, completed, failed
  created_at TIMESTAMP DEFAULT NOW()
);

-- Video Clips (generated)
CREATE TABLE video_clips (
  id SERIAL PRIMARY KEY,
  scene_id INTEGER REFERENCES scenes(id),
  api_used VARCHAR(50), -- sora2, runway, seedance
  prompt TEXT,
  generation_params JSONB,
  file_url TEXT,
  duration INTEGER, -- milliseconds
  status VARCHAR(50), -- generating, completed, failed
  cost DECIMAL(10,4), -- Track API costs
  created_at TIMESTAMP DEFAULT NOW()
);

-- Final Renders
CREATE TABLE renders (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  file_url TEXT,
  resolution VARCHAR(20), -- 1080p, 4K
  file_size BIGINT, -- bytes
  duration INTEGER, -- milliseconds
  status VARCHAR(50), -- processing, completed, failed
  created_at TIMESTAMP DEFAULT NOW()
);

-- API Usage Tracking
CREATE TABLE api_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  api_name VARCHAR(50),
  credits_used DECIMAL(10,4),
  cost DECIMAL(10,4),
  timestamp TIMESTAMP DEFAULT NOW()
);
```

---

## 🔌 API Integration Plan

### 1. OpenAI Sora 2 API
**Use Case:** Hero scenes, cinematic moments, narrative-driven content
**Endpoint:** `https://api.openai.com/v1/videos/generations`
**Authentication:** Bearer token (OpenAI API key)
**Parameters:**
- `prompt`: Scene description + character details
- `model`: "sora-2"
- `duration`: 5-10 seconds
- `aspect_ratio`: "16:9"
- `quality`: "high"

### 2. Runway Gen-4.5 API
**Use Case:** Professional polish, complex camera movements
**Endpoint:** `https://api.runwayml.com/v1/generate`
**Authentication:** API key header
**Parameters:**
- `prompt`: Detailed scene description
- `motion_brush`: Camera control data
- `style`: "cinematic" / "realistic"

### 3. Seedance 2.0 API
**Use Case:** Volume production, quick social clips
**Endpoint:** Via third-party provider (seedanceapi.org)
**Authentication:** API key
**Parameters:**
- `text_prompt`: Scene description
- `image_input`: User character photo (optional)
- `duration`: 3-5 seconds

### Smart Router Logic
```javascript
function selectAPI(scene) {
  if (scene.importance === 'hero' || scene.complexity === 'high') {
    return 'sora2'; // Best quality
  } else if (scene.camera_control || scene.professional) {
    return 'runway'; // Best control
  } else {
    return 'seedance'; // Fast & cost-effective
  }
}
```

---

## 🚀 Development Phases

### Phase 1: Infrastructure Setup (Week 1)
- [ ] Set up PostgreSQL database (`movieanimation_db`)
- [ ] Create GitHub repo structure
- [ ] Set up Next.js frontend scaffold
- [ ] Set up Node.js/Express backend API
- [ ] Configure Redis for job queue
- [ ] Set up S3/storage for assets

### Phase 2: User Authentication (Week 1)
- [ ] User registration/login
- [ ] JWT authentication
- [ ] Password hashing (bcrypt)
- [ ] Protected routes

### Phase 3: Script & Asset Management (Week 2)
- [ ] Script upload/editor UI
- [ ] Script parser (break down into scenes)
- [ ] Image upload system
- [ ] Asset library UI

### Phase 4: AI Video Generation Core (Week 2-3)
- [ ] Build `sora-video-manager` skill (OpenAI Sora 2 integration)
- [ ] Build `runway-video-manager` skill (Runway Gen-4.5)
- [ ] Build `seedance-video-manager` skill (Seedance 2.0)
- [ ] Implement smart API router
- [ ] Job queue for async generation
- [ ] Status tracking & webhooks

### Phase 5: Character Integration (Week 3)
- [ ] Face detection/encoding from user photos
- [ ] Inject character references into prompts
- [ ] Character consistency across scenes
- [ ] Preview character appearances

### Phase 6: Video Assembly Pipeline (Week 4)
- [ ] FFmpeg integration for clip stitching
- [ ] Timeline editor UI
- [ ] Transition effects
- [ ] Audio sync (dialogue, music, SFX)
- [ ] Real-time preview

### Phase 7: Rendering & Export (Week 5)
- [ ] Final render pipeline
- [ ] Resolution options (720p, 1080p, 4K)
- [ ] Export formats (MP4, MOV, WebM)
- [ ] Download links & sharing

### Phase 8: Polish & Launch Prep (Week 6)
- [ ] User dashboard (project gallery)
- [ ] Cost tracking UI (API usage)
- [ ] Performance optimization
- [ ] Beta testing
- [ ] Documentation

---

## 🎬 User Workflow Example

1. **Sign Up/Login** → User creates account
2. **Create Project** → "My First Movie"
3. **Upload Script** → Paste or upload `.txt`/`.pdf` script
4. **Auto Scene Breakdown** → AI parses script into scenes
5. **Upload Character Photos** → User uploads their headshots
6. **Map Characters** → Assign photos to script characters
7. **Configure Scenes** → Adjust prompts, select quality tier
8. **Generate Videos** → Click "Generate All Scenes"
9. **Review Clips** → Preview each generated scene
10. **Assemble Movie** → Drag/drop scenes into timeline
11. **Add Audio** → Upload or generate dialogue/music
12. **Export** → Final render (1080p MP4)
13. **Share** → Download or share link

---

## 💰 Pricing Strategy (Future)

**Free Tier:**
- 1 project, 10 scenes/month
- 720p export
- Seedance API only

**Pro Tier ($29/month):**
- Unlimited projects
- 50 scenes/month
- 1080p export
- Access to Runway API

**Studio Tier ($99/month):**
- Unlimited projects & scenes
- 4K export
- All APIs (Sora 2, Runway, Seedance)
- Priority generation queue

---

## 📋 Success Metrics

- User signups
- Scripts uploaded
- Videos generated (by API)
- Completed movies exported
- User retention rate
- API cost per movie
- Average generation time

---

## 🔧 Tech Stack Summary

**Frontend:** React, Next.js, Tailwind CSS
**Backend:** Node.js, Express, PostgreSQL, Redis
**Storage:** S3 (or compatible)
**Video Processing:** FFmpeg
**AI APIs:** Sora 2, Runway Gen-4.5, Seedance 2.0
**Hosting:** Vercel (frontend), Railway/Render (backend)
**CI/CD:** GitHub Actions

---

## 🚨 Risks & Mitigations

**Risk:** API costs spiral out of control
**Mitigation:** Implement strict usage limits, smart API routing, cost tracking dashboard

**Risk:** Video generation takes too long
**Mitigation:** Queue system, progress updates, batch processing

**Risk:** User-uploaded images don't match AI generation style
**Mitigation:** Pre-processing (style transfer), clear user guidelines, preview before generation

**Risk:** Script parsing fails for complex formats
**Mitigation:** Manual scene editor, multiple parser strategies, user validation step

---

## 📞 Next Steps - Immediate Actions

1. **Create Trello cards** for all development phases
2. **Spawn SimCoder** to start Phase 1 (infrastructure setup)
3. **Build API integration skills** (sora-video-manager, runway-video-manager, seedance-video-manager)
4. **Set up database** on RTX 3060 node (PostgreSQL)
5. **Initialize GitHub repo** with project structure

---

**Project Start Date:** 2026-03-20
**Project Lead:** Synclair Gaines
**Development Team:** SimCoder (agent), Main Agent (integration)
**Status:** ✅ APPROVED - Development starting now

### MovieAnimation Processing API (MAP-API)
**Location:** Dell GB10 & RTX 3060 (Local GPU Servers)
**Framework:** FastAPI (Python) or Express.js (Node)
**Purpose:** Dedicated microservice orchestrating all heavy AI and video processing.
- `/api/v1/script/generate` (Anthropic Claude processing)
- `/api/v1/video/render-scene` (Luma/Kling cloud generation)
- `/api/v1/process/face-swap` (Local GPU Face Swapping via Roop/ReActor)
- `/api/v1/movie/assemble` (Local GPU FFmpeg stitching and audio sync)

### Hybrid-Cloud Deployment Architecture (Azure + Local)
- **Frontend (Public):** Hosted on Microsoft Azure (handles public traffic, SSL, UI serving).
- **VPN Tunnel:** Tailscale or Azure VPN Gateway connecting Azure VNet to the SimRobotics LAN.
- **Backend/Processing (Private):** All API rendering (MAP-API) and PostgreSQL databases run exclusively on the local Dell GB10 and RTX 3060 nodes.
- **Benefits:** Massive cloud computing cost savings, maximum security (DB is off-grid), and high performance local GPU rendering.
