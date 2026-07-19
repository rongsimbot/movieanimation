# Synthesia Corporate/Training Tier API — Research Report

**Date:** 2026-06-02  
**Project:** MovieAnimation.ai  
**Phase:** Future Opportunity (Phase 3, 6-12 month horizon)  
**Current Status:** HeyGen integrated (Phase 1 MVP), D-ID researched (budget fallback)  
**Trello Card:** 🔬 "Research: Synthesia Corporate/Training Tier API"

---

## 1. Executive Summary

Synthesia is the market leader in enterprise AI video generation, valued at ~$4B and used by 50,000+ companies. Its Express-2 avatar engine (September 2025) added full-body gestures and micro-expressions, closing the realism gap with HeyGen's Avatar IV. Synthesia's differentiating strengths for MovieAnimation.ai are:

- **Enterprise-grade compliance**: SOC 2 Type II, GDPR, ISO 42001 certifications
- **Training/L&D specialization**: SCORM export, interactive quizzes, branching scenarios, 60+ LMS integrations
- **140+ languages with one-click translation**: Stronger localization pipeline than HeyGen
- **Predictable billing**: Video minutes (annual cap) vs HeyGen's premium credit system
- **Mature API**: REST API v2 with webhook events, SDK, OpenAPI spec

**Key trade-off**: Synthesia avatars look professional/polished but less hyper-realistic than HeyGen Avatar IV. Synthesia wins on enterprise tooling; HeyGen wins on avatar "wow factor."

---

## 2. Platform Overview

| Metric | Synthesia | HeyGen (comparison) | D-ID (comparison) |
|--------|-----------|---------------------|-------------------|
| **Valuation** | ~$4B | ~$1B+ | Private |
| **G2 Rating** | 4.7/5 (2,700+ reviews) | 4.8/5 (1,500+ reviews) | Niche |
| **Stock Avatars** | 240+ (Enterprise) | 700+ | Photo-to-video |
| **Languages** | 140+ | 175+ | 30+ |
| **Custom Avatars** | $1,000/year (Studio Express-1) | $99 one-time (Photo) / Studio add-on | Included on higher tiers |
| **API Access** | Creator plan ($89/mo) | Pay-as-you-go ($5 min) | Build plan ($14.40/mo) |
| **Compliance** | SOC 2, GDPR, ISO 42001 | SOC 2, GDPR | SOC 2, GDPR |
| **Rendering Speed** | ~1-2 min per 1-min video | ~2-3 min per 1-min video | ~30 sec per clip |
| **Max Video Length** | 50 scenes (~2.5 hours) | 30 min (Pro+) | 5 min per clip |

### Express-2 Avatars — Body Language & Realism

Released September 2025, Express-2 is Synthesia's next-gen avatar engine:

- **Full-body rendering** at **1080p / 30fps** with consistent identity
- **Natural co-speech gestures**: pointing, hand movements, micro-expressions (eyebrow raises, head turns, breathing patterns)
- **Script-aware body language**: avatars read the script context and adjust gestures (sad news → concerned expression; good news → smile)
- **Rendering time**: 7–10 minutes (vs 4–6 min for standard avatars)
- **Included on all paid plans** — no premium credit surcharge (unlike HeyGen Avatar IV at 20 credits/min)
- Marked with "E2" badge in the avatar picker

**MIT Technology Review (Sept 2025)**: "The avatars' body movements could be jerky and unnatural, their accents sometimes slipped... Now Synthesia's avatars have been updated with more natural mannerisms and movements."

**Key difference from HeyGen**: Synthesia Express-2 is subtler and more consistent. HeyGen Avatar IV gestures are more dynamic but burn credits fast. Synthesia gestures are included in plan price.

---

## 3. Pricing Tiers (as of June 2026)

| Feature | Free | Starter | Creator | Enterprise |
|---------|------|---------|---------|------------|
| **Monthly Price** | $0 | $29/mo ($22 annual) | $89/mo ($67 annual) | Custom |
| **Video Minutes** | 3 min/mo | 120 min/year | 360 min/year | Unlimited |
| **AI Avatars** | 9 | 125+ | 180+ | 240+ |
| **Personal Avatars** | — | 3 | 5 | Unlimited |
| **Studio Avatars (Express-1)** | — | $1,000/yr add-on | $1,000/yr add-on | Included/Add-on |
| **Languages** | Limited | 140+ | 140+ | 140+ |
| **API Access** | ❌ | ❌ | ✅ (360 min/yr) | ✅ (Unlimited) |
| **Brand Kits** | ❌ | ❌ | ✅ | ✅ |
| **Interactive Video/Quizzes** | ❌ | ❌ | ✅ | ✅ |
| **SCORM Export** | ❌ | ❌ | ❌ | ✅ |
| **1-Click Translation** | ❌ | ❌ | ❌ | ✅ |
| **SAML/SSO** | ❌ | ❌ | ❌ | ✅ |
| **Custom Fonts** | ❌ | ❌ | ✅ | ✅ |
| **Bulk Personalization** | ❌ | ❌ | ✅ | ✅ |
| **Multilingual Player** | ❌ | ❌ | ✅ | ✅ |
| **Ai Dubbing (Lip Sync)** | ❌ | Deducted from limit | Deducted from limit | Paid add-on |
| **Support** | AI chat | Regular | Priority | Priority + CSM |
| **Content Moderation** | Regular | Regular | Regular | Priority |

### Pricing Analysis for MovieAnimation.ai

**What makes sense for MovieAnimation?**

| Use Case | Recommended Tier | Annual Cost | Rationale |
|----------|-----------------|-------------|-----------|
| **Evaluation/Prototyping** | Creator ($67/mo annual) | ~$804/year | API access, 30 min/mo video, 180+ avatars, interactive video, brand kits |
| **Production (mid-volume)** | Enterprise (custom) | ~$20K–$100K+/year | Unlimited minutes, custom avatars, SCORM, 1-click translation, SSO, priority support |
| **High-volume corporate** | Enterprise + add-ons | Custom | Volume licensing, dedicated rendering queues |

**Cost Comparison: Synthesia vs HeyGen for 50 × 2-min Training Videos**

| Platform | Plan | Base Cost | Extra Costs | Total |
|----------|------|-----------|-------------|-------|
| Synthesia Creator | $89/mo | $95 (3 months) | $0 | **$95** |
| HeyGen Creator | $29/mo | $72 (3 months) | $312 (credit packs for Avatar IV + translation) | **$384** |
| Synthesia Enterprise | Custom | Negotiated | $0 | TBD |

*Source: BlogRecode.com real-world test, March 2026*

**Bottom line**: Synthesia is 3-4× cheaper for production-quality corporate training videos because everything is included—no credit system to burn through.

---

## 4. API Technical Details

### Authentication

- **Method**: API Key in `Authorization` header
- **Key Generation**: Settings → Integrations → API in Synthesia dashboard
- **Base URL**: `https://api.synthesia.io`
- **Upload Endpoint**: `https://upload.api.synthesia.io/v2`

### API Version & Format

- OpenAPI 3.0.2 specification available
- REST JSON API
- API v2 is the current version
- Generally Available (exited beta ~2 years ago)

### Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v2/videos` | POST | Create a video |
| `/v2/videos` | GET | List videos |
| `/v2/videos/{id}` | GET | Retrieve video + download URL |
| `/v2/videos/{id}` | PATCH | Update video metadata |
| `/v2/templates` | GET | List templates |
| `/v2/templates/{id}` | GET | Get template details |
| `/v2/videos/from-template` | POST | Create video from template with variables |
| `/v2/avatars` | GET | List available avatars |
| `/v2/voices` | GET | List available voices |
| `/v2/assets` | POST | Upload assets (images, video, audio) |
| `/v2/dubbing` | POST | Create dubbing project |

### Video Creation Flow

```
1. POST /v2/videos (JSON payload: script, avatar_id, template, background, variables)
2. → 201 Created (video_id + status: "queued")
3. Synthesia renders video (1-2 min per 1-min video)
4a. Poll GET /v2/videos/{id} → check status field
4b. OR configure webhook → POST to your endpoint with download URL
5. When status = "complete": time-limited MP4 download URL returned
```

### Code Example: Create a Video

```python
import requests

API_KEY = "your_api_key"
BASE_URL = "https://api.synthesia.io"

payload = {
    "title": "Employee Onboarding - Welcome",
    "description": "Welcome video for new hires",
    "visibility": "private",
    "test": False,
    "input": [
        {
            "scriptText": "Welcome to MovieAnimation.ai! We're excited to have you on the team.",
            "avatar": "anna_costume1_cameraA",
            "avatarSettings": {
                "style": "rectangular",
                "horizontalAlign": "center",
                "scale": 1.0,
                "voice": "en-US-professional-gen3-uuid"
            },
            "background": "white_meeting_room"
        }
    ]
}

response = requests.post(
    f"{BASE_URL}/v2/videos",
    json=payload,
    headers={"Authorization": API_KEY}
)

video = response.json()
print(f"Video ID: {video['id']}, Status: {video['status']}")
```

### Code Example: Video from Template (with Dynamic Variables)

```python
payload = {
    "templateId": "template-uuid-here",
    "title": "Personalized Product Demo for {{customer_name}}",
    "variables": {
        "customer_name": "Acme Corp",
        "rep_name": "Sarah Johnson",
        "product_name": "MovieAnimation Pro"
    },
    "callbackId": "acme-corp-deal-123",
    "test": False
}

response = requests.post(
    f"{BASE_URL}/v2/videos/from-template",
    json=payload,
    headers={"Authorization": API_KEY}
)
```

### Webhook Events

**Two event types supported:**

1. **`video.completed`** — Fired when rendering succeeds. Payload includes:
   - `id`: Video UUID
   - `status`: "complete"
   - `download`: Time-limited MP4 download URL
   - `duration`: Video duration
   - `captions`: SRT/VTT download URLs
   - `thumbnail`: Static + animated GIF URLs
   - `callbackId`: Your arbitrary metadata (e.g., customer email)
   - `createdAt`, `lastUpdatedAt`: Unix timestamps

2. **`video.failed`** — Fired when rendering fails. Payload includes:
   - `id`, `title`, `description`
   - `status`: "error"
   - `message`: Human-readable failure reason

**Webhook Signature Verification**: Synthesia provides a signature verification mechanism to ensure webhook authenticity.

### Rate Limits & Constraints

| Constraint | Creator | Enterprise |
|------------|---------|------------|
| **Concurrent Renders** | Not published (~3-5 discovered) | 10-50 (contracted) |
| **Script per Slide** | < 1,000 characters | < 1,000 characters |
| **Video Minutes Caps** | 360/year (via API) | Unlimited |
| **Re-renders** | Count against allowance | Contract-dependent |
| **429 Handling** | Exponential backoff required | Documented limits |

### Integration Complexity

**Rating: Moderate** (comparable to HeyGen, simpler than D-ID)

- REST API, well-documented with OpenAPI spec
- Python and Node.js SDKs available (unofficial community + official)
- Template + variable system is straightforward for personalization
- Webhook-based async workflow is production-ready
- Primary challenge: SCORM and 1-click translation locked behind Enterprise

---

## 5. Platform Features for Corporate Training

### LMS & eLearning Integrations (60+ native)

Native integrations with: Moodle, Docebo, TalentLMS, SAP Litmos, 360Learning, Articulate 360, Thinkific, Udemy, Kaltura, Lectora, Easygenerator, Coassemble, aNewSpring, eloomi, uQualio, Thought Industries, ETU, Eduflow, and many more.

**SCORM Export**: Enterprise-only. Critical for LMS compatibility. HeyGen offers SCORM at Business tier ($149/mo), making it more accessible for smaller deployments.

### Brand Kits

- Custom logos, color palettes, text styles, fonts
- Avatar clothing recoloring
- Enforced brand consistency across all workspace videos
- Available on Creator plan+

### Interactive Video Features (Creator plan+)

- **Quizzes**: Embedded assessment questions, viewer score tracking
- **Branching Scenarios**: Decision-path videos (e.g., compliance training with "what would you do?")
- **CTA Buttons**: Clickable call-to-action overlays
- **Interactive HTML5 Layers**: Embed forms, calendars, links within the video player
- This is a **major differentiator** vs HeyGen (which offers limited interactivity)

### Bulk Personalization

- Upload CSV/XLSX with variables (name, company, role, custom fields)
- Single template → hundreds of personalized videos
- Available on Creator plan+

### AI Video Assistant

- Built-in LLM (GPT-5 architecture) that converts URLs/documents to video scripts
- Auto-generates scene layouts
- PowerPoint-to-video converter (unique feature)

### Media Library

- Shutterstock + Getty Images + Pexels + Soundstripe + Icons8
- Veo 3.1 and Sora 2 integration: AI-generated b-roll (48 credits per 8-sec clip)
- Unlimited stock asset usage on paid plans

### Multilingual Capabilities

- 140+ languages for text-to-speech
- 1-click translation (Enterprise): auto-translate entire video, multiple languages at once
- AI Dubbing with lip sync: translate existing video into 130+ languages
- Multilingual Video Player: single embed, viewer picks language
- Voice cloning in multiple languages (Enterprise)

### Collaboration

- Commenting and review workflows on all paid plans
- Real-time collaboration (Enterprise)
- Guest users (viewers/commenters) on Starter+
- Workspace management with role-based permissions

---

## 6. Quality Comparison: Synthesia vs HeyGen vs D-ID

### Avatar Quality

| Dimension | Synthesia (Express-2) | HeyGen (Avatar IV) | D-ID |
|-----------|----------------------|-------------------|------|
| **Realism** | Professional, polished | Hyper-realistic, human-like | Photo-to-video, less consistent |
| **Body Language** | Natural gestures, micro-expressions | Dynamic, script-synced | Limited to head movements |
| **Lip Sync** | Accurate, consistent | Highly accurate | Good but less realistic |
| **Uncanny Valley** | Slight, but enterprise-appropriate | Almost none | Noticeable |
| **Best For** | Corporate training, compliance, HR | Marketing, sales, social content | Quick clips, chatbots |

### Voice Quality

| Dimension | Synthesia | HeyGen | D-ID |
|-----------|-----------|--------|------|
| **Voices** | 400+ | 300+ | 40+ |
| **Naturalness** | More natural in testing | Good | Adequate |
| **Voice Cloning** | 10-sec audio required | Available | Available |
| **Accent Preservation** | ✅ Express-2 preserves accents | Good | Limited |

### Enterprise Readiness

| Feature | Synthesia | HeyGen | D-ID |
|---------|-----------|--------|------|
| **SOC 2 Type II** | ✅ | ✅ | ✅ |
| **GDPR** | ✅ | ✅ | ✅ |
| **ISO 42001** | ✅ | ❌ | ❌ |
| **SSO/SAML** | ✅ Enterprise | ✅ Business+ | ✅ |
| **Audit Logs** | ✅ | ❌ | ❌ |
| **Content Moderation** | ✅ Priority (Enterprise) | ✅ | ✅ |
| **Certified Service Providers** | ✅ | ❌ | ❌ |
| **Dedicated CSM** | ✅ Enterprise | ✅ Enterprise | ❌ |

### Winner by Use Case

| Use Case | Winner | Reason |
|----------|--------|--------|
| Corporate Training (LMS) | **Synthesia** | SCORM, quizzes, branching, 60+ LMS integrations |
| Compliance Videos | **Synthesia** | ISO 42001, audit logs, priority moderation |
| HR Onboarding | **Synthesia** | Bulk personalization, multilingual player |
| Product Demos | Tie | Synthesia for professionalism, HeyGen for engagement |
| Marketing/Sales | **HeyGen** | Avatar IV realism, photo avatars, face swap |
| Social Media Content | **HeyGen** | More aspect ratios, faster workflow |
| Live/Interactive Avatars | **HeyGen** | Real-time Avatar API (Synthesia has none) |
| Quick Budget Clips | **D-ID** | Fastest rendering, lowest entry price |

### Market Positioning (from independent reviews)

- **VidMeToo.com (May 2026)**: "HeyGen for volume, creative features, and multilingual marketing content. Synthesia for enterprise-grade avatar quality, security, and training video production."
- **FahimAI (May 2026)**: Tested both for 4 weeks — "Synthesia won 5 of 8 categories."
- **WaveSpeedAI (Dec 2025)**: "Output quality is equivalent in technical specifications, with the main difference being the avatar style and realism."
- **BlogRecode (Mar 2026)**: "Winner: HeyGen for cutting-edge features | Synthesia for practical business tools"

---

## 7. Use Cases for MovieAnimation.ai

### High-Fit Use Cases

1. **Corporate Training Modules**
   - Employee onboarding videos (personalized by department, role, language)
   - Compliance training with interactive quizzes and branching scenarios
   - Software product walkthroughs with screen recording + avatar narration
   - SCORM export for LMS delivery

2. **HR & Internal Communications**
   - CEO/leadership updates in 140+ languages
   - Personalized welcome videos for new hires
   - Policy change announcements with professional avatars

3. **Product Demos (Enterprise Clients)**
   - Customized product walkthroughs per client
   - Multilingual demos without re-recording
   - Branded templates for consistent client experience

4. **Customer Education**
   - Onboarding video series with interactive elements
   - Feature announcement videos
   - Support knowledge base videos

### Medium-Fit Use Cases

5. **Sales Enablement**
   - Personalized pitch videos from CRM data
   - Objection-handling training for sales teams
   - Case study video production

6. **Healthcare/Compliance**
   - Patient education videos (HIPAA-compliant with Enterprise)
   - Regulatory compliance training
   - Procedure explanation videos

### Low-Fit (Use HeyGen Instead)

- Social media marketing content (HeyGen more dynamic)
- Live avatar interactions (HeyGen only)
- Photo-to-avatar personalization (HeyGen/D-ID)

---

## 8. API Compatibility with MovieAnimation.ai Pipeline

### Current Pipeline Architecture (HeyGen)

```
User → MovieAnimation.ai → Script Generator → Template Selection → HeyGen API → Async Video → Delivery
```

### Synthesia Integration Path

```
User → MovieAnimation.ai → Script Generator → Template Selection → Synthesia API → Async Video → Delivery
```

**Compatibility Assessment:**

| Pipeline Component | Compatibility | Notes |
|-------------------|---------------|-------|
| **Authentication** | ✅ Compatible | Standard API key header auth |
| **Video Creation** | ✅ Compatible | REST POST /v2/videos |
| **Template Variables** | ✅ Compatible | JSON variable injection, matching our template system |
| **Async Status** | ✅ Compatible | Webhook-based (video.completed / video.failed) |
| **Avatar Selection** | ✅ Compatible | GET /v2/avatars to list available avatars |
| **Voice Selection** | ✅ Compatible | GET /v2/voices, voice UUID per scene |
| **Background Control** | ✅ Compatible | Stock backgrounds + custom asset upload |
| **Callback/Metadata** | ✅ Compatible | callbackId field for linking to internal records |
| **Download/Access** | ✅ Compatible | Time-limited download URL + MP4 format |
| **Script Validation** | ⚠️ Partial | < 1000 chars per slide, needs pre-validation |
| **Rate Limiting** | ⚠️ Discovery | Creator limits undocumented; Enterprise contracted |
| **SCORM Export** | ❌ Enterprise-only | Blocked for Creator; needs custom post-processing |
| **1-Click Translation** | ❌ Enterprise-only | Blocked for Creator |

### Integration Effort Estimate

- **Creator tier integration**: 3-5 developer days (REST API, webhook, template system)
- **Enterprise tier integration**: 5-8 developer days (adds SCORM, SSO, translation workflows)
- **Migration from HeyGen**: 2-3 additional days (template porting, variable mapping)

---

## 9. Webhook Support Detail

Synthesia webhooks are production-grade and well-documented:

### Configuration
- Webhook URL configured at account/API key level
- All videos created with that API key route to the same webhook endpoint
- Signature verification available for security

### Event Types
1. `video.completed` — video ready with download URL, captions, thumbnails, duration
2. `video.failed` — detailed error message with failure reason

### Production Considerations
- **40% faster perceived delivery** vs polling (source: autogpt.net production integration)
- Time-limited download URLs (must fetch immediately or regenerate via API)
- Webhook fires when rendering completes (1-2 min for 1-min video)
- No retry mechanism documented — implement your own idempotency
- callbackId field enables linking webhook events back to internal records (e.g., customer email, deal ID)

### Comparison with HeyGen Webhooks
Both platforms offer comparable webhook functionality. Synthesia's webhook payload is more detailed (includes captions, thumbnails, gif preview). HeyGen's API development pace is faster.

---

## 10. Risks & Considerations

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Enterprise-only SCORM** | High | Critical for LMS customers. Requires Enterprise ($20K+) or post-processing with external SCORM wrapper |
| **Opaque rate limits on Creator** | Medium | Build conservative queue (3 concurrent), scale up gradually |
| **Re-render costs** | Medium | Pre-validate scripts programmatically; every re-render counts against quota |
| **Avatar "corporate" feel** | Medium | Some users may find Synthesia avatars less engaging than HeyGen for non-training content |
| **No real-time avatars** | Low | Not relevant for training use case, but HeyGen has this |
| **Custom avatar cost ($1K/yr)** | Low | One-time expense, comparable to HeyGen studio avatars |
| **Vendor lock-in** | Low | Template portability; MP4 output is platform-independent |

### Opportunities

- Express-2 avatar quality continues improving with each model update
- Synthesia's L&D focus makes it strong for enterprise training contracts
- Multilingual capabilities are a differentiator for global MovieAnimation.ai clients
- Interactive video features (quizzes, branching) unlock premium pricing

---

## 11. Recommendation

### Primary Recommendation: **Defer Synthesia — Monitor for 3-6 Months**

**Synthesia is the right tool for MovieAnimation.ai's corporate training tier, but not right now.**

**Reasons to wait:**

1. **HeyGen is already integrated** as Phase 1 MVP. Duplicating effort for the same capability tier adds maintenance burden without immediate new revenue.

2. **Synthesia's key differentiators are Enterprise-only**: SCORM export, 1-click translation, and unlimited minutes require the Enterprise plan ($20K+), which doesn't make financial sense at MovieAnimation.ai's current scale.

3. **Creator plan has significant limitations**: 360 minutes/year via API, undocumented rate limits, no SCORM. For our production pipeline, this is a bottleneck.

4. **The market is evolving rapidly**: Both HeyGen and Synthesia are iterating quickly. HeyGen may add SCORM/enterprise features, and Synthesia may democratize Enterprise features.

### Trigger Events for Re-evaluation

Revisit Synthesia integration when any of these occur:

- ✅ MovieAnimation.ai lands first enterprise training client requiring SCORM/LMS compliance
- ✅ Monthly video volume exceeds HeyGen's cost-effective threshold (>100 videos/month with Avatar IV)
- ✅ Client demands interactive video features (quizzes, branching) that Synthesia natively supports
- ✅ Synthesia introduces a "Business" tier between Creator and Enterprise (similar to HeyGen's $149/mo tier)
- ✅ Synthesia lowers the Enterprise entry price or offers usage-based pricing for mid-market

### If Integrating Today: Use This Architecture

```
MovieAnimation.ai
├── Phase 1 (Current): HeyGen — Marketing, social, quick content
├── Phase 2 (3-6 months): Evaluate Synthesia Creator for training demos
└── Phase 3 (6-12 months): Synthesia Enterprise for corporate training tier
    ├── LMS: SCORM export, 60+ integrations
    ├── Interactive: Quizzes, branching scenarios
    ├── Multilingual: 1-click translation, 140+ languages
    └── Compliance: ISO 42001, SOC 2, audit logs
```

### Alternative: Colossyan

If MovieAnimation.ai needs interactive training features **now** without Enterprise pricing, consider **Colossyan**:
- Strong L&D focus with built-in quizzing and branching
- SCORM at lower price tier
- 150+ avatars, 80+ languages
- API access at Business plan (~$70/mo)
- Worth a brief evaluation as a HeyGen → Synthesia bridge

---

## 12. Sources

| Source | URL | Date |
|--------|-----|------|
| Synthesia API Docs | https://docs.synthesia.io | Ongoing |
| Synthesia Pricing | https://www.synthesia.io/pricing | June 2026 |
| Synthesia Express-2 Announcement | https://www.synthesia.io/post/express-2-is-synthesias-next-chapter-for-full-body-expressive-ai-avatars | Sept 2025 |
| MIT Technology Review | https://www.technologyreview.com/2025/09/04/1123054/ | Sept 2025 |
| AutoGPT API Deep Dive | https://autogpt.net/synthesia-api/ | May 2026 |
| vidmetoo.com Comparison | https://www.vidmetoo.com/heygen-vs-synthesia/ | May 2026 |
| BlogRecode Hands-On Test | https://blogrecode.com/synthesia-vs-heygen-comparison-creating-ai-videos/ | Mar 2026 |
| AI Tools DevPro Guide | https://aitoolsdevpro.com/ai-tools/synthesia-guide/ | Jan 2026 |
| Tekpon Pricing | https://tekpon.com/software/synthesia/pricing/ | Feb 2026 |
| Arcade Software Pricing | https://www.arcade.software/post/synthesia-pricing | Apr 2026 |
| ezUGC Synthesia Review | https://www.ezugc.ai/blog/synthesia-review | Feb 2026 |
| Max-Productive Review | https://max-productive.ai/ai-tools/synthesia/ | Apr 2026 |
| FahimAI Synthesia vs D-ID | https://www.fahimai.com/synthesia-vs-d-id | May 2026 |
| Synthesia Webhook Docs | https://docs.synthesia.io/reference/webhook-events.md | Ongoing |

---

## Appendix A: Key API Endpoints Quick Reference

```bash
# Authentication
HEADER: "Authorization: YOUR_API_KEY"

# Base URLs
API: https://api.synthesia.io
Upload: https://upload.api.synthesia.io/v2

# Create a video
POST /v2/videos
Body: { title, description, visibility, input: [{ scriptText, avatar, background, avatarSettings }] }

# Create from template
POST /v2/videos/from-template
Body: { templateId, title, variables: { key: value }, callbackId, test }

# Check video status
GET /v2/videos/{id}
Response: { id, status, download, duration, captions, thumbnail }

# List videos
GET /v2/videos?source=workspace|my_videos|shared_with_me

# List avatars
GET /v2/avatars

# List voices
GET /v2/voices

# List templates
GET /v2/templates?source=workspace|synthesia

# Webhook events
video.completed → { download, captions, thumbnail, duration, callbackId }
video.failed → { message, status: "error" }
```

## Appendix B: HeyGen vs Synthesia Migration Checklist

If/when adding Synthesia as a parallel provider or replacement:

- [ ] Map avatar IDs (HeyGen → Synthesia)
- [ ] Map voice IDs (language + style matching)
- [ ] Port templates (Synthesia template variables match HeyGen pattern)
- [ ] Implement Synthesia webhook handler (reuse existing async pattern)
- [ ] Add Synthesia-specific rate limiting / queue management
- [ ] Add script pre-validation (< 1000 chars per slide)
- [ ] Handle time-limited download URLs (fetch immediately)
- [ ] Add provider selection flag in MovieAnimation.ai pipeline
- [ ] Update billing/invoicing to track per-provider costs
