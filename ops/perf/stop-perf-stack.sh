#!/usr/bin/env bash
cd "$(dirname "$0")/../.."
for name in api worker; do
  f="ops/perf/out/$name.pid"
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true
  rm -f "$f"
done
echo "perf stack stopped"
