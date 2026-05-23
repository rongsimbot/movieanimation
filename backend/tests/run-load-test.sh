#!/usr/bin/env bash
# run-load-test.sh - Quick-start script for MovieAnimation load testing
# Phase 11: Beta Testing
#
# Usage:
#   ./tests/run-load-test.sh             # Default (localhost:3001, warmup+steady only)
#   ./tests/run-load-test.sh full        # All phases including spike
#   BASE_URL=http://192.168.1.139:8084 ./tests/run-load-test.sh  # Against remote server
#   ./tests/run-load-test.sh k6          # Use k6 instead of Artillery (requires k6 installed)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
BASE_URL="${BASE_URL:-http://localhost:3001}"
MODE="${1:-default}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║   MovieAnimation Beta - Load Test Runner            ║"
echo "║   Phase 11: Beta Testing                           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Target:  ${BASE_URL}"
echo "  Mode:    ${MODE}"
echo ""

# ─── Health Check (pre-flight) ──────────────────────────────────

echo "🏥 Pre-flight health check..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null || echo "000")

if [ "$HEALTH_RESPONSE" = "000" ]; then
  echo "❌  Target ${BASE_URL} is not reachable"
  echo ""
  echo "   Make sure the backend is running:"
  echo "     cd ${BACKEND_DIR} && npm run dev"
  echo ""
  exit 1
fi

echo "✅  Health check: HTTP ${HEALTH_RESPONSE}"
echo ""

# ─── Artillery Load Test ───────────────────────────────────────

run_artillery() {
  local PHASE_ARGS="$1"

  echo "🎯 Running Artillery load test..."

  # Check if Artillery is installed
  if ! npx artillery --version &>/dev/null; then
    echo "📦 Installing Artillery..."
    cd "$BACKEND_DIR" && npm install --save-dev artillery
  fi

  echo ""
  echo "▶️  Starting test (Ctrl+C to stop early)..."
  echo ""

  cd "$BACKEND_DIR"

  # Run with specified phases
  if [ "$PHASE_ARGS" = "full" ]; then
    npx artillery run \
      --target "$BASE_URL" \
      --output "${SCRIPT_DIR}/load-test-results.json" \
      "${SCRIPT_DIR}/load-test.yml"
  else
    # Default: only warmup + steady phases (skip spike)
    npx artillery run \
      --target "$BASE_URL" \
      --output "${SCRIPT_DIR}/load-test-results.json" \
      --overrides '{"config":{"phases":[{"name":"warmup","duration":60,"arrivalRate":1,"rampTo":5},{"name":"steady","duration":120,"arrivalRate":5}]}}' \
      "${SCRIPT_DIR}/load-test.yml"
  fi

  local EXIT_CODE=$?

  echo ""
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Load test completed successfully"
  else
    echo "⚠️  Load test completed with failures (exit code: $EXIT_CODE)"
  fi

  # Generate HTML report if artillery report is available
  if [ -f "${SCRIPT_DIR}/load-test-results.json" ]; then
    echo ""
    echo "📊 Generating HTML report..."
    npx artillery report "${SCRIPT_DIR}/load-test-results.json" --output "${SCRIPT_DIR}/load-test-report.html" 2>/dev/null || true
    if [ -f "${SCRIPT_DIR}/load-test-report.html" ]; then
      echo "📄 Report saved: tests/load-test-report.html"
    fi
  fi

  return $EXIT_CODE
}

# ─── k6 Load Test (Alternative) ─────────────────────────────────

run_k6() {
  echo "🎯 Running k6 load test..."

  if ! command -v k6 &>/dev/null; then
    echo "❌  k6 is not installed"
    echo "   Install: https://k6.io/docs/get-started/installation/"
    echo "   Or use: ./tests/run-load-test.sh (uses Artillery)"
    exit 1
  fi

  # Generate k6 script on-the-fly
  local K6_SCRIPT="${SCRIPT_DIR}/k6-test.js"

  cat > "$K6_SCRIPT" << 'K6EOF'
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Custom metrics
const healthCheckDuration = new Trend('health_check_duration');
const authDuration = new Trend('auth_duration');
const apiDuration = new Trend('api_duration');
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Ramp up
    { duration: '1m',  target: 10 },  // Steady
    { duration: '30s', target: 20 },  // Spike
    { duration: '30s', target: 0 },   // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    errors: ['rate<0.05'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  // Health check
  group('Health', () => {
    const res = http.get(`${BASE_URL}/api/health`);
    healthCheckDuration.add(res.timings.duration);
    const ok = check(res, {
      'health status 200': (r) => r.status === 200,
      'health has status field': (r) => r.json('status') !== undefined,
    });
    errorRate.add(!ok);
  });

  sleep(1);

  // Register new user
  group('Register', () => {
    const email = `k6_${Date.now()}_${__VU}@test.ai`;
    const payload = JSON.stringify({
      name: `K6 Tester ${__VU}`,
      email: email,
      password: 'TestPass123!',
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const res = http.post(`${BASE_URL}/api/auth/register`, payload, params);
    authDuration.add(res.timings.duration);
    const ok = check(res, {
      'register status 201': (r) => r.status === 201,
      'register has tokens': (r) => r.json('tokens') !== undefined,
    });
    errorRate.add(!ok);
  });

  sleep(2);

  // API info
  group('API Info', () => {
    const res = http.get(`${BASE_URL}/api/info`);
    apiDuration.add(res.timings.duration);
    const ok = check(res, {
      'info status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(1);

  // Status endpoint
  group('Status', () => {
    const res = http.get(`${BASE_URL}/api/status`);
    apiDuration.add(res.timings.duration);
    const ok = check(res, {
      'status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(2);
}

export function teardown() {
  console.log('Load test completed. Check thresholds above.');
}
K6EOF

  k6 run "$K6_SCRIPT"
  local EXIT_CODE=$?

  # Cleanup generated script
  rm -f "$K6_SCRIPT"

  return $EXIT_CODE
}

# ─── Main ───────────────────────────────────────────────────────

case "$MODE" in
  k6)
    run_k6
    ;;
  full|default)
    run_artillery "$MODE"
    ;;
  *)
    echo "Usage: $0 [default|full|k6]"
    echo ""
    echo "  default  - Warmup + steady phases (light load)"
    echo "  full     - All phases including spike (stress test)"
    echo "  k6       - Use k6 instead of Artillery"
    exit 1
    ;;
esac

echo ""
echo "✅ Load testing complete"
echo ""
echo "📊 Review results:"
echo "   Artillery JSON: tests/load-test-results.json"
echo "   Artillery HTML: tests/load-test-report.html"
echo ""
echo "💡 Tips:"
echo "   - Check backend logs for any errors during the test"
echo "   - Monitor CPU/memory with: htop"
echo "   - Check DB connection pool: look for 'timeout' or 'pool exhausted' in logs"
