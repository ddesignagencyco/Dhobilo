#!/usr/bin/env bash
# Samples what a load test costs while it runs: CPU and memory of the containers, the API/worker processes, database
# connections and queue depth. Writes one line per interval. Usage: ops/perf/watch.sh [seconds=10] [samples=0 (forever)] > out.log
cd "$(dirname "$0")/../.."
INTERVAL="${1:-10}"
SAMPLES="${2:-0}"
DB="${PERF_DB:-dhoblio_perf}"
n=0
while true; do
  ts=$(date -u +%H:%M:%S)
  docker_stats=$(docker stats --no-stream --format '{{.Name}}={{.CPUPerc}}/{{.MemUsage}}' dhoblio-postgres dhoblio-redis 2>/dev/null | sed 's# / #/#' | tr '\n' ' ')
  conns=$(docker exec dhoblio-postgres psql -U dhoblio -d postgres -At -c "select count(*) from pg_stat_activity where datname='$DB'" 2>/dev/null)
  queued=$(docker exec dhoblio-redis redis-cli -n "${PERF_REDIS_DB:-2}" eval "local n=0 for _,k in ipairs(redis.call('keys','bull:*:wait')) do n=n+redis.call('llen',k) end return n" 0 2>/dev/null)
  api_pid=$(cat ops/perf/out/api.pid 2>/dev/null)
  api_mem=$(powershell.exe -NoProfile -Command "try{[math]::Round((Get-Process -Id (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'dist.main.js' } | Select-Object -First 1).ProcessId).WorkingSet64/1MB)}catch{''}" 2>/dev/null | tr -d '\r')
  echo "$ts  $docker_stats db_conns=$conns queue_waiting=${queued:-0} api_rss_mb=${api_mem:-?}"
  n=$((n + 1))
  [ "$SAMPLES" != "0" ] && [ "$n" -ge "$SAMPLES" ] && break
  sleep "$INTERVAL"
done
