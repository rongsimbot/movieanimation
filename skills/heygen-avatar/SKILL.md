# HeyGen Avatar Skill

## Purpose
Programmatic HeyGen API integration for MovieAnimation.ai: Luma scene + ElevenLabs audio → avatar video generation. Custom-built for the MovieAnimation cinematic pipeline.

## Architecture

```
skills/heygen-avatar/
├── SKILL.md                   # This file
├── client.js                  # Base API client (fetch wrapper)
├── avatar-manager.js          # Avatar CRUD operations
├── scene-generator.js         # End-to-end pipeline orchestrator
├── batch-processor.js         # BullMQ queue manager (max 3 concurrent)
├── index.js                   # Main export
└── utils/
    ├── asset-uploader.js      # Asset upload with retry/validation
    └── poller.js              # Async polling with exponential backoff
```

## Prerequisites

- **HeyGen API key** (`HEYGEN_API_KEY`)
- **ElevenLabs API key** (`ELEVENLABS_API_KEY`)
- **PostgreSQL** (for avatar/asset/video tracking)
- **Redis** (for BullMQ job queue)

## Quick Start

```javascript
const { HeyGenClient, AvatarManager, SceneGenerator, BatchProcessor } = require('./skills/heygen-avatar');

// Initialize
const client = new HeyGenClient({ apiKey: process.env.HEYGEN_API_KEY });
const avatars = new AvatarManager(client);
const sceneGen = new SceneGenerator(client, process.env.ELEVENLABS_API_KEY);
const batch = new BatchProcessor(sceneGen, { concurrency: 3 });

// Create avatars once
await avatars.createPhotoAvatar('Ben', 'https://assets/ben-headshot.png');
await avatars.createPhotoAvatar('Sarah', 'https://assets/sarah-headshot.png');

// Generate a scene
const result = await sceneGen.generateScene({
  avatarId: 'look_ben_default',
  voiceId: 'elevenlabs_ben_voice_id',
  dialogue: "I've been waiting for you. Have a seat.",
  backgroundAssetUrl: 'https://luma-scenes/diner_noir.mp4',
  sceneDescription: 'Ben at diner counter, noir lighting',
  webhookUrl: 'https://movieanimation.ai/api/webhooks/heygen'
});
```

## API Workflow

```
1. Create Photo Avatars (once)   → POST /v3/avatars
2. Generate ElevenLabs Audio      → ElevenLabs TTS API
3. Upload Assets to HeyGen        → POST /v3/assets (background + audio)
4. Generate Video                 → POST /v3/video-agents
5. Poll/Webhook for Completion    → GET /v3/videos/{id}
6. Download Final MP4            → Save to storage
```

## Integration Points

### Express Routes
- `POST /scenes/generate` — Single scene generation
- `POST /movies/generate` — Batch movie generation
- `GET /scenes/:id/status` — Check scene status
- `POST /webhooks/heygen` — Async completion callback

### Database Tables
- `heygen_avatars` — Created avatars (reused across scenes)
- `heygen_assets` — Uploaded backgrounds and audio
- `heygen_videos` — Generated video tracking

## Error Handling

| Scenario | Strategy |
|----------|----------|
| Asset upload failed | Retry 3x with exponential backoff |
| Video generation failed | Log failure, retry with adjusted prompt |
| Rate limit (429) | Respect Retry-After header |
| Concurrent limit hit | Queue throttles to max 3 |
| Credit depletion | Alert admin, pause queue |
| Video URL expired | Re-fetch via video_id |

## Environment Variables

```bash
HEYGEN_API_KEY=sk_live_xxx
HEYGEN_BASE_URL=https://api.heygen.com/v3
ELEVENLABS_API_KEY=sk_xxx
```
