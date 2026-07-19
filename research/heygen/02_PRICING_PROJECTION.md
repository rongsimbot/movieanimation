# HeyGen Pricing Projection for MovieAnimation.ai

**Date:** 2026-06-01  
**Researcher:** SimAnalyst  
**Status:** ✅ COMPLETE

---

## 1. HeyGen Pricing Plans (2026)

### Web App Plans (for UI-based creation)

| Plan | Monthly Cost | Resolution | Premium Credits | Custom Avatars | Best For |
|------|-------------|------------|-----------------|----------------|----------|
| **Free** | $0 | 720p (watermark) | 1/mo | 3 photo slots | Testing only |
| **Creator** | $29/mo ($24 annual) | 1080p | 200/mo | 1 custom | Solo creators |
| **Pro** | $99/mo ($79 annual) | 1080p | 2,000/mo | Multiple | Power users |
| **Business** | $149/mo + $20/seat | 4K | 1,000 shared | 5 custom | Teams |
| **Enterprise** | Custom | 4K+ | Custom | Unlimited | High volume |

### API Plans (separate from web app)

| Plan | Cost | Per-Credit Cost | Features |
|------|------|----------------|----------|
| **Pay-as-you-go** | $5 minimum top-up | ~$0.99/credit | Full API access, no commitment |
| **Scale** | $330/mo | ~$0.50/credit | 660 credits, Translation, Proofread |
| **Enterprise** | Custom | Volume discounts | Digital Twin Creation API, dedicated support |

**⚠️ IMPORTANT:** API wallet and web plan credits are COMPLETELY SEPARATE billing pools. API usage deducts from API wallet.

---

## 2. Credit Consumption Rates

| Operation | Model | Cost per Second | Cost per Minute | Effective Cost/Min |
|-----------|-------|----------------|-----------------|-------------------|
| **Photo Avatar Video** | Avatar IV | $0.05/sec | $3.00/min | $3.00/min |
| **Digital Twin Video** | Avatar V | $0.0667/sec | $4.00/min | $4.00/min |
| **Video Agent** (prompt-to-video) | V3 Agent | $0.0333/sec | $2.00/min | $2.00/min |
| **Lipsync (Precision)** | Precision | $0.0667/sec | $4.00/min | $4.00/min |
| **Lipsync (Speed)** | Speed | $0.0333/sec | $2.00/min | $2.00/min |
| **Video Translation (Precision)** | Precision | $0.0667/sec | $4.00/min | $4.00/min |
| **Video Translation (Speed)** | Speed | $0.0333/sec | $2.00/min | $2.00/min |
| **Voices (Starfish TTS)** | Starfish | $0.000667/sec | $0.04/min | $0.04/min |

### Credit Math (Scale Plan @ $0.50/credit)
- 1 minute of Photo Avatar (Avatar IV) = 20 credits = **$10.00/min**
- 1 minute of Video Agent = 10 credits = **$5.00/min**

### Alternative: Premium Credit Math (Web App)
- 3 seconds of Avatar IV = 1 Premium Credit
- 1 minute of Avatar IV = 20 Premium Credits
- Creator: 200 credits = 10 minutes/month
- Pro: 2,000 credits = 100 minutes/month
- Overage: $15 for 300 additional credits

---

## 3. MovieAnimation Cost Projections

### Scenario: 100 videos/month, 90 seconds each

#### Option A: API Pay-as-you-go (Photo Avatar @ $0.05/sec)

| Item | Calculation | Monthly Cost |
|------|------------|-------------|
| Video generation (Photo Avatar) | 100 × 90s × $0.05 | **$450.00** |
| Asset uploads | Free | $0.00 |
| **Total (Pay-as-you-go)** | — | **$450.00/mo** |

#### Option B: API Scale Plan ($330/mo + credits)

| Item | Calculation | Monthly Cost |
|------|------------|-------------|
| Scale plan base | $330/mo | $330.00 |
| 660 included credits → ~33 min | — | (included) |
| Remaining: 117 min @ $0.50/credit (20 credits/min) | 117 × 20 × $0.50 | $1,170.00 |
| **Total (Scale)** | — | **$1,500.00/mo** |

#### Option C: API Enterprise (estimated volume discount)

| Item | Calculation | Monthly Cost |
|------|------------|-------------|
| Enterprise plan (est.) | ~$500/mo estimate | $500.00 |
| Volume rate: ~$0.30/credit (20 credits/min) | 150 min × 20 × $0.30 | $900.00 |
| **Total (Enterprise)** | — | **~$1,400.00/mo** |

#### ⚠️ Option D: Using Video Agent instead of Photo Avatar

| Item | Calculation | Monthly Cost |
|------|------------|-------------|
| Video Agent @ $0.0333/sec | 100 × 90s × $0.0333 | **$299.70** |
| Pay-as-you-go wallet | $5 minimum | $5.00 |
| **Total (Video Agent)** | — | **~$300.00/mo** |

> **Note:** Video Agent gives less control over exact avatar placement and background. Photo Avatar API may be needed for precise scene composition.

---

## 4. Per-Video Unit Economics

| Approach | Per 90s Video | Per Minute | Annual (1,200 videos) |
|----------|--------------|------------|----------------------|
| **D-ID + ffmpeg** | $0.225 | $0.15 | **$270/yr** |
| **HeyGen Video Agent** | $2.997 | $2.00 | **$3,596/yr** |
| **HeyGen Photo Avatar** | $4.50 | $3.00 | **$5,400/yr** |
| **HeyGen Digital Twin** | $6.00 | $4.00 | **$7,200/yr** |

---

## 5. Comparative Analysis: D-ID vs HeyGen

| Metric | D-ID + ffmpeg | HeyGen Photo Avatar | HeyGen Video Agent |
|--------|--------------|-------------------|-------------------|
| **Per-minute cost** | $0.15/min | $3.00/min | $2.00/min |
| **100 videos/month** | $225/mo | $450/mo | $300/mo |
| **Compositing needed?** | ✅ Yes (ffmpeg) | ❌ No | ❌ No |
| **Video quality** | Good | Excellent | Very Good |
| **Custom backgrounds** | Via compositing | Native | Native |
| **Setup time** | 1-2 days | 2 days | 1 day |
| **API complexity** | 3 endpoints | 4-5 endpoints | 1 endpoint |
| **Control over output** | High | High | Medium |
| **Full-body animation** | No | Partial | Partial |
| **Multi-language** | No | Yes | Yes |
| **Ongoing maintenance** | ffmpeg pipeline | None | None |

---

## 6. Recommended Pricing Strategy for MovieAnimation

### Two-Tier Model

| Tier | Technology | Per-Video Cost | Sell Price | Margin |
|------|-----------|---------------|------------|--------|
| **Standard** | HeyGen Video Agent | $3.00/video | $9.99/video | 70% |
| **Premium** | HeyGen Photo Avatar | $4.50/video | $14.99/video | 70% |

### Cost Optimization Strategies

1. **Start with Video Agent** for basic scenes where precise control isn't needed — saves ~33% per video
2. **Use Photo Avatar** only for hero scenes requiring custom background integration
3. **Batch upload** backgrounds during off-peak hours
4. **Negotiate Enterprise pricing** if volume exceeds 200 videos/month
5. **Watch for V3 improvements** — HeyGen is rapidly iterating and costs may decrease

---

## 7. Budget Recommendation

### MVP Phase (Month 1-3)
- **API Wallet:** $50 initial top-up
- **Test budget:** ~10 test videos
- **Production budget:** ~30 videos/month
- **Estimated monthly spend:** $90-$135/mo

### Scale Phase (Month 4+)
- **Target:** 100 videos/month
- **Plan:** API Pay-as-you-go for flexibility
- **Estimated monthly spend:** $300-$450/mo
- **Consider:** Scale plan if volume consistently exceeds 150 videos/month

### Full Production (100+ videos/month)
- **Plan:** Enterprise negotiation
- **Target rate:** Under $2.00/min
- **Estimated monthly spend:** $200-$300/mo

---

## 8. Hidden Costs & Gotchas

| Item | Details |
|------|---------|
| **Render failures** | Failed renders still consume credits |
| **Re-renders** | Script changes = full credit cost again |
| **Video URL expiry** | Download URLs expire after 7 days |
| **Concurrent limits** | 3 simultaneous renders max |
| **No credit rollover** | Unused credits don't carry forward |
| **No free API tier** | Minimum $5 wallet required (since Feb 2026) |
| **Asset storage** | Uploaded assets count toward account storage |
| **4K surcharge** | Higher resolution = more credits on Business+ |

---

**Sources:**
- HeyGen Developer Pricing Page: https://developers.heygen.com/
- Arcade Pricing Analysis: https://www.arcade.software/post/heygen-pricing
- Merlio API Pricing Guide: https://merlio.app/blog/heygen-api-guide-to-ai-powered-video-integration
- AutoGPT HeyGen Review: https://autogpt.net/what-is-the-heygen-api-and-why-should-you-care/
- Multiple pricing comparison sites (Arcade, VidMetoo, ComparEdge, AI Video Picks)
