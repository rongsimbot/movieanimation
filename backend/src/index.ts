/**
 * index.ts - MovieAnimation Backend Server Entry Point
 * Phase 2: User Authentication (COMPLETED)
 * Phase 6: Full API integration with Sora, Runway, Seedance
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import videoRoutes from './routes/videoRoutes';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import scriptRoutes from './routes/scriptRoutes';
import characterRoutes from './routes/characterRoutes';
import assetRoutes from './routes/assetRoutes';
import { testConnection, closePool } from './config/database';
import { closeQueues } from './queue/videoQueue';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    if (req.path !== '/api/health') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });
}

// Routes
app.use('/api/videos', videoRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/assets', assetRoutes);

// Health check (auth-ready)
app.get('/api/health', async (_req, res) => {
  const dbConnected = await testConnection();
  res.json({
    status: dbConnected ? 'ok' : 'degraded',
    service: 'movieanimation-backend',
    version: '1.0.0',
    phase: 2,
    features: [
      'user-registration',        // ✅ Phase 2
      'user-login',               // ✅ Phase 2
      'jwt-authentication',       // ✅ Phase 2
      'bcrypt-password-hashing',  // ✅ Phase 2
      'protected-routes',         // ✅ Phase 2
      'user-dashboard',           // ✅ Phase 2
      'multi-api-video-generation',
      'smart-api-router',
      'scene-to-prompt-engineering',
      'character-face-injection',
      'batch-generation-queue',
      'real-time-progress-tracking',
      'cost-tracking',
      'script-crud',              // 🆕 Phase 3
      'ai-script-parsing',        // 🆕 Phase 3
      'character-management',     // 🆕 Phase 3
      'asset-upload',             // 🆕 Phase 3
      'asset-library',            // 🆕 Phase 3
    ],
    database: dbConnected ? 'connected' : 'disconnected',
    apis: ['sora', 'runway', 'seedance', 'luma'],
    endpointPrefix: '/api',
    authEndpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET  /api/auth/me',
      'PUT  /api/auth/profile',
      'DELETE /api/auth/account',
    ],
    userEndpoints: [
      'GET  /api/users/profile',
      'GET  /api/users/dashboard',
    ],
    scriptEndpoints: [
      'POST   /api/scripts',
      'GET    /api/scripts',
      'GET    /api/scripts/:id',
      'PUT    /api/scripts/:id',
      'DELETE /api/scripts/:id',
      'POST   /api/scripts/:id/parse',
      'GET    /api/scripts/:id/breakdown',
    ],
    characterEndpoints: [
      'POST   /api/characters',
      'GET    /api/characters',
      'GET    /api/characters/:id',
      'PUT    /api/characters/:id',
      'DELETE /api/characters/:id',
      'POST   /api/characters/:id/assign-image',
    ],
    assetEndpoints: [
      'POST   /api/assets/upload',
      'POST   /api/assets/upload-base64',
      'GET    /api/assets',
      'GET    /api/assets/stats',
      'GET    /api/assets/:id',
      'GET    /api/assets/:id/file',
      'PUT    /api/assets/:id',
      'DELETE /api/assets/:id',
    ],
    timestamp: new Date().toISOString(),
  });
});

// Global error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err.message);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`\n🎬 MovieAnimation Backend v1.0.0`);
  console.log(`🔐 Phase 2: Authentication — READY`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`\n🔑 Auth Endpoints:`);
  console.log(`  POST /api/auth/register — Create account`);
  console.log(`  POST /api/auth/login    — Sign in`);
  console.log(`  GET  /api/auth/me       — Current user`);
  console.log(`  PUT  /api/auth/profile  — Update profile`);
  console.log(`  DELETE /api/auth/account — Delete account`);
  console.log(`\n👤 User Endpoints:`);
  console.log(`  GET  /api/users/profile  — User profile`);
  console.log(`  GET  /api/users/dashboard — Stats & activity`);
  console.log(`\n📜 Script Endpoints (Phase 3):`);
  console.log(`  POST /api/scripts        — Create script`);
  console.log(`  GET  /api/scripts        — List scripts`);
  console.log(`  POST /api/scripts/:id/parse — AI scene breakdown`);
  console.log(`\n🎭 Character Endpoints (Phase 3):`);
  console.log(`  POST /api/characters     — Create character`);
  console.log(`  GET  /api/characters     — List characters`);
  console.log(`\n📁 Asset Endpoints (Phase 3):`);
  console.log(`  POST /api/assets/upload  — Upload files`);
  console.log(`  GET  /api/assets         — Asset library`);
  console.log(`\n`);

  // Test database connection
  const dbOk = await testConnection();
  if (dbOk) {
    console.log('✅ PostgreSQL: Connected to movieanimation database');
  } else {
    console.warn('⚠️  PostgreSQL: Connection failed — auth will not work');
  }
});

// Graceful shutdown
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
