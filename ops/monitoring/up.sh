#!/usr/bin/env bash
# Starts Prometheus/Alertmanager/blackbox against an API on :4000. Reads METRICS_TOKEN and SMTP_* from the root .env.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
: "${METRICS_TOKEN:?Set METRICS_TOKEN (16+ chars) in .env and restart the API first}"
printf '%s' "$METRICS_TOKEN" > ops/monitoring/.metrics-token
sed -e "s|__ALERT_EMAIL_TO__|${ALERT_EMAIL_TO:-${SMTP_USER:-}}|" -e "s|__SMTP_FROM__|${SMTP_USER:-}|" \
    -e "s|__SMTP_HOST__|${SMTP_HOST:-smtp.gmail.com}|" -e "s|__SMTP_PORT__|${SMTP_PORT:-465}|" \
    -e "s|__SMTP_USER__|${SMTP_USER:-}|" -e "s|__SMTP_PASS__|${SMTP_PASS:-}|" \
    ops/monitoring/alertmanager.tmpl.yml > ops/monitoring/.alertmanager.yml
chmod 600 ops/monitoring/.metrics-token ops/monitoring/.alertmanager.yml
docker compose -p dhoblio-monitoring -f docker-compose.monitoring.yml up -d
echo "Prometheus http://localhost:9091  Alertmanager http://localhost:9094  Probe http://localhost:9116"
