# Performance Optimization & CDN Setup Guide
# MovieAnimation.ai — Phase 11: Beta Testing

## Current Performance Features (Implemented)

| Feature | Status | Description |
|---------|--------|-------------|
| Response Compression | ✅ | Gzip/deflate via `compression` middleware |
| Helmet Security Headers | ✅ | XSS, HSTS, no-sniff, CSP-ready |
| In-Memory Response Caching | ✅ | TTL-based cache with auto-cleanup |
| ETag Conditional Requests | ✅ | 304 Not Modified for read-heavy routes |
| Static Asset Cache Headers | ✅ | Content-type aware max-age values |
| CORS Preflight Caching | ✅ | 24-hour preflight cache |
| Rate Limiting | ✅ | Token bucket: 60/min general, 10/min auth |

---

## CDN Configuration

### Option A: Cloudflare (Recommended for Beta)

1. **Add your domain to Cloudflare**
   ```bash
   # DNS Records
   movieanimation.ai → A → [your-server-ip] (orange cloud = proxied)
   api.movieanimation.ai → A → [your-server-ip]
   ```

2. **Page Rules for Caching**
   ```
   # Static assets — cache aggressively
   movieanimation.ai/uploads/* → Cache Level: Cache Everything, Edge Cache TTL: 7 days
   movieanimation.ai/previews/* → Cache Level: Cache Everything, Edge Cache TTL: 1 day
   movieanimation.ai/thumbnails/* → Cache Level: Cache Everything, Edge Cache TTL: 7 days
   
   # API — bypass cache (we handle caching server-side)
   api.movieanimation.ai/* → Cache Level: Bypass
   
   # Next.js static assets
   movieanimation.ai/_next/static/* → Cache Level: Cache Everything, Edge Cache TTL: 1 year
   ```

3. **Transform Rules**
   ```
   # Forward real client IP
   When: (all requests) → Set: X-Forwarded-For = http.request.headers["CF-Connecting-IP"]
   ```

4. **Security Settings**
   - SSL/TLS: Full (strict)
   - Always Use HTTPS: On
   - Minimum TLS Version: 1.2
   - Brotli Compression: On
   - Early Hints: On

### Option B: Vercel (If Hosting Frontend on Vercel)

```json
// vercel.json
{
  "headers": [
    {
      "source": "/_next/static/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/uploads/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=604800, s-maxage=86400" }
      ]
    },
    {
      "source": "/(.*).(png|jpg|jpeg|gif|svg|webp|ico)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=604800" }
      ]
    }
  ]
}
```

---

## Backend Performance Optimizations

### 1. Enable Keep-Alive (already default in Node.js)

```typescript
// In backend/src/index.ts - already handled by Express
// Node.js HTTP server uses keep-alive by default (5s timeout)
server.keepAliveTimeout = 61_000;     // Slightly above ALB timeout (60s)
server.headersTimeout = 65_000;       // Slightly above keepAliveTimeout
```

### 2. Database Connection Pooling

```sql
-- Current pool config in database.ts should include:
ALTER SYSTEM SET max_connections = 100;
-- For load testing: increase to 200
```

### 3. Response Caching Strategy

| Route | Cache TTL | Strategy |
|-------|-----------|----------|
| `/api/health` | 10s | In-memory |
| `/api/analytics/usage` | 30s | In-memory |
| `/api/analytics/costs` | 30s | In-memory |
| `/api/analytics/dau` | 60s | In-memory |
| `/api/users/dashboard` | 30s | In-memory + ETag |
| `/api/scripts` | 30s | ETag only |
| `/api/scripts/:id` | 60s | ETag only |
| `/uploads/*` | 7d | Browser + CDN |
| `/previews/*` | 1d | Browser + CDN |

### 4. Future Improvements (Post-Beta)

- [ ] **Redis Caching**: Replace in-memory cache with Redis for multi-process support
- [ ] **Service Worker**: PWA caching for offline dashboard access
- [ ] **Image Optimization**: WebP conversion pipeline for uploaded assets
- [ ] **Video Transcoding**: Generate multiple resolutions at upload time
- [ ] **Database Query Optimization**: Add indexes for slow queries
- [ ] **CDN Origin Shield**: Reduce origin load on CDN miss

---

## Frontend Performance

### Next.js Configuration (current: `next.config.ts`)
```typescript
// Key settings already in place:
- outputFileTracing: reduces build artifacts
- OptimizeCss: enable CSS optimization
- poweredByHeader: false (security)
- compress: true (response compression)
```

### Additional Optimizations to Enable

1. **Image Optimization**
   ```typescript
   // Add to next.config.ts
   images: {
     formats: ['image/avif', 'image/webp'],
     minimumCacheTTL: 60,
     remotePatterns: [
       {
         protocol: 'http',
         hostname: 'localhost',
         port: '3001',
         pathname: '/uploads/**',
       },
     ],
   },
   ```

2. **Bundle Analysis**
   ```bash
   ANALYZE=true npm run build
   ```

3. **Lazy Loading**
   - Dynamic imports for heavy pages (Timeline Editor, Export)
   - React.lazy + Suspense for dashboard widgets
   - Intersection Observer for off-screen content

---

## Load Testing Results (Expected)

### Target Metrics for Beta
| Metric | Target |
|--------|--------|
| p50 Response Time | <200ms |
| p95 Response Time | <1s |
| p99 Response Time | <2s |
| Error Rate | <1% |
| Concurrent Users | 20 |
| Throughput | 50 req/s |

### How to Run Load Tests
```bash
cd tools/loadtest
k6 run --vus 20 --duration 5m k6-test.js
```

Results are saved to `tools/loadtest/results/`.

---

## Monitoring Checklist for Beta
- [ ] Backend CPU/Memory usage (htop/top)
- [ ] PostgreSQL connection count and query times
- [ ] API response time distribution (via analytics)
- [ ] Cache hit rate (via `/api/analytics/cache`)
- [ ] Rate limit hits (check headers: X-RateLimit-Remaining)
- [ ] Error rate by endpoint

---

*Last Updated: May 2026 — Phase 11 Beta*
