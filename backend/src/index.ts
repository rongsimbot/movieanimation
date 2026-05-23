/**
 * index.ts - MovieAnimation Backend Server Entry Point
 * Phase 2: User Authentication (COMPLETED)
 * Phase 6: Full API integration with Sora, Runway, Seedance
 * Phase 7: Video Assembly (COMPLETED)
 * Phase 8: Final Rendering & Export Pipeline (COMPLETED)
 * Phase 11: Beta Testing — Analytics, Security, Performance
 */

import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import videoRoutes from './routes/videoRoutes';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import scriptRoutes from './routes/scriptRoutes';
import characterRoutes from './routes/characterRoutes';
import assetRoutes from './routes/assetRoutes';
import timelineRoutes from './routes/timelineRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import exportRoutes from './routes/exportRoutes';
import previewRoutes from './routes/previewRoutes'; // Phase 5
import { testConnection, closePool } from './config/database';
import Redis from 'ioredis';
import { closeQueues } from './queue/videoQueue';
import { closeExportQueue } from './queue/exportQueue';
import { getFailoverHealth } from './services/apiFailover';
import { getPoolStats } from './services/keyManager';
import { getWebhookHealth } from './services/webhookManager';
import { ensureAnalyticsTable } from './services/analyticsService';
import { requestIdMiddleware, globalErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimiter, authRateLimiter, uploadRateLimiter, generationRateLimiter } from './middleware/rateLimiter';
import { etagMiddleware, staticCacheHeaders } from './middleware/cacheMiddleware';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Phase 11: Security & Performance Middleware ─────────────────

// Helmet security headers (XSS protection, HSTS, no sniff, CSP, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin for asset serving
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // Next.js hydration requires inline
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// Response compression (gzip/deflate)
app.use(compression({ threshold: 1024 })); // Only compress responses >1KB

// CORS with tighter defaults
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  maxAge: 86400, // 24 hours preflight cache
}));

// Request ID for tracking/debugging
app.use(requestIdMiddleware);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Phase 11: Global Rate Limiting ─────────────────────────────

// General rate limit for all /api routes
app.use('/api', rateLimiter());

// Static asset caching headers (Phase 7: Polish)
app.use('/uploads', express.static('uploads', { setHeaders: (res, path) => {
  const ext = path.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  } else if (/\.(mp4|webm|mov)$/i.test(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  } else if (/\.(pdf|docx?|txt)$/i.test(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}}));
app.use('/previews', staticCacheHeaders, express.static('previews'));
app.use('/thumbnails', staticCacheHeaders, express.static('thumbnails'));

// ETag middleware for read-heavy API routes (Phase 7: Polish)
app.use(['/api/analytics', '/api/scripts', '/api/characters', '/api/assets'], etagMiddleware({ maxAge: 30 }));

// ─── Request Logging with Response Times ───────────────────────

app.use((req, res, next) => {
  const startTime = Date.now();
  const { method, path, requestId } = req;

  // Skip health check pings in logs to reduce noise
  if (path === '/api/health') {
    return next();
  }

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { statusCode } = res;
    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';

    const logLine = [
      `[${new Date().toISOString()}]`,
      `${level}`,
      `${method} ${path}`,
      `${statusCode}`,
      `${duration}ms`,
      `[${requestId}]`,
    ].join(' ');

    if (statusCode >= 500) {
      console.error(logLine);
    } else if (statusCode >= 400) {
      console.warn(logLine);
    } else if (process.env.NODE_ENV === 'development') {
      console.log(logLine);
    }
    // In production, only log 4xx/5xx; 2xx are silent
  });

  next();
});

// ─── Routes ─────────────────────────────────────────────────────

app.use('/api/videos', generationRateLimiter, videoRoutes);
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/assets', uploadRateLimiter, assetRoutes);
app.use('/api/timelines', timelineRoutes);
app.use('/api/analytics', analyticsRoutes); // Phase 11
app.use('/api/exports', exportRoutes); // Phase 8
app.use('/api/preview', previewRoutes); // Phase 5: Video preview generation

// ─── Health Check ──────────────────────────────────────────────

app.get('/api/health', async (_req, res) => {
  const dbConnected = await testConnection();
  const failoverHealth = getFailoverHealth();
  const keyStats = getPoolStats();
  const webhookHealth = getWebhookHealth();

  res.json({
    status: dbConnected ? 'ok' : 'degraded',
    service: 'movieanimation-backend',
    version: '1.7.0',
    phase: 7,  // Phase 7: Polish
    features: [
      // Phase 2
      'user-registration',
      'user-login',
      'jwt-authentication',
      'bcrypt-password-hashing',
      'protected-routes',
      'user-dashboard',
      // Phase 6
      'multi-api-video-generation',
      'smart-api-router',
      'scene-to-prompt-engineering',
      'character-face-injection',
      'batch-generation-queue',
      'real-time-progress-tracking',
      'cost-tracking',
      'api-key-rotation',
      'cross-api-failover',
      'circuit-breaker',
      'webhook-manager',
      // Phase 3
      'script-crud',
      'ai-script-parsing',
      'character-management',
      'asset-upload',
      'asset-library',
      // Phase 7
      'timeline-editor',
      'video-assembly-ffmpeg',
      'clip-sequencing',
      'transition-support',
      // Phase 11
      'security-headers-helmet',
      'response-compression',
      'rate-limiting',
      'request-id-tracking',
      'enhanced-error-handling',
      'analytics-tracking',
      'usage-metrics',
      'cost-monitoring',
      'dau-trends',
      'api-caching',
      // Phase 7 (Polish)
      'etag-conditional-requests',
      'static-asset-caching',
      'cdn-cache-headers',
      'enhanced-dashboard',
      'cost-tracking-ui',
      'frontend-error-boundary',
      'toast-notifications',
      'loading-skeletons',
      'refined-ui-ux',
      // Phase 5
      'video-preview-generation',
      'low-res-proxy-videos',
      'clip-thumbnails',
      'contact-sheets',
      'frame-strip-extraction',
      'scene-clip-management',
      // Phase 8
      'final-rendering-pipeline',
      'ffmpeg-export-engine',
      'multi-resolution-export',
      'multi-format-export',
      'shareable-download-links',
      'password-protected-sharing',
      'export-queue-management',
    ],
    database: dbConnected ? 'connected' : 'disconnected',
    apis: {
      available: failoverHealth.availableApis,
      degraded: failoverHealth.degradedApis,
      unavailable: failoverHealth.unavailableApis,
    },
    apiKeys: keyStats,
    webhooks: webhookHealth,
    endpointPrefix: '/api',
    timestamp: new Date().toISOString(),
  });
});

// ─── Phase 11: Error Handling ──────────────────────────────────

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last middleware)
app.use(globalErrorHandler);

// ─── Process-Level Error Handling ─────────────────────────────

process.on('uncaughtException', (error: Error) => {
  console.error(`[FATAL] Uncaught Exception: ${error.message}`);
  console.error(error.stack);
  // Give logging time to flush, then exit
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error(`[FATAL] Unhandled Rejection at:`, promise);
  console.error(`[FATAL] Reason:`, reason instanceof Error ? reason.message : reason);
  if (reason instanceof Error) {
    console.error(reason.stack);
  }
  // Don't exit — unhandled rejections may be recoverable in Node 16+
});

// Warn on memory pressure
process.on('warning', (warning: Error) => {
  if (warning.name === 'MaxListenersExceededWarning') {
    console.warn(`[WARN] MaxListenersExceeded: ${warning.message}`);
  }
});

// ─── Start Server ──────────────────────────────────────────────

const server = app.listen(PORT, async () => {
  console.log(`\n🎬 MovieAnimation Backend v1.7.0`);
  console.log(`🔐 Phase 2: Authentication — READY`);
  console.log(`🎞️  Phase 5: Video Previews — READY`);
  console.log(`🎥 Phase 6: Video Generation — READY`);
  console.log(`✂️  Phase 7: Video Assembly + Polish — READY`);
  console.log(`📦 Phase 8: Export Pipeline — READY`);
  console.log(`🚀 Phase 11: Beta Testing — READY`);
  console.log(`\n🛡️  Security: Helmet + Rate Limiting + CORS`);
  console.log(`📊 Analytics: Usage tracking + Cost monitoring`);
  console.log(`⚡ Performance: ETags + Response caching + Static asset caching`);
  console.log(`🎨 UI: Enhanced dashboard + Cost tracking + Error boundaries`);
  console.log(`🔄 Redis: BullMQ job queue ready`);
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`📊 Analytics: http://localhost:${PORT}/api/analytics`);
  console.log(`🎞️  Previews: http://localhost:${PORT}/api/preview`);
  console.log(`📦 Exports: http://localhost:${PORT}/api/exports`);
  console.log(`\n`);

  // Test Redis connection
  try {
    const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { 
      maxRetriesPerRequest: 2, 
      connectTimeout: 5000 
    });
    await redis.ping();
    await redis.quit();
    console.log('✅ Redis: Connected — BullMQ job queues ready');
  } catch (err) {
    console.warn('⚠️  Redis: Connection failed — job queues will retry when available');
  }

  // Initialize analytics table
  try {
    await ensureAnalyticsTable();
    console.log('✅ Analytics: Events table ready');
  } catch (err) {
    console.warn('⚠️  Analytics: Could not create events table (DB may be unavailable)');
  }

  // Test database connection
  const dbOk = await testConnection();
  if (dbOk) {
    console.log('✅ PostgreSQL: Connected to movieanimation database');
  } else {
    console.warn('⚠️  PostgreSQL: Connection failed — running in degraded mode');
  }
});

// ─── Graceful Shutdown ──────────────────────────────────────────

async function shutdown() {
  console.log('\n🛑 Shutting down gracefully...');
  server.close();
  await closePool();
  await closeQueues();
  await closeExportQueue();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
