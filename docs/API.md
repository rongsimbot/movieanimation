# MovieAnimation.ai — API Documentation
## v1.7.0 — Phase 12 Launch Prep

**Base URL:** `https://movieanimation.ai/api`
**Auth:** Bearer JWT token (obtained via `/api/auth/login`)
**Content-Type:** `application/json`

---

## Authentication

### POST /api/auth/register
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "Jane Doe"
}
```

**Response (201):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJI...",
  "user": { "id": 1, "email": "user@example.com", "name": "Jane Doe" }
}
```

**Validation:**
- Email: valid format required
- Password: min 8 chars, uppercase + lowercase + number
- Name: 2-100 characters

### POST /api/auth/login
Authenticate and receive JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJI...",
  "user": { "id": 1, "email": "user@example.com", "name": "Jane Doe" }
}
```

### GET /api/auth/me
Get current user profile. **Requires Auth.**

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "Jane Doe",
  "avatar_url": null,
  "created_at": "2026-05-21T00:00:00Z"
}
```

---

## Scripts & Scene Management

### POST /api/scripts
Create a new script. **Requires Auth.**

**Request:**
```json
{
  "project_id": 1,
  "title": "My Action Scene",
  "content": "INT. COFFEE SHOP - DAY\n\nSARAH sits alone at a corner table..."
}
```

### POST /api/scripts/:id/parse
AI-powered script parsing. Breaks script into scenes and characters.

**Response (200):**
```json
{
  "scenes": [
    { "scene_number": 1, "description": "...", "characters": ["SARAH"], "setting": "COFFEE SHOP - DAY" }
  ],
  "characters": ["SARAH", "BEN"]
}
```

### GET /api/scripts
List user's scripts. Supports query params: `?project_id=1&status=completed`

### GET /api/characters
List characters with optional search: `?search=sarah`

### POST /api/characters/:id/assign-image
Assign an uploaded image to a character for AI face injection.

**Request:**
```json
{
  "asset_id": 42
}
```

---

## Asset Management

### POST /api/assets/upload
Upload files (multipart/multi-file). Max 10 files, 50MB each.

**Form Data:** `files[]` — image/video/pdf/docx files

### GET /api/assets
Browse asset library. Filters: `?type=character_photo&project_id=1`

### GET /api/assets/:id/file
Download/stream an asset file.

---

## Video Generation (Phase 6)

### POST /api/videos/generate
Generate video from scene. **Requires Auth.**

**Request:**
```json
{
  "scene_id": 5,
  "api_preference": "auto",
  "quality": "high",
  "duration_seconds": 5
}
```

**API Selection Logic:**
- `auto` — Smart router selects best API based on scene complexity
- `sora` — Best quality, narrative scenes (hero shots)
- `runway` — Professional polish, camera movements
- `seedance` — Fast generation, social clips
- `luma` — Quick text-to-video

### POST /api/videos/generate-batch
Queue multiple scenes for generation.

**Request:**
```json
{
  "scene_ids": [1, 2, 3, 4, 5],
  "api_preference": "auto"
}
```

### GET /api/videos/progress/:jobId
Real-time generation progress via SSE. **Server-Sent Events.**

---

## Timeline & Assembly (Phase 7)

### POST /api/timelines
Create a new timeline.

**Request:**
```json
{
  "project_id": 1,
  "name": "My Movie Timeline"
}
```

### POST /api/timelines/:id/clips
Add a clip to the timeline.

**Request:**
```json
{
  "clip_id": 10,
  "position": 0,
  "transition": "dissolve",
  "transition_duration_ms": 500
}
```

**Transitions:** `cut`, `fade`, `dissolve`

### PUT /api/timelines/:id/clips/reorder
Reorder clips in timeline.

**Request:**
```json
{
  "clip_ids": [3, 1, 5, 2, 4]
}
```

### POST /api/timelines/:id/assemble
Start FFmpeg assembly of all clips.

**Response (202):**
```json
{
  "job_id": "assembly_abc123",
  "status": "queued"
}
```

### GET /api/timelines/:id/assembly-status
Check assembly progress.

---

## Export & Sharing (Phase 8)

### GET /api/exports/options
Get available export configurations. **Public.**

**Response:**
```json
{
  "resolutions": [
    { "value": "720p", "label": "HD 720p", "width": 1280, "height": 720 },
    { "value": "1080p", "label": "Full HD 1080p", "width": 1920, "height": 1080 },
    { "value": "4K", "label": "Ultra HD 4K", "width": 3840, "height": 2160 }
  ],
  "formats": [
    { "value": "mp4", "label": "MP4 (H.264)", "extension": ".mp4" },
    { "value": "mov", "label": "MOV", "extension": ".mov" },
    { "value": "webm", "label": "WebM (VP9)", "extension": ".webm" }
  ],
  "quality_options": [
    { "value": "fast", "label": "Fast (smaller file)" },
    { "value": "medium", "label": "Balanced" },
    { "value": "slow", "label": "Best Quality (slower)" }
  ]
}
```

### POST /api/exports
Create an export job. **Requires Auth.**

**Request:**
```json
{
  "source_timeline_id": 1,
  "resolution": "1080p",
  "format": "mp4",
  "quality": "slow",
  "bitrate_kbps": 8000
}
```

### GET /api/exports/:id/download
Download exported video file.

### POST /api/exports/:id/share
Create a shareable link.

**Request:**
```json
{
  "password": "optional-password",
  "max_downloads": 10,
  "expires_in_hours": 72
}
```

### GET /api/exports/share/:token
Public access to shared export (no auth required).

---

## Previews (Phase 5)

### POST /api/preview/clip/:clipId
Generate preview proxy video (240p-720p).

### GET /api/preview/clip/:clipId/thumbnail
Get clip thumbnail image.

### POST /api/preview/timeline/:id
Batch generate all timeline clip previews.

---

## Analytics (Phase 11)

### GET /api/analytics/usage
Platform usage stats (admin). **Requires Auth.**

**Response:**
```json
{
  "total_users": 2,
  "total_projects": 5,
  "total_generations": 12,
  "dau_last_7_days": [1, 2, 1, 3, 2, 2, 2],
  "mau": 2
}
```

### GET /api/analytics/costs
API cost breakdown by provider.

### GET /api/analytics/dau?days=30
Daily active users trend.

### POST /api/analytics/track
Track a custom event. **Fire-and-forget.**

---

## Health Check

### GET /api/health
System health and feature status. **Public.**

**Response:**
```json
{
  "status": "ok",
  "version": "1.7.0",
  "database": "connected",
  "apis": {
    "available": ["sora", "runway", "seedance", "luma"],
    "degraded": [],
    "unavailable": []
  },
  "apiKeys": [...]
}
```

---

## Rate Limits

| Endpoint | Window | Max Requests |
|----------|--------|-------------|
| `/api/auth/*` | 15 min | 5 |
| `/api/assets/upload` | 15 min | 10 |
| `/api/videos/*` | 15 min | 20 |
| All other `/api/*` | 15 min | 100 |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Error Codes

| Code | Type | Description |
|------|------|-------------|
| `VALIDATION` | 400 | Invalid input |
| `AUTH` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource |
| `RATE_LIMIT` | 429 | Too many requests |
| `INTERNAL` | 500 | Server error |

All errors include `requestId` for support reference:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION",
    "message": "Email is required",
    "requestId": "req_abc123"
  }
}
```

---

## Authentication Flow

1. `POST /api/auth/register` → Get JWT token
2. Include in all requests: `Authorization: Bearer <token>`
3. Token expires after 24h → Re-login required
4. `GET /api/auth/me` → Verify token validity

---

## SDK / Client Libraries

### JavaScript/TypeScript
```typescript
const API_URL = 'https://movieanimation.ai/api';

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });
  if (!res.ok) throw await res.json();
  return res.json();
}
```

---
**Last Updated:** 2026-05-23  
**Version:** 1.7.0
