#!/usr/bin/env bash
# Logical backup of the Dhoblio database (custom format, compressed). Usage: ops/backup/backup.sh [output-dir]
# Runs against the compose Postgres by default. For a managed database set PGHOST/PGUSER/PGPASSWORD/PGDATABASE and
# BACKUP_MODE=direct. Keep the files off the database host (object storage, another region) and encrypt them at rest.
set -euo pipefail

OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/dhoblio-$STAMP.dump"
mkdir -p "$OUT_DIR"

if [ "${BACKUP_MODE:-compose}" = "direct" ]; then
  pg_dump --format=custom --compress=6 --no-owner --file "$FILE"
else
  docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-dhoblio}" -d "${POSTGRES_DB:-dhoblio}" --format=custom --compress=6 --no-owner > "$FILE"
fi

# A dump that cannot be listed is not a backup.
if [ "${BACKUP_MODE:-compose}" = "direct" ]; then
  pg_restore --list "$FILE" > /dev/null
else
  docker compose exec -T postgres pg_restore --list < "$FILE" > /dev/null
fi

SIZE=$(wc -c < "$FILE")
echo "backup ok: $FILE ($SIZE bytes)"
# Keep the newest N (default 14) files in the folder.
KEEP="${BACKUP_KEEP:-14}"
ls -1t "$OUT_DIR"/dhoblio-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
