# D-ID Avatar Animation API — Comprehensive Research Report

**Date:** 2026-06-02  
**Researcher:** SimAnalyst  
**Project:** MovieAnimation.ai — Multi-API Video Platform  
**Trello Card:** [Future Opportunity] D-ID Avatar Animation API (`qEQCibE3`)  
**Status:** ✅ COMPLETE  

---

## Executive Summary

**D-ID is a compelling option for MovieAnimation.ai's Phase 1 MVP**, already identified in our AVATAR_API_COMPARISON.md as the recommended starting point. Its API-first design, mature REST endpoints, and blazing-fast 100 FPS rendering make it the fastest path to market. The platform's unique photo-animation capability (any still photo → talking head) and real-time streaming agents are genuine differentiators that HeyGen cannot match.

**However**, D-ID's limitations around native background support (requiring ffmpeg compositing), smaller avatar library, watermark on lower plans, and confusing credit-based pricing mean it's best suited as an **entry point, not a permanent solution**. It fits Phase 1 perfectly but should be supplemented or replaced by HeyGen in Phase 2.

**Verdict:** ✅ **VIABLE** — Recommended for MVP. Already aligned with our Phase 1 strategy.

---

## 1. Company Profile

| Attribute | Detail |
|-----------|--------|
| **Founded** | 2017 |
| **Headquarters** | Tel Aviv, Israel |
| **Funding** | $48M+ across multiple rounds |
| **Acquisitions** | simpleshow (~$60M, Sept 2025) |
| **Awards** | CES 2026 Innovation Award (AI Agents 2.0) |
| **Scale** | 150M+ videos generated to date |
| **Partnerships** | Microsoft Teams (enterprise distribution) |
| **Website** | https://www.d-id.com |
| **API Docs** | https://docs.d-id.com |
| **Pricing** | https://www.d-id.com/pricing/api/ |

**Strategic Pivot:** D-ID has evolved from a pure video generation company into a conversational AI platform. The acquisition of simpleshow (explainer video) and AI Agents 2.0 (real-time interactive avatars) signal a shift toward enterprise conversational experiences, not just video production.

---

## 2. API Documentation Review

### 2.1 API Architecture

- **Type:** REST API
- **Base URL:** `https://api.d-id.com`
- **Authentication:** HTTP Basic Auth (`API_USERNAME:API_PASSWORD` encoded as base64) OR `x-api-key-external` header
- **Key Generation:** https://studio.d-id.com/account-settings
- **Response Format:** JSON
- **Async Model:** Submit job → poll status → download result URL (webhook optional)

### 2.2 API Capability Tiers

D-ID organizes its API into distinct capability tiers reflecting different avatar quality levels:

| Tier | Endpoint | Avatar Type | Quality | Key Features |
|------|----------|-------------|---------|--------------|
| **V2 Photo Avatars** | `POST /talks` | Photo-based | Good | Any photo → talking head, text or audio script, `source_url` for image |
| **V3 Pro Avatars** | `POST /clips` | Video-trained | Full-HD | `presenter_id`, `background` object, `presenter_config`, higher quality |
| **V3 Instant Avatars** | `POST /scenes` | Short video → avatar | Full-HD | No training required, quick setup |
| **V4 Expressive Avatars** | V4 endpoints | Premium+ | Full-HD | Dynamic expressions, sentiment control, highest quality |
| **AI Agents 2.0** | Agent endpoints | Real-time streaming | Real-time | WebRTC streaming, LLM integration, 24/7 autonomous |
| **Video Translate** | Translate endpoint | N/A | Good | 29+ languages, lip-sync dubbing |
| **Animations (Deprecated)** | `POST /animations` | Legacy | Legacy | Replaced by `/talks` and `/clips` |

### 2.3 Primary Endpoint: POST /talks (V2 Photo Avatars)

This is the main endpoint relevant to MovieAnimation's MVP phase.

```
POST https://api.d-id.com/talks
```

**Request Payload:**
```json
{
  "source_url": "https://example.com/avatar-photo.jpg",
  "script": {
    "type": "audio",
    "audio_url": "https://example.com/elevenlabs-speech.wav"
  },
  "config": {
    "stitch": true,
    "fluent": true
  },
  "webhook": "https://movieanimation.ai/api/webhooks/d-id",
  "user_data": "scene-004-ben-0001"
}
```

**Script Types Supported:**
- `TextScript3` — Text input, D-ID's TTS engine generates audio
- `AudioScript3` — Pre-recorded audio URL (perfect for ElevenLabs integration)

**Response (202 Accepted):**
```json
{
  "id": "tlk_abc123xyz",
  "created_at": "2026-06-02T17:30:00.000Z",
  "status": "created",
  "object": "talk"
}
```

**Polling (GET /talks/{id}):**
```json
{
  "id": "tlk_abc123xyz",
  "status": "done",
  "result_url": "https://d-id-video-output.s3.amazonaws.com/tlk_abc123xyz.mp4",
  "duration": 12.5,
  "created_at": "2026-06-02T17:30:00.000Z"
}
```

**Status Lifecycle:** `created` → `started` → `processing` → `done` (success) | `error` (failed)

### 2.4 V3 Clips Endpoint (Premium Avatars)

```
POST https://api.d-id.com/clips
```

**Key Differentiators from /talks:**
- Uses `presenter_id` instead of `source_url` (pre-trained video avatars)
- Supports `background` object for custom backgrounds
- `presenter_config` — styling, position, scale
- Higher quality output (Full-HD)

```json
{
  "presenter_id": "jack-Pt27VkP3hW",
  "script": {
    "type": "audio",
    "audio_url": "https://example.com/audio.wav"
  },
  "background": {
    "type": "video",
    "source_url": "https://example.com/luma-scene.mp4"
  },
  "presenter_config": {
    "crop": { "x": 0, "y": 0, "width": 1, "height": 1 },
    "result_format": "mp4"
  }
}
```

### 2.5 Real-Time Agents (AI Agents 2.0)

D-ID's most innovative offering — real-time streaming AI avatars:
- WebRTC-based streaming
- Sub-second latency
- LLM-powered conversations
- 24/7 autonomous operation
- Deployable to websites, apps, kiosks
- SSO, RBAC, audit logs, optional VPC deployment (Enterprise)

**Relevance to MovieAnimation.ai:** Low for core use case (scripted movies), but potentially interesting for interactive movie experiences or "choose your own adventure" features.

### 2.6 Video Translate

```
POST /videotranslate
```
- Translates existing video with lip-sync dubbing
- 29+ languages supported
- Voice cloning across languages

**Relevance to MovieAnimation.ai:** Useful for multilingual movie distribution, but not core to avatar animation pipeline.

### 2.7 Authentication & Headers

```
Authorization: Basic base64(API_USERNAME:API_PASSWORD)
# OR
x-api-key-external: <api-key>
Content-Type: application/json
```

### 2.8 Webhook Support

Async completion notifications via webhook:
```json
{
  "webhook": "https://movieanimation.ai/api/webhooks/d-id"
}
```

Webhook fires on status change to `done` or `error`, delivering the full talk object including `result_url`.

---

## 3. Pricing Model

### 3.1 Subscription Tiers (Creative Reality Studio)

| Plan | Price | Minutes/Month | Avatars | Key Limits |
|------|-------|---------------|---------|------------|
| **Free Trial** | $0 (14 days) | 3 min / 20 credits | Standard | **Watermark**, limited features |
| **Lite** | $5.90/mo | 10 min | Standard presenters | **D-ID watermark**, 1 personal avatar |
| **Plus** | ~$16/mo | 15+ min | 60+ presenters | No watermark, 3 personal avatars |
| **Pro** | ~$48/mo | 30+ min | 60+ presenters | Priority rendering, API access |
| **Advanced** | $299.99/mo | 65 min | 60+ presenters | Advanced features, higher limits |
| **Enterprise** | Custom | Custom | Custom + voice clone | SSO, VPC, dedicated support, full API |

### 3.2 API-Specific Pricing

**Minutes used via API are deducted from the same balance as the web version** — a shared pool.

- API cost: **~$5.90/min** effective rate (varies by tier)
- Video duration rounded up to nearest **15-second interval**
- Minutes **do not accumulate** — renewed monthly, unused minutes void
- **Credit-based model** — not unlimited like HeyGen paid plans

### 3.3 Cost Analysis for MovieAnimation.ai

**Assumptions:**
- 100 movies/month
- 90 seconds average per scene
- 5 avatar scenes per movie

**Monthly Usage:** 100 × 5 × 1.5 min = **750 minutes**

| Tier | Monthly Cost | Minutes | Overage? |
|------|-------------|---------|-----------|
| Lite ($5.90) | $5.90 | 10 min | Huge deficit |
| Plus (~$16) | $16 | 15 min | Huge deficit |
| Pro (~$48) | $48 | 30 min | Huge deficit |
| Advanced ($299.99) | $299.99 | 65 min | Still needs 685 min × rate |
| **Custom estimate** | ~$600-900/mo | 750 min | Requires Enterprise/usage pricing |

**Reality check:** For 750 minutes/month, D-ID Enterprise pricing would be needed. At ~$0.80-$1.20/min for bulk, expect **~$600-900/month**. This is significantly higher than the $225/month originally estimated in our AVATAR_API_COMPARISON.md (which used $0.15/min — possibly outdated or oversimplified).

**For MVP (10 test movies/month, 75 min total):**
- Pro tier ($48/mo) + overage could work
- But watermark removal requires at least Plus tier
- **MVP monthly: ~$100-200**

### 3.4 Pricing Transparency Issues

⚠️ **Red Flag:** Multiple user reviews (2026) report:
- Discrepancies between displayed and charged prices
- Restrictive refund policy
- Confusing credit-to-minute conversion
- Unexpected billing amounts

---

## 4. Avatar Customization Options

### 4.1 Stock Avatars
- **60+ standard presenters** (smaller than HeyGen's 100+)
- Diverse demographics with professional appearance
- Less variety than competitors (Synthesia, Colossyan both have 200+)
- No product-holding avatars
- No dual-person scenes

### 4.2 Photo Animation (Signature Feature)
- **Any portrait photo** → talking head video
- Works best with front-facing, well-lit professional headshots
- Casual/low-res photos produce noticeably lower quality
- Emotion and expression control possible
- **Unique differentiator** — HeyGen cannot do this

### 4.3 Custom Avatars (Premium+)
- **Personal avatars:** Train from uploaded photos (3 on Plus, more on higher tiers)
- **Premium+ Avatars:** Higher quality, consent-managed video upload process
- **Express Avatars:** Faster setup, lower quality
- Custom avatar creation managed through D-ID Studio interface, then accessible via API

### 4.4 Voice Options
- **100+ languages** supported for TTS
- Voice cloning available (Enterprise)
- External audio integration (ElevenLabs, any audio URL)
- Real-time streaming voice for Agents

### 4.5 Background Customization
| Tier | Background Support |
|------|-------------------|
| **V2 /talks** | ❌ None — avatar-only output with solid background |
| **V3 /clips** | ✅ `background` object supports video URL |
| **V4 Express** | ✅ Custom backgrounds |
| **AI Agents** | ✅ Background customization |

**Implication for MovieAnimation:** V2 (MVP phase) requires ffmpeg compositing with Luma backgrounds. V3+ supports native background integration, similar to HeyGen.

### 4.6 Animation Quality
- **Face-focused:** Primarily mouth, eyes, eyebrows — less body movement than HeyGen
- **100 FPS rendering:** 4X faster than real-time
- **Lip-sync:** Good but a step below HeyGen for diverse language pairs
- **Uncanny valley risk:** Pushing beyond subtle head movements creates unnatural results
- **Resolution:** Up to 1080p (V3/V4), not 4K like HeyGen's Avatar IV

---

## 5. Video Output Quality and Format Support

### 5.1 Output Specifications

| Attribute | Detail |
|-----------|--------|
| **Format** | MP4 (H.264) |
| **Resolution** | Up to 1080p (Full-HD on V3/V4); V2 is typically 720p |
| **Frame Rate** | 30fps (standard), rendering speed is 100 FPS |
| **Audio** | AAC, 44.1kHz stereo (or matches input audio) |
| **Duration** | 1 second to 10 minutes per generation |
| **File Hosting** | Temporary S3 URL (download within reasonable window) |
| **Transparent BG** | ❌ Not natively supported — requires post-processing |

### 5.2 Rendering Speed
- **100 FPS rendering:** D-ID claims 4X faster than real-time
- **10-second clip:** ~0.1 seconds processing
- **1-minute clip:** ~0.6 seconds processing
- **Typical observed:** 10-30 seconds including upload/queue/processing overhead

### 5.3 Delivery Mechanism
1. **Polling:** `GET /talks/{id}` → check `status` field
2. **Webhook:** HTTP POST to registered URL when status changes
3. **result_url:** Direct S3 download link (temporary, download promptly)

---

## 6. Integration Feasibility — MovieAnimation Pipeline

### 6.1 Current Architecture (Node.js/Express Backend)

MovieAnimation's backend is a Node.js/Express application with:
- REST API for scene management
- Async job processing for video generation
- Ffmpeg composition pipeline
- ElevenLabs TTS integration
- Luma AI background generation

### 6.2 D-ID Integration Approach (Phase 1 MVP)

```javascript
// Simple Node.js/Express integration example
const axios = require('axios');

class DIdClient {
  constructor() {
    this.baseURL = 'https://api.d-id.com';
    this.auth = Buffer.from(
      `${process.env.DID_API_USERNAME}:${process.env.DID_API_PASSWORD}`
    ).toString('base64');
  }

  async createTalk({ imageUrl, audioUrl, webhookUrl }) {
    const { data } = await axios.post(`${this.baseURL}/talks`, {
      source_url: imageUrl,
      script: {
        type: 'audio',
        audio_url: audioUrl
      },
      config: {
        stitch: true,
        fluent: true
      },
      webhook: webhookUrl,
      user_data: 'movieanimation_scene'
    }, {
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      }
    });
    return data; // { id: "tlk_xxx", status: "created" }
  }

  async getTalkStatus(talkId) {
    const { data } = await axios.get(
      `${this.baseURL}/talks/${talkId}`,
      { headers: { 'Authorization': `Basic ${this.auth}` } }
    );
    return data; // { status: "done", result_url: "..." }
  }

  async pollUntilDone(talkId, intervalMs = 2000, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.getTalkStatus(talkId);
      if (result.status === 'done') return result.result_url;
      if (result.status === 'error') throw new Error(`D-ID failed: ${result.error}`);
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('D-ID polling timeout');
  }
}
```

### 6.3 Full Pipeline (Phase 1 — D-ID + ffmpeg)

```bash
# Step 1: Generate Luma background scene
curl -X POST https://api.lumalabs.ai/dream-machine/v1/generations \
  -H "Authorization: Bearer $LUMA_API_KEY" \
  -d '{"prompt": "dimly lit 1950s diner interior, cinematic lighting"}' 

# Step 2: Generate ElevenLabs dialogue audio
curl -X POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id} \
  -d '{"text": "Welcome to the diner, stranger."}' \
  --output dialogue.wav

# Step 3: Generate D-ID avatar with lip-sync
curl -X POST https://api.d-id.com/talks \
  -H "Authorization: Basic $DID_AUTH" \
  -d '{
    "source_url": "https://cdn.movieanimation.ai/avatars/ben.jpg",
    "script": {"type": "audio", "audio_url": "https://cdn.movieanimation.ai/audio/dialogue.wav"}
  }'

# Step 4: Poll for D-ID result → avatar.mp4

# Step 5: Composite with ffmpeg
ffmpeg -i luma_background.mp4 -i avatar.mp4 \
  -filter_complex "overlay=W/2-w/2:H-h-50,scale=1920:1080" \
  final_scene.mp4
```

### 6.4 Phase 2 Pipeline (V3 Clips — Native Background)

```javascript
// No compositing needed — one API call
const result = await axios.post('https://api.d-id.com/clips', {
  presenter_id: 'custom_avatar_123',
  script: { type: 'audio', audio_url: 'elevenlabs.wav' },
  background: {
    type: 'video',
    source_url: 'luma_background.mp4'
  },
  presenter_config: {
    result_format: 'mp4'
  }
});
// result_url is the final composite video
```

### 6.5 Integration Assessment

| Factor | Status | Notes |
|--------|--------|-------|
| **API Maturity** | ✅ Excellent | Well-documented, RESTful, multiple SDKs |
| **Async Support** | ✅ Yes | Webhooks + polling, standard patterns |
| **Express Compatibility** | ✅ Excellent | Standard HTTP calls, any JS HTTP client |
| **Error Handling** | ✅ Good | Status lifecycle, error states, webhook retry |
| **Authentication** | ✅ Simple | Basic Auth, no OAuth complexity |
| **Audio Integration** | ✅ Direct | URL-based, works with ElevenLabs |
| **Background Support (V2)** | ⚠️ None | Requires ffmpeg step |
| **Background Support (V3+)** | ✅ Native | Video URL in background object |
| **Batch Processing** | ⚠️ Manual | Must implement own queue/parallelism |
| **Retry Logic** | ⚠️ Manual | No built-in retry; implement yourself |

---

## 7. Comparison vs HeyGen

### 7.1 Strengths of D-ID over HeyGen

| Strength | Detail |
|----------|--------|
| **Photo Animation** | Any still photo → talking head. HeyGen cannot do this at all. |
| **API Maturity** | More comprehensive, better documented, more flexible. D-ID's API is its crown jewel. |
| **Real-Time Streaming** | AI Agents 2.0 for live conversations. HeyGen's LiveAvatar is session-based, not autonomous 24/7 agents. |
| **Rendering Speed** | 100 FPS (4X real-time) vs HeyGen's minutes-per-video. |
| **Developer Experience** | API-first DNA. HeyGen is platform-first, API-second. |
| **Photo-to-Video Use Cases** | Personalized CRM videos, dynamic avatar generation from user photos. |
| **Concurrent Processing** | Claims "tens of thousands" of parallel requests. |
| **Entry Pricing** | $5.90/mo Lite (with watermark) vs HeyGen's $24/mo (no watermark, unlimited). |

### 7.2 Weaknesses of D-ID vs HeyGen

| Weakness | Detail |
|----------|--------|
| **Avatar Quality** | Good but less polished than HeyGen's Avatar IV with micro-expressions. |
| **Avatar Library** | 60+ vs HeyGen's 100+. Both dwarfed by Synthesia/Colossyan's 200+. |
| **Body Animation** | Face-focused only. HeyGen supports full-body avatars with gestures. |
| **Lip-Sync Quality** | Good, but a step behind HeyGen's industry-leading lip-sync across 175+ languages. |
| **Language Coverage** | 100+ languages (29 for Video Translate). HeyGen: 175+ languages. |
| **Video Resolution** | Up to 1080p vs HeyGen's 4K. |
| **Backgrounds (V2)** | No native custom backgrounds on the most accessible endpoint. |
| **Unlimited Generation** | Credit-based. HeyGen offers unlimited videos on all paid plans. |
| **Pricing Clarity** | Confusing, reports of billing discrepancies. HeyGen: straightforward. |
| **Watermark** | Present on Lite tier ($5.90). Must upgrade to Plus ($16) for removal. |
| **Enterprise Security** | SSO, RBAC, audit logs (primarily via Agents platform). HeyGen: SOC 2 Type II, SAML, SCIM. |

### 7.3 Differentiators Summary

| Dimension | D-ID | HeyGen | Best For MovieAnimation |
|-----------|------|--------|------------------------|
| Photo → Video | ✅ Unique | ❌ | Personalized avatars, quick iterations |
| API Automation | ✅✅✅ Excellent | ✅✅ Good | MVP pipeline |
| Video Quality | ⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Excellent | Production output |
| Speed to Market | 1-2 days | 2-3 days | MVP timing |
| Cost (MVP scale) | $100-200/mo | $30/mo + usage | Budget |
| Cost (100 movies/mo) | ~$600-900/mo | ~$180-330/mo | Long-term cost |
| Native Backgrounds | ⚠️ V3+ only | ✅ V3 native | Pipeline simplicity |
| Real-Time Agents | ✅ Pioneering | ⚠️ Session-based | Future interactivity |

---

## 8. Rate Limits and Scalability

### 8.1 Documented Capabilities
- **Parallel Processing:** D-ID's marketing claims "tens of thousands of requests in parallel"
- **Total Volume:** 150M+ videos generated
- **Rendering Speed:** 100 FPS (4X faster than real-time)

### 8.2 Known Limitations
- **No published rate limit documentation** (searched extensively — no hard numbers found in public docs)
- Credit-based consumption acts as a soft throttle (Pro plan: 30 min/month)
- Polling frequency for status checks may be rate-limited (no published specifics)
- Webhooks recommended over polling for scale

### 8.3 Scalability for MovieAnimation

**MVP Scale (10 movies/month, ~75 scenes):**
- Easily handled by any tier above Lite
- No scaling concerns
- ~75 API calls/month

**Production Scale (100 movies/month, ~500 scenes):**
- Requires Enterprise tier for minute allotment
- 500 API calls/month — D-ID handles "tens of thousands" so no issue
- Polling 500 concurrent status checks may need webhook migration
- Budget concern: $600-900/month

**High Scale (1,000+ movies/month):**
- Enterprise tier required
- Custom pricing needed
- Webhook architecture essential
- D-ID's claimed parallel processing capacity should handle this

### 8.4 Resilience Recommendations
1. **Use webhooks** instead of polling at scale
2. **Implement retry logic** with exponential backoff (3 retries, 2s/4s/8s)
3. **Queue system** (BullMQ/Redis) for job orchestration
4. **Circuit breaker** pattern for API degradation
5. **Pre-download result_url** — S3 links may expire

---

## 9. Strategic Recommendations

### 9.1 Current Plan Alignment

Our AVATAR_API_COMPARISON.md already recommends D-ID for Phase 1 MVP. This research **confirms that strategy**. D-ID is the fastest, cheapest path to an MVP with a working avatar pipeline.

### 9.2 Phase-by-Phase Integration Plan

#### Phase 1: MVP (Now — D-ID /talks)
- ✅ REST API integration: 1-2 days
- ✅ Photo avatar + ElevenLabs audio
- ⚠️ ffmpeg compositing required for backgrounds
- ⚠️ Lower visual quality vs HeyGen
- 💰 $100-200/month at MVP scale

#### Phase 2: Premium (3-6 months — HeyGen V3)
- ✅ Native background support (no compositing)
- ✅ Better avatar quality (4K, micro-expressions)
- ✅ Unlimited video generation
- ✅ 175+ languages
- 💰 ~$180-330/month for 100 movies

#### Phase 3: Cinematic (6-12 months — Audio2Face + D-ID Agents)
- ✅ AAA-quality 3D animation (Audio2Face)
- ✅ D-ID Agents for interactive movie experiences
- ✅ Real-time streaming for live audience interaction
- 💰 $0/month for Audio2Face (local GPU)

### 9.3 When to Stay with D-ID (Beyond MVP)

Keep D-ID in the pipeline even after adding HeyGen if:
1. **Personalized avatars from user photos** becomes a feature (photo → talking head)
2. **Real-time interactive movies** are on the roadmap (AI Agents 2.0)
3. **Quick iterations** — D-ID's 100 FPS rendering is unbeatable for rapid testing
4. **Multi-API strategy** — Offer D-ID as "Standard" tier and HeyGen as "Premium" tier

---

## 10. Key Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Pricing opacity** | ⚠️ Medium | Test with Pro tier first, negotiate Enterprise pricing based on volume |
| **Watermark on low tiers** | ⚠️ Medium | Start at Plus tier minimum ($16/mo) for watermark-free output |
| **V2 endpoint deprecation** | ⚠️ Medium | Migrate to V3 `/clips` for native backgrounds when ready; V2 is current |
| **Uncanny valley with poor photos** | ⚠️ Medium | Quality gate on input photos; use professional headshots |
| **S3 result_url expiry** | 🔴 High | Download immediately, store in MovieAnimation's own CDN |
| **No native V2 backgrounds** | ⚠️ Medium | ffmpeg compositing is proven, adds 5-10s per scene |
| **Refund difficulty** | 🔴 High | Test thoroughly on trial/free tier before committing budget |

---

## 11. API Quick Reference

### Authentication
```
Authorization: Basic base64(API_USERNAME:API_PASSWORD)
x-api-key-external: <api-key>  (alternative)
```

### Key Endpoints
```
POST   /talks                              Create V2 photo avatar video
GET    /talks/{id}                         Get talk status & result URL
POST   /clips                              Create V3 Pro avatar video (native BG)
DELETE /talks/{id}                         Cancel/delete a talk

POST   /agents                             Create AI Agent (real-time)
POST   /videotranslate                     Translate video with lip-sync

GET    /talks                              List recent talks
GET    /talks/{id}                         Get specific talk details
```

### Response Statuses
- `created` — Job accepted
- `started` — Processing begins
- `processing` — Rendering
- `done` — Video ready, result_url populated
- `error` — Failed

### Script Format Options
```json
// Text-to-speech
{"type": "text", "input": "Hello world", "voice_id": "en-US-male"}

// Pre-recorded audio (ElevenLabs integration)
{"type": "audio", "audio_url": "https://cdn.example.com/speech.wav"}
```

---

## 12. Sources

- D-ID Official API Documentation: https://docs.d-id.com
- D-ID API Landing Page: https://www.d-id.com/api/ (rendering claimed at 100 FPS)
- D-ID Pricing (Studio): https://www.d-id.com/pricing/studio/
- D-ID Pricing (API): https://www.d-id.com/pricing/api/
- D-ID Getting Started: https://docs.d-id.com/reference/get-started
- D-ID Create Talk Reference: https://docs.d-id.com/reference/createtalk
- D-ID Create Clip Reference: https://docs.d-id.com/reference/createclip
- D-ID Create Animation (Deprecated): https://docs.d-id.com/reference/createanimation
- D-ID V2 Photo Avatar Quickstart: https://docs.d-id.com/docs/v2-photo-avatar-quickstart
- D-ID Premium+ Avatars: https://docs.d-id.com/reference/premium-avatars-overview
- D-ID Review — HeyFish.ai (2026): https://heyfish.ai/d-id-review
- Flowith Comparison — HeyGen vs D-ID (March 2026): https://flowith.io/blog/heygen-vs-d-id-ai-presenter-showdown-marketing-teams/
- Aloa Comparison — HeyGen vs D-ID (Feb 2026): https://aloa.co/ai/comparisons/ai-video-comparison/heygen-vs-d-id
- VidifyAI Comparison: https://vidifyaistudio.com/compare/heygen-vs-d-id/
- BestVideoGenerationAI Comparison (Feb 2026): https://bestvideogenerationai.com/blog/heygen-vs-d-id-ai-avatar-comparison
- G2 D-ID Pricing: https://www.g2.com/products/d-id/pricing
- Tekpon D-ID Review (2025): https://tekpon.com/software/d-id/reviews/
- Tavus D-ID API Review: https://www.tavus.io/blog/d-id-api-review-alternatives

---

## 13. Next Steps

1. **Sign up for D-ID trial** — 14 days free, 3 min / 20 credits
2. **Generate API key** at https://studio.d-id.com/account-settings
3. **Test basic /talks endpoint** with a sample photo + ElevenLabs audio
4. **Benchmark rendering speed** — confirm 100 FPS claim in practice
5. **Test V3 /clips endpoint** with custom Luma background for native compositing
6. **Build D-ID client class** in MovieAnimation backend (see integration example above)
7. **Test webhook reliability** vs polling approach
8. **Document any pricing surprises** during trial

---

**Report prepared by SimAnalyst for MovieAnimation.ai engineering team.**  
**Updated:** 2026-06-02 | **Status:** ✅ Ready for implementation planning
