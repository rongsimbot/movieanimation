# Load Testing — MovieAnimation.ai

Powered by [k6](https://k6.io/) — modern, developer-friendly load testing.

## Prerequisites

```bash
# Install k6
sudo apt-get install k6        # Linux (APT)
brew install k6                 # macOS
winget install k6               # Windows
```

Or use Docker:
```bash
docker pull grafana/k6
```

## Quick Start

```bash
cd tools/loadtest

# Smoke test (quick sanity check)
k6 run --vus 5 --duration 30s k6-test.js

# Full load test (uses built-in ramping scenario)
k6 run k6-test.js

# Custom VU count
k6 run --vus 20 --duration 5m k6-test.js

# With custom base URL
BASE_URL=https://staging.movieanimation.ai k6 run k6-test.js
```

## Test Scenarios

| Scenario | VUs | Duration | Purpose |
|----------|-----|----------|---------|
| `smoke` | 5 | 30s | Quick sanity check after deploy |
| `load` | 20 | 5m | Typical beta traffic simulation |
| `stress` | 50 | 10m | Find breaking points |
| `soak` | 15 | 30m | Memory leak / degradation detection |

## Docker Usage

```bash
# Smoke test
docker run --rm --network host -v $(pwd):/scripts \
  grafana/k6 run /scripts/k6-test.js

# With environment variables
docker run --rm --network host -v $(pwd):/scripts \
  -e BASE_URL=http://host.docker.internal:3001 \
  -e TEST_EMAIL=test@movieanimation.ai \
  -e TEST_PASSWORD=testpass123 \
  grafana/k6 run /scripts/k6-test.js
```

## Results

Results are saved to `tools/loadtest/results/`:
- `summary.json` — Machine-readable summary
- `summary.html` — Human-readable report

## Pre-Test Checklist

1. ✅ Test user registered: `test@movieanimation.ai`
2. ✅ Backend running on target environment
3. ✅ Database connected (PostgreSQL)
4. ⚠️ Avoid running load tests against production during peak hours
5. ⚠️ Alert the team before stress testing
