#!/usr/bin/env bash
# Restores a dump into a NEW database (never over the live one). Usage: ops/backup/restore.sh <dump-file> [target-db]
# To go live with the restored copy, point DATABASE_URL at the new database (or rename databases while the API is stopped).
set -euo pipefail

FILE="${1:?usage: restore.sh <dump-file> [target-db]}"
TARGET="${2:-dhoblio_restore}"
USER_="${POSTGRES_USER:-dhoblio}"

if [ "$TARGET" = "${POSTGRES_DB:-dhoblio}" ]; then
  echo "refusing to restore over the live database '$TARGET'" >&2
  exit 1
fi

docker compose exec -T postgres psql -U "$USER_" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TARGET\"" -c "CREATE DATABASE \"$TARGET\""
docker compose exec -T postgres pg_restore -U "$USER_" -d "$TARGET" --no-owner --exit-on-error < "$FILE"
echo "restored into database '$TARGET'"
