#!/usr/bin/env bash
# Starts the API (port 4100) and the worker against the scratch performance database and Redis db 2, from the
# built code (npm run api:build first). Payments run in mock mode and logins use the test code. Stop with ops/perf/stop-perf-stack.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."

export DATABASE_URL="${PERF_DATABASE_URL:-postgresql://dhoblio:dhoblio@localhost:5432/dhoblio_perf?schema=public&connection_limit=20}"
export REDIS_URL="${PERF_REDIS_URL:-redis://localhost:6379/2}"
export PORT=4100 NODE_ENV=development OTP_BYPASS=true TRUST_PROXY=1 PAYMENTS_MODE=mock LOG_LEVEL=warn
export DB_POOL_SIZE="${DB_POOL_SIZE:-20}"
# The default per-caller backstop is meant for real users; a load test pretends to be many of them from one machine.
export RATE_LIMIT_DEFAULT_PER_MIN="${RATE_LIMIT_DEFAULT_PER_MIN:-0}"
mkdir -p ops/perf/out

node ${API_NODE_OPTS:-} --env-file=.env apps/api/dist/main.js > ops/perf/out/api.log 2>&1 &
echo $! > ops/perf/out/api.pid
node --env-file=.env apps/api/dist/worker.js > ops/perf/out/worker.log 2>&1 &
echo $! > ops/perf/out/worker.pid

for i in $(seq 1 60); do
  if curl -sf http://localhost:4100/api/v1/health/ready > /dev/null; then echo "perf stack ready on :4100"; exit 0; fi
  sleep 1
done
echo "perf stack did not become ready; see ops/perf/out/api.log" >&2
exit 1
