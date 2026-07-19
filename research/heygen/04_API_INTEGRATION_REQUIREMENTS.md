# HeyGen API Integration Requirements for MovieAnimation.ai

**Date:** 2026-06-01  
**Researcher:** SimAnalyst  
**Target Stack:** Node.js Express backend on DESKTOP-EC24FP3

---

## 1. Prerequisites

### API Access
- [ ] HeyGen account with API access enabled
- [ ] API Key generated (Settings → API in HeyGen dashboard)
- [ ] API Wallet funded ($5 minimum pay-as-you-go, or Scale plan $330/mo)
- [ ] ElevenLabs API key (for custom voice generation)

### Environment Variables (`.env`)
```bash
# HeyGen
HEYGEN_API_KEY=sk_live_xxxxxxxxxxxxxxxx
HEYGEN_BASE_URL=https://api.heygen.com/v3

# ElevenLabs
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_ID_BEN=xxxxxxxxxxxx
ELEVENLABS_VOICE_ID_SARAH=xxxxxxxxxxxx

# Luma AI
LUMA_API_KEY=sk_xxxxxxxxxxxxxxxx

# Storage
ASSET_STORAGE_PATH=/data/movieanimation/assets
VIDEO_OUTPUT_PATH=/data/movieanimation/output
```

### System Requirements (DESKTOP-EC24FP3)
- **OS:** Windows (Node.js runs natively)
- **GPU:** RTX 3060 12GB (for ffmpeg fallback if needed)
- **Storage:** 50GB+ for video assets (Luma scenes, HeyGen outputs)
- **Network:** Stable internet for API calls (async generation is remote)

---

## 2. API Endpoints Required

### 2.1 Photo Avatar Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v3/avatars` | POST | Create photo avatar from image |
| `/v3/avatars` | GET | List all avatars (public + private) |
| `/v3/avatars/{group_id}` | GET | Get specific avatar group details |
| `/v3/avatars/looks` | GET | List looks for an avatar group |

### 2.2 Asset Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v3/assets` | POST | Upload background video, audio, or images |
| `/v3/assets` | GET | List uploaded assets (if available) |

### 2.3 Video Generation

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v3/video-agents` | POST | Generate video from prompt + assets |
| `/v3/video-agents/{session_id}` | GET | Check session status |
| `/v3/videos/{video_id}` | GET | Check video render status |
| `/v3/videos` | GET | List all generated videos |
| `/v3/videos/{video_id}` | DELETE | Delete a generated video |

### 2.4 Voice Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v3/voices` | GET | List available voices |

### 2.5 Video Translation (Future)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v3/video-translations` | POST | Translate + dub video into new language |

---

## 3. Package Dependencies

```json
{
  "dependencies": {
    "node-fetch": "^3.3.0",
    "form-data": "^4.0.0",
    "express": "^4.18.0",
    "bull": "^4.12.0",
    "dotenv": "^16.3.0",
    "axios": "^1.6.0",
    "fs-extra": "^11.2.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nock": "^13.4.0"
  }
}
```

- **`bull`**: Job queue for managing concurrent render limits (max 3)
- **`form-data`**: Multipart uploads for HeyGen Assets API
- **`fs-extra`**: File management for downloaded videos

---

## 4. Module Architecture

```
backend/
├── services/
│   ├── heygen/
│   │   ├── client.js          # Base HeyGen API client
│   │   ├── avatars.js         # Avatar creation & management
│   │   ├── assets.js          # Asset upload (backgrounds, audio)
│   │   ├── videos.js          # Video generation & polling
│   │   └── webhooks.js        # Webhook handler
│   ├── elevenlabs/
│   │   └── client.js          # ElevenLabs TTS client
│   ├── luma/
│   │   └── client.js          # Luma AI scene generation
│   └── orchestrator.js        # Full pipeline orchestrator
├── queues/
│   └── sceneQueue.js          # Bull job queue (max 3 concurrent)
├── routes/
│   └── scenes.js              # Express routes for scene generation
└── utils/
    ├── downloader.js          # Video download & storage
    └── logger.js              # Structured logging
```

---

## 5. Proposed `heygen-avatar` Skill

### Recommendation: ✅ YES — Build a custom skill

The official `heygen-com/skills` repo provides generic agent skills (heygen-avatar, heygen-video, heygen-translate). However, MovieAnimation.ai needs:

1. **Custom pipeline integration** — Luma scene → ElevenLabs audio → HeyGen video in one orchestrated flow
2. **Movie-specific parameters** — Scene numbers, character assignments, dialogue scripts
3. **Batch processing** — Queue management for 10+ scenes per movie
4. **Error recovery** — Movie-specific failure handling (retry scene, not whole movie)
5. **Asset management** — Tracking which Luma scenes map to which HeyGen asset IDs

### Proposed Skill Structure

```
skills/heygen-avatar/
├── SKILL.md                       # Skill documentation
├── client.js                      # HeyGen API client wrapper
├── avatar-manager.js              # Avatar creation, caching, reuse
├── scene-generator.js             # End-to-end scene pipeline
├── batch-processor.js             # Queue-based batch generation
└── utils/
    ├── asset-uploader.js          # Bulk upload helpers
    └── poller.js                  # Status polling with backoff
```

### Skill Boundaries
- **Owns:** Avatar creation, asset upload, video generation, status polling
- **Delegates:** Scene generation → Luma skill; Audio → ElevenLabs skill
- **Input:** Scene config (character, dialogue, Luma scene URL)
- **Output:** Rendered MP4 video URL or local file path

---

## 6. Database Schema (PostgreSQL)

```sql
-- Avatars (created once, reused across scenes)
CREATE TABLE heygen_avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_name VARCHAR(100) NOT NULL,
  avatar_group_id VARCHAR(100) NOT NULL,
  default_look_id VARCHAR(100) NOT NULL,
  photo_url TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Assets (uploaded backgrounds, audio)
CREATE TABLE heygen_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id VARCHAR(100) NOT NULL,
  asset_type VARCHAR(20) NOT NULL, -- 'background', 'audio', 'image'
  scene_id UUID REFERENCES scenes(id),
  mime_type VARCHAR(50),
  size_bytes INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Generated Videos
CREATE TABLE heygen_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heygen_video_id VARCHAR(100),
  session_id VARCHAR(100),
  scene_id UUID REFERENCES scenes(id),
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  video_url TEXT,
  thumbnail_url TEXT,
  duration_seconds DECIMAL(10,2),
  failure_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

---

## 7. Express Route Design

```javascript
// routes/scenes.js

const router = require('express').Router();
const SceneOrchestrator = require('../services/orchestrator');

// Generate a single scene
router.post('/scenes/generate', async (req, res) => {
  const { character, dialogue, lumaPrompt, sceneNumber } = req.body;
  
  const job = await sceneQueue.add('generate-scene', {
    character,
    dialogue,
    lumaPrompt,
    sceneNumber,
  });
  
  res.json({ jobId: job.id, status: 'queued' });
});

// Generate entire movie (batch)
router.post('/movies/generate', async (req, res) => {
  const { scenes, movieId } = req.body; // scenes = [{ character, dialogue, lumaPrompt }]
  
  const batchJob = await batchQueue.add('generate-movie', {
    movieId,
    scenes,
  });
  
  res.json({ batchJobId: batchJob.id, status: 'queued', sceneCount: scenes.length });
});

// Check scene status
router.get('/scenes/:sceneId/status', async (req, res) => {
  const video = await db.heygen_videos.findBySceneId(req.params.sceneId);
  res.json(video);
});

// Webhook receiver
router.post('/webhooks/heygen', (req, res) => {
  const { video_id, status, video_url, callback_id } = req.body;
  // Update database, notify client via WebSocket
  res.sendStatus(200);
});
```

---

## 8. Error Handling Strategy

| Error Scenario | Handling |
|---------------|----------|
| **Asset upload failed** | Retry 3x with exponential backoff |
| **Video generation failed** | Log failure, retry with adjusted prompt |
| **Rate limit (429)** | Respect Retry-After header, back off |
| **Concurrent limit hit** | Queue automatically handles (max 3) |
| **Video URL expired** | Re-fetch from HeyGen using video_id |
| **Network timeout** | Retry with circuit breaker pattern |
| **Credit depletion** | Alert admin, pause queue |
| **Avatar training failed** | Retry with different photo or fall back to stock avatar |

---

## 9. Integration Timeline

| Week | Task | Effort |
|------|------|--------|
| **Week 1** | Set up HeyGen account, API key, test calls | 2 hours |
| **Week 1** | Build base client, asset upload module | 4 hours |
| **Week 1** | Create Ben & Sarah photo avatars | 2 hours |
| **Week 2** | Build video generation + polling module | 4 hours |
| **Week 2** | Build job queue (Bull + Redis) | 4 hours |
| **Week 2** | Build orchestrator (Luma → ElevenLabs → HeyGen) | 6 hours |
| **Week 3** | Webhook handler, database integration | 4 hours |
| **Week 3** | Testing: 10-20 test scenes | 4 hours |
| **Week 3** | Error handling, retry logic, monitoring | 4 hours |
| **Week 4** | Production deployment, documentation | 4 hours |
| **Total** | | **~38 hours (2 weeks part-time)** |

---

## 10. Monitoring & Observability

```javascript
// Key metrics to track
const metrics = {
  heygen_api_calls_total: 0,        // Counter
  heygen_api_errors_total: 0,       // Counter  
  scene_generation_duration_ms: [], // Histogram
  queue_depth: 0,                   // Gauge
  credits_remaining: 0,             // Gauge
  video_generation_success_rate: 0, // Ratio
};
```

### Alerting Rules
- Credit balance < $10 → Alert admin
- Video failure rate > 10% → Investigate
- Queue depth > 20 → Scale warning
- Average generation time > 10 min → Performance degradation

---

**Sources:**
- HeyGen V3 API Quick Start: https://developers.heygen.com/docs/quick-start
- HeyGen Skills Repo: https://github.com/heygen-com/skills
- AutoGPT Integration Guide: https://autogpt.net/what-is-the-heygen-api-and-why-should-you-care/
