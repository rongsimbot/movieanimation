# HeyGen Technical Capability Assessment for MovieAnimation.ai

**Date:** 2026-06-01  
**Researcher:** SimAnalyst  
**Status:** ✅ COMPLETE  

---

## Executive Summary

**HeyGen is a strong fit for MovieAnimation.ai's avatar animation pipeline.** Its V3 API supports programmatic photo avatar creation, custom video background upload, external audio lip-sync, and async video generation — all through REST endpoints. The key differentiator from D-ID is **native custom video background support**, eliminating the ffmpeg compositing step entirely.

**Verdict:** ✅ **VIABLE** — Recommended for Phase 2 integration. Can be used today for MVP with v2 API or migrated to v3 for long-term support.

---

## 1. API Architecture Overview

### API Versions
| Version | Status | Key Endpoints | Sunset Date |
|---------|--------|---------------|-------------|
| **v3** | ✅ Active (recommended) | `/v3/video-agents`, `/v3/avatars`, `/v3/assets`, `/v3/voices` | Current |
| **v2** | ⚠️ Legacy | `/v2/video/generate`, `/v2/avatars`, `/v2/voices` | Oct 31, 2026 |
| **v1** | ⚠️ Legacy | `/v1/video_status.get` | Oct 31, 2026 |

**Recommendation:** Build against v3 API from day one. v1/v2 endpoints will be deprecated by October 2026.

### Authentication
- **Header:** `X-Api-Key: <your-api-key>`
- **Base URL:** `https://api.heygen.com`
- **Key Generation:** Settings → API in HeyGen dashboard
- **API Wallet:** Separate from web plan credits — minimum $5 top-up

### Integration Paths
1. **Direct REST API** — Full programmatic control (what MovieAnimation needs)
2. **MCP (OAuth)** — For AI agents like Claude (uses web plan credits)
3. **Skills (CLI)** — Pre-built agent skills for Claude Code/Cursor/OpenClaw

---

## 2. Core Capabilities Assessment

### 2.1 Photo Avatar Creation (from uploaded photos)

**Endpoint:** `POST /v3/avatars` with `type: "photo"`

```bash
curl -X POST "https://api.heygen.com/v3/avatars" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "photo",
    "name": "Ben",
    "file": { "type": "url", "url": "https://example.com/ben-headshot.png" }
  }'
```

**Response:**
```json
{
  "data": {
    "avatar_group": {
      "id": "group_abc123",
      "name": "Ben",
      "status": "processing"
    }
  }
}
```

**Key Details:**
- ✅ Single photo → talking avatar (no video recording needed)
- ✅ Works with front-facing, angled, or profile images
- ✅ Supports lifelike AND stylized outputs
- ✅ Avatar IV model: realistic lip-sync, facial expressions, hand gestures
- ⚠️ Training time: 2-4 hours for digital twin, seconds for photo avatar
- ✅ Avatar persists for reuse across all videos
- ⚠️ Cost: $0.05/sec for Photo Avatar (Avatar IV model)

**MovieAnimation Fit:** ✅ Perfect — upload Ben/Sarah character photos once, reuse across all scenes.

### 2.2 Custom Video Background Upload

**Endpoint:** `POST /v3/assets` → then reference in generation

```bash
# Step 1: Upload Luma-generated background scene
curl -X POST "https://api.heygen.com/v3/assets" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -F "file=@luma_diner_scene.mp4"

# Response: { "data": { "asset_id": "asset_xyz789", "mime_type": "video/mp4" } }

# Step 2: Generate video with custom background
curl -X POST "https://api.heygen.com/v3/video-agents" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Ben speaking in a diner scene, casual tone, 90 seconds",
    "avatar_id": "look_ben_default",
    "files": [
      { "type": "asset_id", "asset_id": "asset_xyz789" }
    ]
  }'
```

**Key Details:**
- ✅ Upload MP4/WebM video as asset (max 32MB)
- ✅ Reference as background in video generation
- ✅ Also supports URL-based and Base64 file inputs
- ✅ Avatar appears naturally in custom background — NO COMPOSITING NEEDED

**MovieAnimation Fit:** ✅ CRITICAL — This is the killer feature. Luma generates the scene → upload as HeyGen background → avatar speaks in the scene. One API workflow, no ffmpeg.

### 2.3 Lip-Sync with External Audio (ElevenLabs)

**Approach:** Upload ElevenLabs-generated WAV/MP3 as asset, reference in generation.

```bash
# Step 1: Generate audio with ElevenLabs
# (done via ElevenLabs API, save as dialogue.wav)

# Step 2: Upload audio to HeyGen
curl -X POST "https://api.heygen.com/v3/assets" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -F "file=@ben_dialogue.wav"

# Step 3: Generate video with custom audio
curl -X POST "https://api.heygen.com/v3/video-agents" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Ben delivering lines with attached audio",
    "avatar_id": "look_ben_default",
    "files": [
      { "type": "asset_id", "asset_id": "asset_bg_scene" },
      { "type": "asset_id", "asset_id": "asset_ben_audio" }
    ]
  }'
```

**Alternative:** HeyGen has native ElevenLabs integration — paste your ElevenLabs API key in HeyGen settings. Voices then appear in the voice list and can be referenced by `voice_id`. However, for MovieAnimation the audio upload approach gives us more control over ElevenLabs voice parameters (stability, similarity, style).

**Key Details:**
- ✅ Upload WAV/MP3 via Assets API
- ✅ Audio drives lip-sync automatically
- ✅ Native ElevenLabs integration available (paste API key)
- ✅ ElevenLabs V3 voice model supported
- ⚠️ Audio must be uploaded first, referenced in generation

**MovieAnimation Fit:** ✅ Works — upload pre-generated ElevenLabs audio, HeyGen syncs lips.

### 2.4 Full-Body Animation Support

- ⚠️ Photo avatars are primarily head-and-shoulders/talking-head
- ✅ Digital Twin avatars (from video footage) support full-body
- ✅ Avatar IV model includes hand gestures and micro-expressions
- ⚠️ Full-body cinematic movement NOT available via API (still head-and-shoulders focused)

**MovieAnimation Fit:** ⚠️ Partial — good for dialogue scenes where avatar is in-frame talking. Not suitable for action sequences. For full-body cinematic animation, Audio2Face + Unreal Engine remains the long-term solution (Phase 3).

### 2.5 Multi-Language Dubbing

**Endpoint:** `POST /v3/video-translations`

- ✅ 175+ languages supported
- ✅ Lip-sync re-animation for target language
- ✅ Voice cloning preserves original speaker's tone
- ✅ Two modes: Speed ($0.0333/sec) and Precision ($0.0667/sec)

**MovieAnimation Fit:** ✅ Future feature — enable multi-language versions of movies automatically.

---

## 3. API Workflow: End-to-End Pipeline

### Complete MovieAnimation Scene Generation

```
┌─────────────────────────────────────────────────────────────┐
│ MOVIEANIMATION SCENE PIPELINE WITH HEYGEN                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  STEP 1: Generate Scene Background                           │
│  ┌──────────────────────────────────────┐                   │
│  │ Luma AI API                          │                   │
│  │ Prompt: "Film noir diner, 1950s..."  │                   │
│  │ Output: luma_scene_01.mp4            │                   │
│  └──────────────┬───────────────────────┘                   │
│                 ▼                                            │
│  STEP 2: Generate Character Audio                            │
│  ┌──────────────────────────────────────┐                   │
│  │ ElevenLabs API                       │                   │
│  │ Voice: Ben, Script: dialogue text    │                   │
│  │ Output: ben_dialogue_01.wav          │                   │
│  └──────────────┬───────────────────────┘                   │
│                 ▼                                            │
│  STEP 3: Upload Assets to HeyGen                             │
│  ┌──────────────────────────────────────┐                   │
│  │ POST /v3/assets (background)         │                   │
│  │ POST /v3/assets (audio)              │                   │
│  │ Returns: asset_bg, asset_audio       │                   │
│  └──────────────┬───────────────────────┘                   │
│                 ▼                                            │
│  STEP 4: Generate Video                                      │
│  ┌──────────────────────────────────────┐                   │
│  │ POST /v3/video-agents                │                   │
│  │ {                                    │                   │
│  │   "prompt": "Ben in diner...",       │                   │
│  │   "avatar_id": "look_ben_default",   │                   │
│  │   "files": [asset_bg, asset_audio]   │                   │
│  │ }                                    │                   │
│  └──────────────┬───────────────────────┘                   │
│                 ▼                                            │
│  STEP 5: Poll for Completion (or webhook)                    │
│  ┌──────────────────────────────────────┐                   │
│  │ GET /v3/videos/{video_id}            │                   │
│  │ Status: pending → processing → done  │                   │
│  │ Download: video_url → scene_01.mp4   │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
│  NO ffmpeg compositing needed! 🎉                            │
│  Total API calls per scene: 4-6                              │
│  Estimated time per scene: 3-5 minutes                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Critical Limitation: V3 Video Agent vs V2 Generate

The v3 Video Agent (`/v3/video-agents`) is prompt-based and AI-driven — it picks the avatar, writes the script, and handles everything. This is great for one-shot generation but gives less control over exact avatar placement and background compositing.

**For MovieAnimation's needs**, we may need to use the v2 `/v2/video/generate` endpoint for precise control (specifying exact background video, avatar position, etc.) while it's still available, then migrate to v3 equivalents as they mature.

The v2 endpoint supports explicit background configuration:
```json
{
  "background": {
    "type": "video",
    "url": "https://files.heygen.ai/assets/asset_xyz789.mp4"
  }
}
```

---

## 4. Technical Constraints & Limitations

| Constraint | Value | Impact on MovieAnimation |
|-----------|-------|--------------------------|
| **Max file upload** | 32 MB | Luma scenes may need compression |
| **Video generation speed** | 2-5 min for 30s clip | Acceptable for batch processing |
| **Concurrent renders** | 3 simultaneous | Queue management needed for 10+ scenes |
| **Max video length** | 20-30 min (Business) | 90-sec scenes well within limits |
| **API rate limits** | Plan-dependent | Scale plan handles 100 videos/month |
| **Resolution** | 1080p (standard), 4K (Business+) | 1080p sufficient for MVP |
| **Video URL expiry** | 7 days | Download and store immediately |
| **v1/v2 sunset** | Oct 31, 2026 | Build on v3 to avoid migration |
| **No free API credits** | Removed Feb 2026 | $5 minimum wallet required |

---

## 5. Demo Videos Review

### Product Demo: https://www.youtube.com/watch?v=_AEIze1zDxI
- Shows Avatar IV quality: realistic lip-sync, natural gestures
- Demonstrates photo-to-avatar workflow
- Multi-language dubbing showcase

### Tutorial (2026): https://www.youtube.com/watch?v=RTmlxuroR50
- Walkthrough of new AI Studio interface
- Custom background integration
- ElevenLabs voice connection
- Template-based video creation

---

## 6. Integration Complexity Assessment

| Integration Component | Complexity | Estimated Time |
|----------------------|------------|----------------|
| API Authentication | ⭐ Trivial | 30 min |
| Asset Upload (Backgrounds) | ⭐⭐ Easy | 1 hour |
| Photo Avatar Creation | ⭐⭐ Easy | 2 hours |
| Video Generation + Polling | ⭐⭐ Easy | 2 hours |
| Webhook Integration | ⭐⭐⭐ Medium | 3 hours |
| Error Handling & Retries | ⭐⭐⭐ Medium | 2 hours |
| Queue Management (3 concurrent) | ⭐⭐⭐ Medium | 3 hours |
| Node.js SDK/Client Wrapper | ⭐⭐ Easy | 3 hours |
| **Total Integration** | — | **~16 hours (2 days)** |

---

## 7. Node.js Integration Patterns

```javascript
// heygen-client.js — Proposed Node.js client for MovieAnimation

const HEYGEN_BASE = 'https://api.heygen.com/v3';

class HeyGenClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async uploadAsset(filePath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    const res = await fetch(`${HEYGEN_BASE}/assets`, {
      method: 'POST',
      headers: { 'X-Api-Key': this.apiKey, ...form.getHeaders() },
      body: form,
    });
    return (await res.json()).data.asset_id;
  }

  async createPhotoAvatar(name, imageUrl) {
    const res = await fetch(`${HEYGEN_BASE}/avatars`, {
      method: 'POST',
      headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'photo',
        name,
        file: { type: 'url', url: imageUrl }
      }),
    });
    return (await res.json()).data;
  }

  async generateVideo({ prompt, avatarId, assetIds }) {
    const res = await fetch(`${HEYGEN_BASE}/video-agents`, {
      method: 'POST',
      headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        avatar_id: avatarId,
        files: assetIds.map(id => ({ type: 'asset_id', asset_id: id }))
      }),
    });
    return (await res.json()).data; // { session_id, video_id, status }
  }

  async pollVideoStatus(videoId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const res = await fetch(`${HEYGEN_BASE}/videos/${videoId}`, {
        headers: { 'X-Api-Key': this.apiKey },
      });
      const { data } = await res.json();
      if (data.status === 'completed') return data;
      if (data.status === 'failed') throw new Error(data.failure_message);
      await new Promise(r => setTimeout(r, 10000));
    }
    throw new Error('Video generation timed out');
  }
}
```

---

**Sources:**
- HeyGen Developer Docs: https://developers.heygen.com/
- Avatar IV API Blog: https://www.heygen.com/blog/announcing-the-avatar-iv-api
- HeyGen Skills GitHub: https://github.com/heygen-com/skills
- ElevenLabs Integration: https://help.heygen.com/en/articles/8310663
- Pricing Analysis: Multiple sources (see Pricing Projection)
