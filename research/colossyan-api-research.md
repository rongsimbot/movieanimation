# Colossyan Interactive Avatar API — Research Report

**Date:** 2026-06-03  
**Researcher:** SimAnalyst  
**Project:** MovieAnimation.ai — Multi-API Video Platform  
**Trello Card:** [Research] Colossyan Interactive Features API (`69d40922a471d4e1dfae33e4`)  
**Status:** ✅ COMPLETE  

---

## Executive Summary

**Colossyan is NOT a viable option for MovieAnimation.ai's interactive/real-time avatar requirements at this time.** The platform is a text-to-video generator purpose-built for corporate L&D and training — not a real-time interactive avatar platform. Its "Conversational Avatars" feature is in early beta with a waitlist-only access model, and even the existing API is limited to pre-rendered video generation with no streaming or interactive capabilities.

However, Colossyan is an excellent reference for L&D-specific features (SCORM export, branching scenarios, in-video quizzes) that MovieAnimation.ai could emulate in future phases targeting the corporate training market.

**Verdict:** ❌ **NOT VIABLE** for Phase 1-3 interactive avatar needs. Worth revisiting in 6-12 months if Conversational Avatars exits beta with a real API.

---

## 1. Company Profile

| Attribute | Detail |
|-----------|--------|
| **Founded** | 2020 |
| **Headquarters** | Budapest, Hungary |
| **CEO** | Dominik Kovacs |
| **G2 Rating** | 4.8/5 (450+ reviews) |
| **Target Market** | Corporate L&D, HR training, compliance video |
| **Positioning** | "AI video platform for workplace learning" |
| **Key Differentiator** | Training-first features: SCORM, branching, quizzes, multi-avatar scenes |

---

## 2. Platform Type: Pre-Rendered, NOT Real-Time

### Critical Distinction

| Capability | Colossyan | HeyGen | D-ID | Synthesia |
|-----------|-----------|--------|------|-----------|
| **Pre-rendered video** | ✅ Core product | ✅ | ✅ | ✅ |
| **Real-time streaming** | 🧪 Beta waitlist | ❌ | ✅ (Agents) | ❌ |
| **Interactive branching** | ✅ (pre-rendered) | ❌ | ❌ | ✅ (basic) |
| **Live conversation** | 🧪 Beta waitlist | ❌ | ✅ (Agents) | ❌ |
| **SCORM export** | ✅ Enterprise | ❌ | ❌ | ✅ |
| **In-video quizzes** | ✅ | ❌ | ❌ | ✅ |

**Colossyan's "interactive" means branching pre-rendered video paths and quizzes — not live avatar conversation.** The Conversational Avatars beta product (waitlist-only) is their first step toward real-time, but it's not generally available and has no public API.

---

## 3. API Architecture

### 3.1 Overview

| Attribute | Detail |
|-----------|--------|
| **API Type** | REST (JSON request/response) |
| **Base URL** | `https://app.colossyan.com/api/v1` |
| **Authentication** | Bearer token (API key) |
| **Documentation** | docs.colossyan.com (GitBook-based, OpenAPI) |
| **Callbacks/Webhooks** | ✅ Supported for video completion notifications |
| **SDKs** | None official (JS fetch examples in docs) |
| **Rate Limits** | Not publicly documented |

### 3.2 Key API Endpoints

```
POST   /api/v1/video-generation-jobs              → Create video generation job
POST   /api/v1/video-generation-jobs/template-jobs → Generate from template
GET    /api/v1/video-generation-jobs/{videoId}     → Check job status/progress
DELETE /api/v1/video-generation-jobs/{videoId}     → Cancel job
GET    /api/v1/generated-videos/{videoId}          → Retrieve rendered video URL
POST   /api/v1/assets/actors                      → Create instant avatar
GET    /api/v1/assets/actors                       → List available avatars
```

### 3.3 Video Generation Flow

```
1. Build job descriptor JSON (scenes, actors, text, positions, sizes)
2. POST to /video-generation-jobs → receive { id, videoId }
3. Poll GET /video-generation-jobs/{videoId} for status
4. Once status = "finished", GET /generated-videos/{videoId}
5. Receive video download URL
```

### 3.4 Template Export Workflow

Colossyan's editor allows exporting scene configuration as JSON, which can be programmatically customized (replacing actor text, names, etc.) and submitted via the template-jobs endpoint. This is their recommended production workflow.

### 3.5 Avatar Creation via API

```json
POST /api/v1/assets/actors
{
  "displayName": "My Avatar",
  "sourceFileUrl": "https://example.com/photo.jpg",
  "gender": "Male"
}
// Returns: { "name": "avatar-id" }
```

Avatars created via API can be used immediately in video generation jobs.

---

## 4. Interactive Features Analysis

### 4.1 Current Production Features (Non-API)

These features exist in the Colossyan Studio editor but are **NOT accessible via API**:

- **Branching scenarios**: Choose-your-own-path video flows (pre-rendered branches)
- **Action buttons**: In-video clickable CTAs (URLs, scene navigation)
- **Quizzes & knowledge checks**: In-video assessment with completion tracking
- **SCORM export**: Full LMS integration for tracking
- **Multi-avatar conversations**: Up to 4 AI avatars in one scene
- **Interactive training**: Scenario-based role-play (pre-scripted, not live)

### 4.2 Conversational Avatars (Beta — Waitlist Only)

| Attribute | Detail |
|-----------|--------|
| **Status** | 🧪 Early Access Beta |
| **Access** | Waitlist (conversational-avatar.colossyan.com) |
| **API Available** | ❌ No |
| **Pricing** | Undisclosed (Enterprise-only, likely) |
| **Capabilities** | Real-time avatar responses, persona configuration, link/embed sharing |
| **Target Use Case** | Soft skills training role-play |
| **Availability Timeline** | Unknown — "gradual rollout" |

**The Conversational Avatars beta does not have:**
- A public API
- Developer documentation
- Streaming/WebRTC endpoints
- Custom LLM integration
- SDK support
- Known pricing

### 4.3 Comparison: Real-Time Interactive Platforms

| Feature | Colossyan (Beta) | D-ID Agents | Anam.ai | HeyGen Interactive |
|---------|-----------------|-------------|---------|-------------------|
| **Availability** | Waitlist | GA | GA | ❌ |
| **API** | ❌ | ✅ REST | ✅ SDK/API | ❌ |
| **WebRTC Streaming** | Unknown | ✅ | ✅ (400-1200ms) | ❌ |
| **Custom LLM** | Unknown | ❌ | ✅ | ❌ |
| **Pricing** | Unknown | Usage-based | Custom | N/A |

---

## 5. Pricing Analysis

### 5.1 Plan Tiers (June 2026)

| Plan | Price (annual) | Video Minutes | API Access | Interactive Features |
|------|---------------|---------------|------------|---------------------|
| **Free** | $0 | 3 min NEO 1 | ❌ | ❌ |
| **Starter** | $19/mo | 15 min/mo NEO 1 | ❌ | ❌ |
| **Business** | $70/mo | Unlimited NEO 1 + 10 min/mo NEO 2 | 360 min/year (add-on) | 4 interactive videos/mo |
| **Enterprise** | Custom | Unlimited NEO 1 + Unlimited NEO 2 | Custom | Unlimited + Conversational Beta |

### 5.2 API Pricing Details

- **API access** is listed as "Add-on" on the Business plan (360 minutes/year included)
- Enterprise gets custom API minutes
- API minutes are counted against the same video minute pool
- No separate API credit system; just video generation minutes

### 5.3 Cost Comparison per Minute

| Platform | Cheapest Plan | Minutes | Cost/Minute |
|----------|--------------|---------|-------------|
| **D-ID** | $5.99/mo | 10 min | $0.60 |
| **Colossyan** | $19/mo | 15 min | $1.27 |
| **Elai** | $23/mo | 15 min | $1.53 |
| **HeyGen** | $24/mo | 15 min | $1.60 |
| **Synthesia** | $22/mo | 10 min | $2.20 |

Colossyan offers the second-best entry-level price per minute after D-ID.

---

## 6. Comparison: Colossyan vs. HeyGen vs. D-ID vs. Synthesia

### 6.1 Interactive/Real-Time Capabilities

| Capability | Colossyan | HeyGen | D-ID | Synthesia |
|-----------|-----------|--------|------|-----------|
| **Real-time streaming** | 🧪 Beta | ❌ | ✅ (Agents) | ❌ |
| **Interactive branching** | ✅ | ❌ | ❌ | ✅ |
| **Live conversation API** | ❌ | ❌ | ✅ | ❌ |
| **Pre-rendered video API** | ✅ | ✅ | ✅ | ✅ |
| **SCORM/LMS integration** | ✅ Enterprise | ❌ | ❌ | ✅ |
| **In-video quizzes** | ✅ | ❌ | ❌ | ✅ |

### 6.2 API Maturity

| Criterion | Colossyan | HeyGen | D-ID | Synthesia |
|-----------|-----------|--------|------|-----------|
| **API Version** | v1 | v3 (v2 sunset Oct 2026) | v1 | v2 |
| **Documentation Quality** | Good | Good | Excellent | Good |
| **SDKs** | ❌ | ❌ | ✅ (Python, Node) | ❌ |
| **Webhooks** | ✅ | ✅ | ✅ | ✅ |
| **Sandbox/Test Env** | ❌ | ❌ | ✅ | ❌ |
| **OpenAPI Spec** | ✅ | ✅ | ✅ | ✅ |
| **Developer Focus** | Low | Medium | High | Medium |

### 6.3 Avatar Quality

| Platform | Stock Avatars | Custom Avatars | Realism Rating |
|----------|--------------|----------------|---------------|
| **HeyGen** | 200+ | Instant (2-min video) | ⭐⭐⭐⭐⭐ |
| **Synthesia** | 230+ | Studio (professional shoot) | ⭐⭐⭐⭐⭐ |
| **Colossyan** | 200+ (Enterprise) | Instant (20-sec video/photo) | ⭐⭐⭐⭐ |
| **D-ID** | Limited | Photo upload | ⭐⭐⭐ |

### 6.4 Use Case Alignment

| Use Case | Best Fit | Runner-Up |
|----------|----------|-----------|
| **Corporate L&D/Training** | Colossyan | Synthesia |
| **Marketing/UGC Videos** | HeyGen | D-ID |
| **Developer API Integration** | D-ID | HeyGen |
| **Enterprise Communications** | Synthesia | HeyGen |
| **Real-Time Interactive Agents** | D-ID | N/A (Anam.ai) |
| **Budget Projects** | D-ID ($5.99/mo) | Colossyan ($19/mo) |

---

## 7. Integration Feasibility for MovieAnimation.ai

### 7.1 What's Possible TODAY with Colossyan API

✅ Pre-rendered talking-head videos from text scripts  
✅ Programmatic avatar creation from photo/video  
✅ Template-based video generation at scale  
✅ Multi-language video generation (80+ languages)  
✅ Multiple avatars per scene (up to 4)  
✅ Callback/webhook notifications on completion  

### 7.2 What's NOT Possible

❌ Real-time avatar streaming  
❌ Live conversation/interaction  
❌ WebRTC or low-latency delivery  
❌ Custom LLM integration with avatar  
❌ Interactive branching via API  
❌ Quiz/assessment generation via API  
❌ SCORM export via API  
❌ Streaming to end-user browser  

### 7.3 Phase Applicability

| Phase | Feasibility | Rationale |
|-------|------------|-----------|
| **Phase 1 (MVP)** | ❌ Not applicable | No interactive/real-time capabilities; pre-rendered only |
| **Phase 2** | ⚠️ Limited | Only useful if adding corporate training templates as a product line |
| **Phase 3 (Enterprise)** | ⚠️ Monitor | Worth revisiting if Conversational Avatars exits beta with API |

### 7.4 Integration Effort (if pursued for training video generation)

- **Authentication**: Simple Bearer token
- **Video generation**: ~1 day (standard REST flow, polling pattern)
- **Template workflow**: ~2 days (export from Studio, customize, submit)
- **Avatar creation**: ~1 day (straightforward POST endpoint)
- **Total MVP integration**: ~3-5 engineering days

---

## 8. Recommendation: SKIP for Now, Monitor Conversational Avatars

### 8.1 Why Skip

1. **Core platform is pre-rendered video, not interactive avatars** — fundamental mismatch with MovieAnimation.ai's real-time requirements
2. **Conversational Avatars beta has NO public API** — waitlist-only, pricing unknown, timeline unclear
3. **Interactive features (branching, quizzes) are editor-only** — not accessible via API
4. **Better alternatives exist for every use case:**
   - Real-time interactive: D-ID Agents (GA with API)
   - Pre-rendered quality: HeyGen (already integrated), Synthesia
   - Budget: D-ID ($5.99/mo)
   - Training/L&D (if needed): Synthesia offers similar features with better API

### 8.2 What to Monitor

- **Conversational Avatars public launch** (sign up for waitlist at conversational-avatar.colossyan.com)
- **API expansion** for interactive features (branching, quizzes via API)
- **Pricing disclosure** for conversational sessions
- **WebRTC/SDK** availability for embedding

### 8.3 Recommendation Checklist

- [x] Research Colossyan API capabilities
- [x] Compare with HeyGen, D-ID, Synthesia
- [x] Evaluate interactive/real-time features
- [x] Analyze pricing and feasibility
- [ ] **Sign up for Conversational Avatars waitlist** (optional, for monitoring)
- [ ] **Re-evaluate in Q4 2026** if beta becomes GA with API
- [ ] **Consider for training/L&D product line** if MovieAnimation.ai expands into corporate training

---

## 9. Sources

| Source | URL | Date Accessed |
|--------|-----|---------------|
| Colossyan API Docs | https://docs.colossyan.com/ | 2026-06-03 |
| Colossyan API Landing | https://www.colossyan.com/api/ | 2026-06-03 |
| Colossyan Pricing | https://www.colossyan.com/pricing | 2026-06-03 |
| Conversational Avatars Waitlist | https://conversational-avatar.colossyan.com/ | 2026-06-03 |
| API Quickstart | https://docs.colossyan.com/getting-started/quickstart | 2026-06-03 |
| Avatar Creation API | https://docs.colossyan.com/avatar-creation/create-avatar | 2026-06-03 |
| Anam vs Colossyan Comparison | https://anam.ai/blog/anam-vs-colossyan-comparing-next-gen-ai-avatar | 2026-06-03 |
| VIDEOAI.ME 4-Way Comparison | https://videoai.me/blog/d-id-vs-heygen-vs-synthesia-vs-colossyan-comparison-2026 | 2026-06-03 |
| Apidog Top 10 Avatar APIs | https://apidog.com/blog/ai-talking-avatar-api/ | 2026-06-03 |
| Colossyan Review (CheckThat) | https://checkthat.ai/brands/colossyan | 2026-06-03 |

---

## 10. Quick Reference Card

```
COLOSSYAN AT A GLANCE
├── Type: Pre-rendered text-to-video (NOT real-time interactive)
├── API: REST, Bearer auth, OpenAPI spec
├── Base URL: https://app.colossyan.com/api/v1
├── Interactive: Branching+quizzes in editor only, NO real-time API
├── Conversational: BETA waitlist, no API, no pricing
├── Pricing: $19/mo Starter → $70/mo Business → Custom Enterprise
├── API Minutes: 360/year on Business (add-on)
├── Avatars: 200+ stock (Enterprise), instant custom via API
├── Languages: 80+ voices, 70+ languages
├── Best For: L&D training videos, compliance, onboarding
├── NOT For: Real-time interactive avatars, live conversation
└── Verdict: ❌ SKIP — Monitor Conversational Avatars beta
```
