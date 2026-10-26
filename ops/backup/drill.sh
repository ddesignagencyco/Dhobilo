#!/usr/bin/env bash
# Restore drill: back up, restore into a scratch database, and prove the copy matches (row counts of every table,
# the ledger total, the append-only guards) while timing it. Usage: ops/backup/drill.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

USER_="${POSTGRES_USER:-dhoblio}"
DB="${POSTGRES_DB:-dhoblio}"
SCRATCH="dhoblio_drill"
psql_() { docker compose exec -T postgres psql -U "$USER_" -d "$1" -At -v ON_ERROR_STOP=1 -c "$2"; }

T0=$(date +%s)
ops/backup/backup.sh ./backups > /tmp/drill-backup.log
cat /tmp/drill-backup.log
T1=$(date +%s)
DUMP=$(ls -1t ./backups/dhoblio-*.dump | head -1)
ops/backup/restore.sh "$DUMP" "$SCRATCH"
T2=$(date +%s)

counts() {
  docker compose exec -T postgres psql -U "$USER_" -d "$1" -At -c "
    SELECT string_agg(format('%s=%s', relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I', relname), false, true, '')))[1]::text), ' ' ORDER BY relname)
    FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND relname <> '_prisma_migrations'"
}
A="$(counts "$DB")"
B="$(counts "$SCRATCH")"
if [ "$A" = "$B" ]; then echo "row counts identical across $(echo "$A" | wc -w) tables"; else echo "MISMATCH"; echo "live:    $A"; echo "restore: $B"; exit 1; fi

LEDGER_A="$(psql_ "$DB" "SELECT COALESCE(SUM(amount),0) FROM \"LedgerEntry\"")"
LEDGER_B="$(psql_ "$SCRATCH" "SELECT COALESCE(SUM(amount),0) FROM \"LedgerEntry\"")"
[ "$LEDGER_A" = "$LEDGER_B" ] && echo "ledger total identical ($LEDGER_A)" || { echo "ledger mismatch $LEDGER_A vs $LEDGER_B"; exit 1; }

# The restored copy must keep the same database triggers (append-only audit trail, ledger and status history)...
TRG_A="$(psql_ "$DB" "SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE NOT tgisinternal")"
TRG_B="$(psql_ "$SCRATCH" "SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE NOT tgisinternal")"
[ "$TRG_A" = "$TRG_B" ] && echo "triggers identical ($TRG_A)" || { echo "trigger mismatch: $TRG_A vs $TRG_B"; exit 1; }
# ...and still enforce them: a ledger row cannot be deleted.
if psql_ "$SCRATCH" "DELETE FROM \"LedgerEntry\" WHERE id = (SELECT id FROM \"LedgerEntry\" LIMIT 1)" > /dev/null 2>&1; then echo "append-only guard NOT enforced after restore"; exit 1; else echo "append-only guard still enforced after restore"; fi

MIGS_A="$(psql_ "$DB" "SELECT count(*) FROM _prisma_migrations")"
MIGS_B="$(psql_ "$SCRATCH" "SELECT count(*) FROM _prisma_migrations")"
[ "$MIGS_A" = "$MIGS_B" ] && echo "migration history identical ($MIGS_A)" || { echo "migration history differs"; exit 1; }

docker compose exec -T postgres psql -U "$USER_" -d postgres -c "DROP DATABASE \"$SCRATCH\"" > /dev/null
echo "timings: backup $((T1 - T0))s, restore $((T2 - T1))s, total $(( $(date +%s) - T0 ))s"
