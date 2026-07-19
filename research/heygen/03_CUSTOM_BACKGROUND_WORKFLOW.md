# Custom Background Workflow Documentation

**Date:** 2026-06-01  
**Researcher:** SimAnalyst  
**Topic:** Uploading Luma AI scenes as custom backgrounds in HeyGen for single-step avatar-in-scene generation

---

## Overview

The **killer feature** for MovieAnimation.ai: HeyGen supports custom video backgrounds natively through its Assets API. This means Luma AI-generated scenes can be uploaded directly and avatars appear naturally within them — **no ffmpeg compositing required**.

---

## Workflow: Step by Step

### Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Luma AI     │    │  ElevenLabs  │    │   HeyGen     │    │MovieAnimation│
│  Generate    │    │  Generate    │    │   Assets     │    │   Backend    │
│  Scene BG    │    │  Dialogue    │    │   Upload     │    │  Orchestrator│
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
  scene_01.mp4       dialogue_01.wav      asset_bg_id        Orchestrates
                                          asset_audio_id     full pipeline
       │                   │                   │                   │
       └───────────────────┴───────────────────┘                   │
                           │                                       │
                           ▼                                       │
                   ┌──────────────┐                                │
                   │   HeyGen     │                                │
                   │ Video Agent  │                                │
                   │  Generate    │                                │
                   └──────┬───────┘                                │
                          │                                        │
                          ▼                                        │
                    scene_01_final.mp4 ◄───────────────────────────┘
```

---

## Step 1: Upload Background Video (Luma Scene)

### Endpoint: `POST /v3/assets`

```bash
curl -X POST "https://api.heygen.com/v3/assets" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -F "file=@./luma_scenes/diner_noir_01.mp4"
```

### Response:
```json
{
  "data": {
    "asset_id": "asset_a1b2c3d4e5",
    "url": "https://files.heygen.ai/assets/asset_a1b2c3d4e5.mp4",
    "mime_type": "video/mp4",
    "size_bytes": 8388608
  }
}
```

### Constraints:
| Parameter | Limit |
|-----------|-------|
| Max file size | 32 MB |
| Supported video | MP4, WebM |
| Supported images | PNG, JPEG |
| Supported audio | MP3, WAV |

### Node.js Implementation:
```javascript
const FormData = require('form-data');
const fs = require('fs');

async function uploadBackground(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  
  const res = await fetch('https://api.heygen.com/v3/assets', {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.HEYGEN_API_KEY,
      ...form.getHeaders(),
    },
    body: form,
  });
  const { data } = await res.json();
  return data.asset_id; // e.g., "asset_a1b2c3d4e5"
}
```

---

## Step 2: Upload Dialogue Audio (ElevenLabs)

### Same endpoint, different file:

```bash
curl -X POST "https://api.heygen.com/v3/assets" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -F "file=@./audio/ben_dialogue_scene01.wav"
```

### Response:
```json
{
  "data": {
    "asset_id": "asset_f6g7h8i9j0",
    "url": "https://files.heygen.ai/assets/asset_f6g7h8i9j0.wav",
    "mime_type": "audio/wav",
    "size_bytes": 524288
  }
}
```

---

## Step 3: Generate Video with Custom Background + Audio

### Option A: V3 Video Agent (Recommended for simplicity)

```bash
curl -X POST "https://api.heygen.com/v3/video-agents" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Ben speaking naturally in a 1950s diner. He delivers his dialogue while sitting at the counter. Warm, cinematic lighting. 90 seconds.",
    "avatar_id": "look_ben_photo_01",
    "orientation": "landscape",
    "files": [
      { "type": "asset_id", "asset_id": "asset_a1b2c3d4e5" },
      { "type": "asset_id", "asset_id": "asset_f6g7h8i9j0" }
    ],
    "callback_url": "https://movieanimation.ai/api/webhooks/heygen"
  }'
```

### Option B: V2 Generate (For precise control — available until Oct 2026)

```bash
curl -X POST "https://api.heygen.com/v2/video/generate" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "video_inputs": [{
      "character": {
        "type": "avatar",
        "avatar_id": "look_ben_photo_01",
        "avatar_style": "normal"
      },
      "voice": {
        "type": "audio",
        "audio_url": "https://files.heygen.ai/assets/asset_f6g7h8i9j0.wav"
      },
      "background": {
        "type": "video",
        "url": "https://files.heygen.ai/assets/asset_a1b2c3d4e5.mp4"
      }
    }],
    "dimension": { "width": 1920, "height": 1080 }
  }'
```

---

## Step 4: Poll for Completion

```bash
# Get video status
curl -X GET "https://api.heygen.com/v3/videos/vid_xyz789" \
  -H "X-Api-Key: $HEYGEN_API_KEY"
```

### Status Lifecycle:
```
pending → processing → completed ✅
pending → processing → failed ❌
```

### Response (completed):
```json
{
  "data": {
    "id": "vid_xyz789",
    "status": "completed",
    "video_url": "https://files.heygen.ai/video/vid_xyz789.mp4",
    "thumbnail_url": "https://files.heygen.ai/thumb/vid_xyz789.jpg",
    "duration": 90.5,
    "created_at": 1711382400,
    "completed_at": 1711382680
  }
}
```

---

## Complete Node.js Pipeline

```javascript
// scene-generator.js — Complete MovieAnimation scene pipeline

const FormData = require('form-data');
const fs = require('fs');

class SceneGenerator {
  constructor(heygenKey, elevenlabsKey) {
    this.heygenKey = heygenKey;
    this.elevenlabsKey = elevenlabsKey;
    this.baseUrl = 'https://api.heygen.com/v3';
  }

  async generateScene({
    lumaSceneUrl,      // URL of Luma-generated background
    elevenlabsVoiceId,  // ElevenLabs voice ID (Ben/Sarah)
    dialogueText,       // Character's dialogue
    avatarId,           // HeyGen avatar look ID
    sceneDescription,   // Prompt describing the scene
    callbackUrl,        // Optional webhook URL
  }) {
    // Step 1: Generate audio with ElevenLabs
    const audioUrl = await this.generateElevenLabsAudio(elevenlabsVoiceId, dialogueText);
    
    // Step 2: Upload background to HeyGen
    const bgAssetId = await this.uploadHeyGenAsset(lumaSceneUrl, 'url');
    
    // Step 3: Upload audio to HeyGen
    const audioAssetId = await this.uploadHeyGenAsset(audioUrl, 'url');
    
    // Step 4: Generate video
    const session = await this.generateHeyGenVideo({
      prompt: sceneDescription,
      avatarId,
      assetIds: [bgAssetId, audioAssetId],
      callbackUrl,
    });
    
    // Step 5: Wait for completion (or use webhook)
    if (callbackUrl) {
      return { sessionId: session.session_id, status: 'queued' };
    }
    
    return await this.pollUntilComplete(session.video_id || session.session_id);
  }

  async generateElevenLabsAudio(voiceId, text) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.elevenlabsKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    // Save audio buffer and return URL or upload directly
    const buffer = await res.arrayBuffer();
    const tempPath = `/tmp/dialogue_${Date.now()}.wav`;
    fs.writeFileSync(tempPath, Buffer.from(buffer));
    return tempPath;
  }

  async uploadHeyGenAsset(source, type = 'file') {
    let form, res;
    
    if (type === 'file') {
      form = new FormData();
      form.append('file', fs.createReadStream(source));
      res = await fetch(`${this.baseUrl}/assets`, {
        method: 'POST',
        headers: { 'X-Api-Key': this.heygenKey, ...form.getHeaders() },
        body: form,
      });
    } else if (type === 'url') {
      // For URL sources, we can reference directly in generation
      // or download first then upload
      const downloadRes = await fetch(source);
      const buffer = await downloadRes.arrayBuffer();
      const tempPath = `/tmp/asset_${Date.now()}.mp4`;
      fs.writeFileSync(tempPath, Buffer.from(buffer));
      
      form = new FormData();
      form.append('file', fs.createReadStream(tempPath));
      res = await fetch(`${this.baseUrl}/assets`, {
        method: 'POST',
        headers: { 'X-Api-Key': this.heygenKey, ...form.getHeaders() },
        body: form,
      });
      fs.unlinkSync(tempPath);
    }

    const { data } = await res.json();
    return data.asset_id;
  }

  async generateHeyGenVideo({ prompt, avatarId, assetIds, callbackUrl }) {
    const body = {
      prompt,
      avatar_id: avatarId,
      files: assetIds.map(id => ({ type: 'asset_id', asset_id: id })),
      orientation: 'landscape',
    };
    if (callbackUrl) body.callback_url = callbackUrl;

    const res = await fetch(`${this.baseUrl}/video-agents`, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.heygenKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return (await res.json()).data;
  }

  async pollUntilComplete(sessionOrVideoId, isVideoId = false) {
    const maxAttempts = 60; // 10 minutes max
    const interval = 10000; // 10 seconds

    for (let i = 0; i < maxAttempts; i++) {
      // First get video_id from session if needed
      let videoId = isVideoId ? sessionOrVideoId : null;
      
      if (!isVideoId && !videoId) {
        const sessRes = await fetch(
          `${this.baseUrl}/video-agents/${sessionOrVideoId}`,
          { headers: { 'X-Api-Key': this.heygenKey } }
        );
        const sessData = (await sessRes.json()).data;
        videoId = sessData.video_id;
        if (!videoId) {
          await new Promise(r => setTimeout(r, interval));
          continue;
        }
      }

      const res = await fetch(`${this.baseUrl}/videos/${videoId}`, {
        headers: { 'X-Api-Key': this.heygenKey },
      });
      const { data } = await res.json();

      if (data.status === 'completed') {
        return {
          videoUrl: data.video_url,
          thumbnailUrl: data.thumbnail_url,
          duration: data.duration,
          status: 'completed',
        };
      }
      if (data.status === 'failed') {
        throw new Error(`HeyGen generation failed: ${data.failure_message}`);
      }

      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('Video generation timed out');
  }
}

module.exports = SceneGenerator;
```

---

## Key Design Decisions

### 1. V3 Video Agent vs V2 Generate
| Factor | V3 Video Agent | V2 Generate |
|--------|---------------|-------------|
| **Control** | AI-driven, less precise | Full parameter control |
| **Ease of use** | Single prompt | Detailed JSON config |
| **Background** | Via files array | Explicit `background` field |
| **Audio** | Via files array | Explicit `audio_url` field |
| **Longevity** | Future-proof | Sunset Oct 2026 |
| **Recommendation** | Use for MVP | Only if V3 lacks features |

**Decision:** Start with V3 Video Agent. If precise background/avatar positioning is needed, use V2 as fallback while monitoring V3 improvements.

### 2. Background Processing
- Luma scenes may be large (10-30MB for 90s)
- HeyGen 32MB limit is generous for 90-second scenes
- Consider pre-compressing Luma output to H.264 before upload
- HeyGen may further process/encode the uploaded video

### 3. Audio Sync Strategy
- **Pre-generated audio:** Full control over ElevenLabs parameters (stability, similarity, style exaggeration)
- **HeyGen native integration:** Simpler setup, less parameter control, uses HeyGen's ElevenLabs integration
- **Recommendation:** Pre-generate with ElevenLabs API for quality control, upload as asset

---

## Comparison: HeyGen vs D-ID Compositing

| Step | D-ID + ffmpeg | HeyGen Native |
|------|--------------|---------------|
| Generate scene | Luma API | Luma API |
| Generate audio | ElevenLabs | ElevenLabs |
| Avatar video | D-ID API (~10s) | — |
| Upload background | — | POST /v3/assets |
| Upload audio | — | POST /v3/assets |
| Composite | ffmpeg overlay (~5s) | — |
| Generate final | — | POST /v3/video-agents |
| **Total API calls** | 3 | 4-5 |
| **Post-processing** | ffmpeg required | None |
| **Quality risk** | Compositing artifacts | Native rendering |
| **Video duration** | 2 files to manage | 1 file output |

**HeyGen wins on:** Quality, simplicity, no compositing artifacts  
**D-ID wins on:** Cost ($0.15/min vs $2-3/min), speed

---

## Workflow Optimization Tips

1. **Pre-upload assets in batch** — Upload all Luma scenes at once before starting generation
2. **Use webhooks, not polling** — Reduces API calls and latency
3. **Queue management** — Max 3 concurrent renders; implement job queue for 10+ scenes
4. **Cache avatar IDs** — Create avatars once, store IDs in database
5. **Download immediately** — Video URLs expire after 7 days
6. **Handle failures gracefully** — Implement retry logic with exponential backoff
