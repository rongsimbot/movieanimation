/**
 * index.ts - MovieAnimation Backend Server Entry Point
 * Phase 2: User Authentication (COMPLETED)
 * Phase 6: Full API integration with Sora, Runway, Seedance
 * Phase 7: Video Assembly (COMPLETED)
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
import { testConnection, closePool } from './config/database';
import { closeQueues } from './queue/videoQueue';
import { getFailoverHealth } from './services/apiFailover';
import { getPoolStats } from './services/keyManager';
import { getWebhookHealth } from './services/webhookManager';
import { ensureAnalyticsTable } from './services/analyticsService';
import { requestIdMiddleware, globalErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimiter, authRateLimiter, uploadRateLimiter, generationRateLimiter } from './middleware/rateLimiter';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Phase 11: Security & Performance Middleware ─────────────────

// Helmet security headers (XSS protection, HSTS, no sniff, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin for asset serving
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

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    if (req.path !== '/api/health') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} [${req.requestId}]`);
    }
    next();
  });
}

// ─── Routes ─────────────────────────────────────────────────────

app.use('/api/videos', generationRateLimiter, videoRoutes);
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/assets', uploadRateLimiter, assetRoutes);
app.use('/api/timelines', timelineRoutes);
app.use('/api/analytics', analyticsRoutes); // Phase 11

// ─── Health Check ──────────────────────────────────────────────

app.get('/api/health', async (_req, res) => {
  const dbConnected = await testConnection();
  const failoverHealth = getFailoverHealth();
  const keyStats = getPoolStats();
  const webhookHealth = getWebhookHealth();

  res.json({
    status: dbConnected ? 'ok' : 'degraded',
    service: 'movieanimation-backend',
    version: '1.3.0',
    phase: 11,
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

// ─── Start Server ──────────────────────────────────────────────

const server = app.listen(PORT, async () => {
  console.log(`\n🎬 MovieAnimation Backend v1.3.0`);
  console.log(`🔐 Phase 2: Authentication — READY`);
  console.log(`🎥 Phase 6: Video Generation — READY`);
  console.log(`✂️  Phase 7: Video Assembly — READY`);
  console.log(`🚀 Phase 11: Beta Testing — READY`);
  console.log(`\n🛡️  Security: Helmet + Rate Limiting + CORS`);
  console.log(`📊 Analytics: Usage tracking + Cost monitoring`);
  console.log(`⚡ Performance: Compression + Response caching`);
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`📊 Analytics: http://localhost:${PORT}/api/analytics`);
  console.log(`\n`);

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
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
