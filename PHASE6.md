# Phase 6: Video Generation Integration

**Status:** ✅ Complete
**Date:** 2026-07-20
**Branch:** `phase6-video-integration`

## Overview

Phase 6 integrates the Sora Video Manager skill into the MovieAnimation.ai backend with a complete video generation pipeline: prompt engineering, smart API routing, character face injection, batch job queuing, progress tracking, and cost tracking.

## What Was Built

### 1. Database Migration (`migrations/006_phase6_video_integration.sql`)

New tables:
- **generation_jobs** — Full job tracking for video generation (status, progress, cost, retry, DLQ support)
- **cost_tracking** — Detailed per-generation cost records for billing
- **prompt_templates** — Pre-built cinematic prompt templates (6 seed templates: Cinematic Hero, Character Close-Up, Action Sequence, Establishing Shot, Anime Scene, Sci-Fi Environment)
- **webhook_logs** — External API callback logging

Schema enhancements:
- `video_clips` now references `generation_jobs`
- `scenes` gained `enhanced_prompt`, `prompt_style`, `character_images`, `preferred_api`, `fallback_api`, `estimated_cost`

### 2. Prompt Engineering Pipeline (`server/services/promptEngineer.ts`)

- **Scene Analysis** — Detects scene type (establishing/dialogue/action/closeup/transition) and motion level
- **Smart API Router** — Routes scenes to the optimal API based on analysis:
  - Sora → Close-ups with characters, hero shots
  - Runway → Action sequences (motion expertise)
  - Luma → Establishing shots, dialogue scenes
  - Seedance → Transitions, budget scenes
- **Prompt Enhancement** — Transforms raw scene descriptions into cinematic prompts using Gemini AI (with template fallbacks)
- **Character Face Injection** — Incorporates user-uploaded character photos into prompts
- **Batch Cost Estimation** — Pre-calculates costs for entire scene batches
- **Cost rates per API:**
  - Sora: $0.20/sec
  - Runway: $0.12/sec
  - Luma: $0.08/sec
  - Seedance: $0.05/sec

### 3. Sora Video Service (`server/services/soraVideoService.ts`)

Full integration with OpenAI Sora 2 API:
- Text-to-Video generation
- Image-to-Video generation (character reference photos)
- Status polling
- Video download with progress tracking
- Error categorization (rate_limit, content_policy, timeout, auth_error)
- Automatic fallback to direct API calls when shell scripts unavailable

### 4. Video Generation Orchestrator (`server/services/videoGenerationOrchestrator.ts`)

Coordinates the complete pipeline:
1. Fetch scene + character data
2. Analyze & enhance prompt
3. Smart route to best API
4. Inject character faces
5. Create DB job record
6. Execute generation (Sora or placeholder for other APIs)
7. Log API usage
8. Track costs
9. Poll for completion
10. Update scene status

Supports:
- Single scene generation
- Batch generation (with sequential processing to respect rate limits)
- Job cancellation
- Cost summaries per user/project
- Webhook integration for real-time progress updates

### 5. API Endpoints (in `server/index.cjs`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate/scene` | Generate video for a scene |
| POST | `/api/generate/batch` | Batch generate multiple scenes |
| GET | `/api/generation/:jobId/status` | Get job status/progress |
| POST | `/api/generation/:jobId/cancel` | Cancel a job |
| GET | `/api/projects/:projectId/jobs` | List all jobs for a project |
| GET | `/api/costs/summary` | Cost summary (per user/project) |
| POST | `/api/generation/webhook` | External API webhook receiver |
| POST | `/api/generate/analyze` | Preview prompt analysis |
| GET | `/api/prompt-templates` | List prompt templates |

### 6. Frontend Updates (`frontend/src/lib/api.ts`, `frontend/src/app/project/[id]/page.tsx`)

- **API Client:** Added methods for batch generate, prompt analysis, job management, cost summary, templates
- **Project Page:**
  - Batch Generate button with cost estimate
  - Jobs panel with real-time progress tracking
  - Per-scene API picker (Sora/Runway/Luma/Seedance)
  - Cost tracking display
  - Generation job list with status badges, progress bars, and error messages

## Integration Points

### Phase 4 (Redis/BullMQ)
The `generation_jobs` table is designed to be consumed by Phase 4 BullMQ workers:
- `priority` field for queue prioritization
- `status` field maps to BullMQ job states
- `retry_count` and `max_retries` for DLQ integration
- `error_category` for DLQ routing logic

### Phase 5 (Sora Skill)
The `soraVideoService.ts` directly invokes the `sora-video-manager` bash scripts:
- `generate_text_to_video.sh` → text-to-video generation
- `generate_image_to_video.sh` → image-to-video with character photos
- `check_status.sh` → polling
- `download_video.sh` → downloading completed videos

### Phase 7 (Video Assembly)
Generated scenes are stored in `data/generated/{project_id}/` with:
- `video_url` on each scene pointing to the generated clip
- `generation_status` tracking completion
- `enhanced_prompt` for re-generation if needed

### Phase 8 (Final Render)
The render pipeline can consume:
- Completed scenes with video URLs
- Cost tracking data for billing
- Job status data for render progress

## Testing

```bash
# Test generate scene (requires OPENAI_API_KEY)
curl -X POST http://localhost:8084/api/generate/scene \
  -H "Content-Type: application/json" \
  -d '{"scene_id": "<scene-uuid>", "api_choice": "sora"}'

# Test prompt analysis
curl -X POST http://localhost:8084/api/generate/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "scene_description": "A hero stands on a cliff at sunset",
    "scene_action": "The hero looks out over the ocean, wind billowing their cape",
    "mood": "dramatic",
    "style": "cinematic"
  }'

# Get job status
curl http://localhost:8084/api/generation/<job-uuid>/status
```

## Environment Variables Required

- `OPENAI_API_KEY` — For Sora 2 API access
- `GEMINI_API_KEY` — For AI-powered prompt enhancement (falls back to templates if unavailable)

## Files Created

```
migrations/006_phase6_video_integration.sql    — Database schema
server/services/promptEngineer.ts               — Prompt engineering & smart routing  
server/services/soraVideoService.ts             — Sora 2 API integration
server/services/videoGenerationOrchestrator.ts  — Full pipeline orchestrator
server/routes/generationRoutes.ts               — Express route definitions (TypeScript reference)
PHASE6.md                                       — This document
```

## Files Modified

```
server/index.cjs                                — Added all generation endpoints
frontend/src/lib/api.ts                         — Added generation client methods
frontend/src/app/project/[id]/page.tsx          — Batch gen, jobs panel, API picker
```
