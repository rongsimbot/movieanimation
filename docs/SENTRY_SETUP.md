# ═════════════════════════════════════════════════════════
# MovieAnimation.ai — Sentry Error Monitoring Setup
# ═════════════════════════════════════════════════════════
# Install:
#   cd backend && npm install @sentry/node @sentry/profiling-node
#   cd frontend && npm install @sentry/nextjs
#
# Create account at https://sentry.io (free tier: 5K errors/month)

# ═════════════════════════════════════════════════════════
# BACKEND: backend/src/instrument.ts
# ═════════════════════════════════════════════════════════
# Create this file and import it at the VERY TOP of src/index.ts:
#   import './instrument';  // Must be first import
#
# Content of backend/src/instrument.ts:
"""
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  release: 'movieanimation-backend@' + (process.env.npm_package_version || '1.0.0'),
  
  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Error filtering
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection',
  ],
  
  // Source maps
  includeLocalVariables: true,
});

export { Sentry };
"""

# ═════════════════════════════════════════════════════════
# BACKEND: Error handler integration
# ═════════════════════════════════════════════════════════
# Add to backend/src/index.ts after app initialization:
"""
import { Sentry } from './instrument';

// Sentry request handler (before routes)
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// ... your routes here ...

// Sentry error handler (after routes, before other error handlers)
app.use(Sentry.Handlers.errorHandler());
"""

# ═════════════════════════════════════════════════════════
# FRONTEND: next.config.ts
# ═════════════════════════════════════════════════════════
# Already configured when using @sentry/nextjs via:
# npx @sentry/wizard@latest -i nextjs
#
# Or manually add to next.config.ts:
"""
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  // ... existing config
};

export default withSentryConfig(nextConfig, {
  org: 'simrobotics',
  project: 'movieanimation-frontend',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
"""

# ═════════════════════════════════════════════════════════
# Environment Variables (add to .env.production)
# ═════════════════════════════════════════════════════════
# SENTRY_DSN=https://xxxxxxxxxxxxxxxxxxxxxxxxxxxx@oxxxxxx.ingest.us.sentry.io/xxxxxxx
# SENTRY_AUTH_TOKEN=sntrys_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# SENTRY_ORG=simrobotics

# ═════════════════════════════════════════════════════════
# Setup Checklist
# ═════════════════════════════════════════════════════════
# [ ] Create free Sentry account at https://sentry.io
# [ ] Create "movieanimation-backend" project in Sentry
# [ ] Create "movieanimation-frontend" project in Sentry
# [ ] Copy DSNs to .env.production
# [ ] Import instrument.ts in backend/src/index.ts (FIRST LINE)
# [ ] Run: cd backend && npm install @sentry/node @sentry/profiling-node
# [ ] Run: cd frontend && npx @sentry/wizard@latest -i nextjs
# [ ] Deploy and verify: trigger a test error
# [ ] Set up alert rules in Sentry for production issues
# [ ] Configure Slack/Discord integration for alerts
