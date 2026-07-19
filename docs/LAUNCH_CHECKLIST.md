# 🚀 MovieAnimation.ai — Production Launch Checklist

**Version:** 1.5.0
**Target Launch Date:** TBD
**Project Lead:** Synclair Gaines / Ronnie Gaines

---

## Pre-Launch Verification

### 🔐 Security
- [x] JWT secret generated (unique, 64+ chars)
- [x] Passwords hashed with bcrypt (12 rounds)
- [x] Helmet security headers configured (CSP, HSTS, X-Frame-Options)
- [x] CORS restricted to production domain
- [x] Rate limiting enabled on auth endpoints
- [x] Production error messages sanitized (no stack traces)
- [ ] SSL/TLS certificates provisioned (Let's Encrypt or Azure)
- [ ] SENTRY_DSN configured for error monitoring
- [ ] Database password rotated from development
- [ ] API keys audited and rotated if needed
- [ ] Security audit complete (see docs/security-audit.md)

### 🗄️ Database
- [x] PostgreSQL schema deployed (all migrations)
- [x] Database accessible via SSH tunnel
- [x] Redis running (Docker, port 6379)
- [ ] Production database backup strategy:
  - [ ] Automated daily pg_dump cron
  - [ ] Backup retention policy (30 days)
  - [ ] Offsite backup copy configured

### 🏗️ Infrastructure
- [x] Docker Compose production stack defined
- [x] Nginx reverse proxy configured
- [x] deploy.sh automated deployment script
- [x] Redis AOF persistence enabled
- [ ] DNS records configured (movieanimation.ai)
- [ ] SSL certificates installed and verified
- [ ] GitHub CI/CD pipeline activated (.github/workflows/deploy.yml)
- [ ] Vercel or Azure frontend deployment configured
- [ ] Azure → Local GPU VPN tunnel established

### 📦 Build & Deploy
- [x] Backend TypeScript compiles clean
- [x] Frontend Next.js builds successfully
- [ ] Production deployment executed (deploy.sh --full)
- [ ] Health endpoint responds: GET /api/health → {"status":"ok"}
- [ ] All 15+ API routes verified
- [ ] BullMQ queues connected to Redis

### 🎨 Frontend Pages (All Must Render)
- [x] Landing page (/)
- [x] Login/Register (/auth)
- [x] User Dashboard (/dashboard)
- [x] Cost Dashboard (/dashboard/costs)
- [x] Analytics Dashboard (/analytics)
- [x] Project Workspace (/project/[id])
- [x] Script Editor (/project/[id]/script)
- [x] Asset Library (/project/[id]/assets)
- [x] Character Manager (/project/[id]/characters)
- [x] Timeline Editor (/project/[id]/timeline)
- [x] Export Page (/project/[id]/export)
- [x] Help Center (/help)
- [x] Onboarding (/onboarding)
- [x] Terms of Service (/tos)
- [x] Privacy Policy (/privacy)

### 🔍 SEO & Analytics
- [x] Open Graph meta tags configured
- [x] Twitter Card meta tags configured
- [x] robots.txt allowing indexing
- [x] Page-specific metadata titles/descriptions
- [ ] Google Analytics / Plausible tracking code
- [ ] Sitemap generated (next-sitemap or manual)
- [ ] Search Console domain verification
- [ ] OG image created (1200×630px)

### 📈 Monitoring & Alerts
- [ ] Sentry error tracking configured (backend + frontend)
- [ ] Uptime monitoring (UptimeRobot, Better Stack, or similar)
- [ ] API endpoint monitoring (health check every 60s)
- [ ] Database connection monitoring
- [ ] Redis connection monitoring
- [ ] API cost/usage alerts:
  - [ ] Daily budget alert ($50)
  - [ ] Per-user credit limit alert
  - [ ] API key failure/quarantine alert

### 🧪 Smoke Tests (Post-Deploy)
- [ ] Health endpoint: 200 OK
- [ ] Register new user
- [ ] Login with registered user
- [ ] JWT token received, stored, and valid
- [ ] Dashboard loads with stats
- [ ] Create new project
- [ ] Upload script (plain text)
- [ ] AI script parsing (if Anthropic key available)
- [ ] Manual scene breakdown
- [ ] Upload asset/image
- [ ] Create character
- [ ] Assign image to character
- [ ] Create scene → assign to project
- [ ] Generate video scene (if API keys funded)
- [ ] Create timeline
- [ ] Add clips to timeline
- [ ] Reorder clips (drag-drop)
- [ ] Assemble timeline
- [ ] Create export job
- [ ] Download exported video
- [ ] Share link generated and accessible
- [ ] Rate limiting: 5 rapid auth requests → throttled
- [ ] Protected routes redirect to login
- [ ] Invalid JWT → 403

### 📧 Email & Communications
- [ ] Transactional email provider configured (Resend/SendGrid)
- [ ] Welcome email template
- [ ] Password reset flow
- [ ] Export completion notification
- [ ] Service announcement capability

### 📄 Legal & Compliance
- [x] Terms of Service page (/tos)
- [x] Privacy Policy page (/privacy)
- [ ] Cookie consent banner (if using analytics cookies)
- [ ] Footer links to ToS and Privacy on all pages

### 🚦 Performance
- [ ] Lighthouse audit score ≥ 90 (Performance)
- [ ] Lighthouse audit score ≥ 90 (Accessibility)
- [ ] Lighthouse audit score ≥ 90 (Best Practices)
- [ ] Lighthouse audit score ≥ 90 (SEO)
- [ ] Frontend bundle size ≤ 500KB (gzipped)
- [ ] API response p95 ≤ 100ms (standard endpoints)
- [ ] API response p95 ≤ 500ms (DB-dependent endpoints)
- [ ] Image optimization (next/image with proper sizes)
- [ ] Static asset caching (30-day immutable)

### 📚 Documentation
- [x] API Reference (docs/API.md)
- [x] Deployment Runbook (docs/DEPLOYMENT.md)
- [x] User Guide (docs/USER_GUIDE.md)
- [x] DNS Configuration (docs/DNS_CONFIG.md)
- [x] Sentry Setup Guide (docs/SENTRY_SETUP.md)
- [x] Performance Optimization (docs/performance-optimization.md)
- [x] Security Audit (docs/security-audit.md)
- [x] Video Tutorials Outline (docs/video-tutorials-outline.md)
- [x] README.md (project root)
- [ ] Post-launch support runbook
- [ ] Incident response procedure

---

## Launch Day Procedure

### T-24 Hours
- [ ] Final code freeze on main branch
- [ ] Run full test suite (backend + frontend)
- [ ] Verify all API keys are funded/active
- [ ] Database backup before final migration
- [ ] Review Sentry configured and receiving events
- [ ] DNS TTL lowered to 60s (for quick cutover)

### T-1 Hour
- [ ] Production deployment (deploy.sh --full)
- [ ] Health check all endpoints
- [ ] Smoke test critical path (register → generate → export)
- [ ] Verify SSL certificates valid
- [ ] Verify DNS resolves correctly

### T-0 (Launch!)
- [ ] Enable public registration (if behind invite wall)
- [ ] Monitor Sentry for errors (first 30 min)
- [ ] Monitor API costs (first hour)
- [ ] Check server load (CPU, memory, Redis queue depth)
- [ ] Standby for support

### T+24 Hours
- [ ] Review Sentry errors (trend analysis)
- [ ] Review API costs vs budget
- [ ] User feedback collection
- [ ] Performance metrics review
- [ ] Database backup verification
- [ ] DNS TTL restore to 300s

---

## Rollback Plan

If critical issues arise post-launch:

1. **Revert deploy:** `git revert <commit>` + deploy.sh
2. **Database rollback:** Restore from pre-launch backup
3. **DNS failover:** Point DNS to maintenance page
4. **Disable registration:** Set `REGISTRATION_ENABLED=false` env
5. **Communication:** Post status update via email/Slack

Rollback command:
```bash
cd /home/lo/.openclaw/workspace/projects/movieanimation
git revert HEAD --no-edit
bash deploy.sh --full
```

---

## Contacts

| Role | Name | Contact |
|------|------|---------|
| CEO | Ronnie Gaines | rong@simrobotics.com |
| Project Lead | Synclair Gaines | — |
| DevOps | SimCoder / Main Agent | Via OpenClaw |
| Support | SimRobotics Team | — |

---

**Last Updated:** 2026-06-07
**Status:** ✅ Pre-Launch — Ready for DNS, SSL, and final deployment
