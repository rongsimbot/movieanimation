/**
 * k6 Load Testing Script - MovieAnimation.ai
 * Phase 11: Beta Testing — Concurrent User Load Testing
 *
 * Usage:
 *   k6 run --vus 10 --duration 60s tools/loadtest/k6-test.js
 *   k6 run --vus 50 --duration 5m tools/loadtest/k6-test.js
 *
 * Scenarios:
 *   - smoke:  5 VUs, 1m   (quick sanity check)
 *   - load:   20 VUs, 5m  (typical beta load)
 *   - stress: 50 VUs, 10m (breakpoint finding)
 *   - soak:   15 VUs, 30m (memory leak detection)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Configuration ────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`;

// Custom metrics
const errorRate = new Rate('errors');
const apiResponseTime = new Trend('api_response_time', true);
const pageViews = new Counter('page_views');
const authFailures = new Counter('auth_failures');

// Test user (must be pre-registered)
const TEST_USER = {
  email: __ENV.TEST_EMAIL || 'test@movieanimation.ai',
  password: __ENV.TEST_PASSWORD || 'testpass123',
};

// ─── k6 Options ───────────────────────────────────────────────────

export const options = {
  // Default thresholds
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.10'],    // Less than 10% failure rate
    errors: ['rate<0.05'],             // Less than 5% custom errors
  },

  // Scenarios for different test types
  scenarios: {
    // Main load test scenario
    api_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 5 },   // Ramp up to 5 users
        { duration: '1m', target: 10 },   // Ramp up to 10 users
        { duration: '1m', target: 10 },   // Stay at 10 users
        { duration: '30s', target: 0 },   // Ramp down
      ],
      exec: 'loadTest',
    },

    // Background page view tracking
    analytics_tracking: {
      executor: 'constant-arrival-rate',
      rate: 5,                    // 5 requests per second
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 2,
      exec: 'analyticsTracking',
    },
  },
};

// ─── Helper Functions ─────────────────────────────────────────────

let authToken = null;

function authenticate() {
  if (authToken) return authToken;

  const res = http.post(`${API_URL}/auth/login`, JSON.stringify(TEST_USER), {
    headers: { 'Content-Type': 'application/json' },
  });

  const success = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has token': (r) => r.json('tokens.accessToken') !== undefined,
  });

  if (success) {
    authToken = res.json('tokens.accessToken');
    return authToken;
  } else {
    authFailures.add(1);
    console.error(`Login failed: ${res.status} ${res.body}`);
    return null;
  }
}

function authHeaders() {
  const token = authenticate();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

// ─── Test Functions ───────────────────────────────────────────────

/** Main load test — simulates typical user workflow */
export function loadTest() {
  const token = authenticate();
  if (!token) return;

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  group('Health Check', () => {
    const start = Date.now();
    const res = http.get(`${API_URL}/health`);
    apiResponseTime.add(Date.now() - start);
    check(res, { 'health OK': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
  });

  group('Dashboard', () => {
    const start = Date.now();
    const res = http.get(`${API_URL}/users/dashboard`, { headers });
    apiResponseTime.add(Date.now() - start);
    check(res, { 'dashboard OK': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
  });

  group('Scripts List', () => {
    const start = Date.now();
    const res = http.get(`${API_URL}/scripts`, { headers });
    apiResponseTime.add(Date.now() - start);
    check(res, { 'scripts OK': (r) => r.status === 200 || r.status === 404 });
    errorRate.add(res.status >= 500);
  });

  group('Analytics', () => {
    const start = Date.now();
    const res = http.get(`${API_URL}/analytics/usage`, { headers });
    apiResponseTime.add(Date.now() - start);
    check(res, { 'analytics OK': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

    const dauRes = http.get(`${API_URL}/analytics/dau?days=7`, { headers });
    check(dauRes, { 'DAU OK': (r) => r.status === 200 });
    errorRate.add(dauRes.status !== 200);
  });

  group('Cost Metrics', () => {
    const res = http.get(`${API_URL}/analytics/costs`, { headers });
    check(res, { 'costs OK': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
  });

  sleep(1 + Math.random() * 2); // Simulate user think time
}

/** Background analytics tracking */
export function analyticsTracking() {
  const token = authenticate();
  if (!token) return;

  const pages = ['/dashboard', '/dashboard/costs', '/help', '/project/1', '/project/1/script'];
  const page = pages[Math.floor(Math.random() * pages.length)];

  const res = http.post(`${API_URL}/analytics/pageview`, JSON.stringify({
    page,
    referrer: Math.random() > 0.5 ? '/dashboard' : null,
  }), {
    headers: authHeaders(),
  });

  errorRate.add(res.status !== 202);
  if (res.status === 202) pageViews.add(1);

  sleep(0.2 + Math.random() * 0.5);
}

// ─── Smoke Test (quick sanity) ───────────────────────────────────

export function smokeTest() {
  const res = http.get(`${API_URL}/health`);
  check(res, { 'smoke: health OK': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);

  const testRes = http.post(`${API_URL}/auth/login`, JSON.stringify(TEST_USER), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(testRes, { 'smoke: login OK': (r) => r.status === 200 });
  errorRate.add(testRes.status !== 200);
}

// ─── Summary ──────────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    totalRequests: data.metrics.http_reqs?.values?.count || 0,
    failedRequests: data.metrics.http_req_failed?.values?.rate || 0,
    avgResponseTime: data.metrics.http_req_duration?.values?.avg || 0,
    p95ResponseTime: data.metrics.http_req_duration?.values['p(95)'] || 0,
    p99ResponseTime: data.metrics.http_req_duration?.values['p(99)'] || 0,
    errorRate: data.metrics.errors?.values?.rate || 0,
    pageViews: data.metrics.page_views?.values?.count || 0,
    authFailures: data.metrics.auth_failures?.values?.count || 0,
    peakVUs: data.metrics.vus_max?.values?.value || 0,
    testDuration: data.state?.testRunDurationMs || 0,
    checks: data.root_group?.checks?.length || 0,
  };

  return {
    'stdout': `\n📊 Load Test Summary\n${JSON.stringify(summary, null, 2)}\n`,
    'tools/loadtest/results/summary.json': JSON.stringify(summary, null, 2),
    'tools/loadtest/results/summary.html': generateHtmlReport(data, summary),
  };
}

function generateHtmlReport(data, summary) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MovieAnimation Load Test</title>
<style>body{font-family:system-ui;max-width:800px;margin:2rem auto;padding:0 1rem;background:#111;color:#eee}
h1{color:#a78bfa}.card{background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:1rem 1.5rem;margin:1rem 0}
.metric{display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #222}
.metric:last-child{border-bottom:none}.value{font-weight:bold;color:#a78bfa}
.pass{color:#4ade80}.warn{color:#fbbf24}.fail{color:#f87171}</style></head>
<body><h1>🎬 MovieAnimation Load Test Report</h1>
<div class="card"><h2>Summary</h2>
<div class="metric"><span>Timestamp</span><span class="value">${summary.timestamp}</span></div>
<div class="metric"><span>Total Requests</span><span class="value">${summary.totalRequests}</span></div>
<div class="metric"><span>Failed Rate</span><span class="value ${summary.failedRequests > 0.1 ? 'fail' : 'pass'}">${(summary.failedRequests * 100).toFixed(1)}%</span></div>
<div class="metric"><span>Avg Response Time</span><span class="value">${summary.avgResponseTime.toFixed(0)}ms</span></div>
<div class="metric"><span>P95 Response Time</span><span class="value ${summary.p95ResponseTime > 2000 ? 'warn' : 'pass'}">${summary.p95ResponseTime.toFixed(0)}ms</span></div>
<div class="metric"><span>P99 Response Time</span><span class="value">${summary.p99ResponseTime.toFixed(0)}ms</span></div>
<div class="metric"><span>Peak VUs</span><span class="value">${summary.peakVUs}</span></div>
<div class="metric"><span>Page Views</span><span class="value">${summary.pageViews}</span></div>
</div></body></html>`;
}
