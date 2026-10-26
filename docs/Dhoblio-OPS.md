# Dhoblio — Operations & Hardening Runbook (Phase 9)

What was done for the non-functional targets in SRS §7 / TRD §18, how to run each check again, what was measured, and
what is still open. Numbers below were measured on one development PC (4 cores, 16 GB) that also ran the load
generator, Postgres, Redis and Docker: they show **relative** improvement and find bugs, they do **not** replace the
staging runs the tracker calls for (QA-9.2 to QA-9.5).

## 1. Rate limiting (BE-9.1)
- A backstop on every route: `RATE_LIMIT_DEFAULT_PER_MIN` (default 600) per signed-in user, else per IP. `0` turns it off (load tests).
- Stricter per-route limits, declared with `@RateLimit({ name, limit, windowSec, by })`:

| Route | Limit | Counted by |
|---|---|---|
| OTP request / verify (service) | 3 per phone per 10 min, 10 per IP per hour; verify per IP | phone, IP |
| Admin login | lockout after 5 failures, per-IP limit | IP |
| `POST /promos/validate` | 30 / min | user |
| `POST /auth/refresh`, `/auth/logout` | 30 / min | IP |
| `POST /payments/initiate` | 20 / 10 min | user |
| `POST /webhooks/{gateway}` | 1200 / min (signature checked as well) | IP |
| `POST /orders` | 10 / min | user |
| `POST /cart/estimate` | 120 / min | user |
| Complaints: create / message | 10 per day / 60 per hour | user |
| `POST /orders/{id}/reviews` | 30 per day | user |
| `POST /vendor/register`, `/rider/register` | 5 per day | user |
| `POST /rider/location` | 30 / min | user |
| `POST /vendor/payouts` | 10 per day | user |
| Media signing, reports, announcements, delivery code, public discovery | existing limits | user / IP |
| `/health/*` | never limited | — |

A test (`hardening.e2e-spec.ts`) lists the abuse-prone routes and fails if one loses its limit.

## 2. Headers, CORS, cookies, CSRF (BE-9.2)
- Helmet with `default-src 'none'`, `frame-ancestors 'none'`, `no-referrer`, `nosniff`, HSTS in production only; API responses are `Cache-Control: no-store`; the docs page gets its own narrow policy.
- CORS: exact origins from `CORS_ORIGINS`; **production refuses to start without exact `https://` origins (no `*`)**. Methods and headers are listed, preflight cached 10 min.
- Refresh cookie: `HttpOnly`, `Secure` (production), `SameSite=Strict`, `Path=/api/v1/auth`.
- CSRF: a cookie-based refresh/logout whose `Origin` header is not an allowed origin is refused (`403 CSRF_ORIGIN`). Requests without an `Origin` (mobile apps, scripts) and body-transport requests are unaffected.

## 3. Performance (BE-9.3, BE-9.4, QA-9.1 to QA-9.3)
**Data:** `ops/perf/seed-volume.sql` loads 500 vendors, 20,000 customers, 100,000 orders (with items, history, payments, 114k ledger entries, reviews) and `ops/perf/seed-riders.sql` 200 riders into a scratch database.
**Run:** `ops/perf/start-perf-stack.sh` (API + worker on :4100, Redis db 2) → `node ops/perf/mint-tokens.js` (long-lived test tokens; needs the signing secret, never use on a real environment) → `docker run --rm -v <repo>:/work grafana/k6 run /work/load-tests/<script>.js`. `ops/perf/watch.sh` samples CPU, connections and queue depth; `ops/perf/slow-queries.js` summarises the Postgres slow log (`log_min_duration_statement`).

**Found and fixed by profiling and the slow-query log:**
1. `Intl.DateTimeFormat` was built on every timezone calculation; slot lists do it dozens of times per request. One cached formatter per timezone: **throughput at 100 users 33 → 61 iterations/s, p95 1.1–1.7 s → 0.46 s**.
2. Every order in a city incremented one counter row at the *start* of its transaction, so all orders of a city queued behind a row lock for the whole placement (average 350 ms, worst 5.4 s, transaction timeouts → 500). The number is now taken as the last step: average ~135 ms under the same saturation, orders placed per run roughly tripled, no timeouts. Failed placements still do not burn a number (existing test).
3. A database timeout/pool exhaustion/write conflict used to surface as `500`. It is now `503 SERVICE_BUSY` with `Retry-After: 2` (orders are idempotent, so a retry is safe).

**Measured, 200 virtual users, 1 min ramp + 3 min hold, one laptop (after the fixes):** vendors p95 486 ms, catalog 624 ms, slots 639 ms (all inside the 800 ms budget); estimate p95 928 ms and order status 886 ms (slightly over); `POST /orders` p95 2.8 s against the 1.5 s budget, with Postgres using about one core and the worker queue backing up (~800 jobs) because the worker shares the same four cores. **Not met on this machine; must be re-run on staging hardware before sign-off.** The remaining top statements are the city counter (~135 ms under saturation), `COMMIT` (~65 ms), the vendor row lock during placement (~260 ms) and the discovery search (~90 ms, a haversine over the city's vendors).

**Not run yet:** `vendor-board.js`, `rider-dispatch.js` (scripts written and syntax-checked against the same data), `stress.js`, `soak.js`, `webhook-burst.js`; full `EXPLAIN ANALYZE` pass over discovery, order list, vendor board and ledger; the 2–4 h soak. Commands: `k6 run load-tests/soak.js` with `DURATION=3h` plus `ops/perf/watch.sh 60 > soak.log`.
Index added: `Order(deliveredAt)`, `AuditLog(createdAt)`, `AuditLog(action, createdAt)` (Phase 8).

**Connection pool (BE-9.4):** `DB_POOL_SIZE` (default 10) and `DB_POOL_TIMEOUT_SEC` are applied to the Prisma URL unless the URL already sets `connection_limit` / `pool_timeout`. Sizing rule: `replicas × DB_POOL_SIZE ≤ 0.8 × max_connections`, leaving room for the worker and migrations. BullMQ uses its own Redis connections per queue; keep Redis `maxclients` above `(queues × 3) × processes`.

## 4. Data protection and retention (BE-9.5)
- Field-level AES-GCM for CNIC (existing), log redaction tested (existing), CNIC reveal audited (existing), no card data stored.
- Retention job (`maintenance` queue, 03:30 PKT daily): login codes 2 d, sessions 30 d after expiry/revoke, delivered/failed notification log 180 d, courier webhook payloads 90 d, report files 7 d. Orders, payments, the ledger, the audit log, complaints and reviews are never purged. All windows are env settings (`RETENTION_*`).
- **Open:** a customer-initiated account-deletion flow and the legal retention periods for orders/payments (SBP, PTA) need a decision from the business/legal.

## 5. Backups and restore (BE-9.6)
- `ops/backup/backup.sh` (logical dump, verified readable), `restore.sh` (into a **new** database, refuses to overwrite the live one), `drill.sh` (backup → restore → compare).
- **Drill result (100,000-order database, 40 tables):** dump 37 MB; backup 7 s; restore 10 s; row counts identical in every table; ledger total identical; the 3 append-only triggers identical and still enforced; migration history identical.
- **Targets (proposed):** RPO ≤ 5 minutes with managed point-in-time recovery (WAL archiving), ≤ 24 hours with only the nightly logical dump; RTO ≤ 1 hour (restore ≈ minutes at pilot size; DNS/connection-string switch and verification dominate). **PITR itself could not be drilled here** — it needs the managed Postgres service; do it in staging and record the actual RTO/RPO.
- Keep dumps off the database host (object storage in another region), encrypted, with a retention (default keep 14).

## 6. Zero-downtime deploys and failover (BE-9.7)
- Graceful shutdown: on SIGTERM the API reports `/health/ready` = 503 for `SHUTDOWN_DRAIN_MS` (set 3000+ behind a load balancer), then finishes in-flight requests and closes. Workers close their queues cleanly.
- `docker-compose.ha.yml` + `docker/nginx.ha.conf`: two API replicas behind nginx on :8080. **Test result:** restarting each replica in turn under constant traffic through the balancer: 300 of 300 requests succeeded, none failed. After *recreating* a container (new image) run `docker exec dhoblio-lb nginx -s reload`.
- Production: ≥ 2 replicas behind the cloud load balancer with the readiness probe on `/api/v1/health/ready`, `TRUST_PROXY` = number of proxy hops, rolling deploys one replica at a time.

## 7. Queue resilience (BE-9.9)
- `maintenance` queue checks every queue each minute: failed jobs ≥ `QUEUE_ALERT_FAILED` (10), backlog ≥ `QUEUE_ALERT_WAITING` (1000), a job active longer than `QUEUE_ALERT_STUCK_MIN` (15). Alerts go to the log and `OPS_ALERT_EMAIL`, once per `QUEUE_ALERT_COOLDOWN_MIN` per problem.
- Admin: `GET /admin/queues` (counts, stuck, latest failures) and `POST /admin/queues/{name}/retry-failed` (audited). Jobs that exhaust their retries stay in the failed set (last 5000) as the dead-letter store; handlers are idempotent so a retry is safe.

## 8. Security scanning (BE-9.8, OPS-9.2)
- `npm audit --omit=dev`: 9 → 3 findings by pinning patched `multer`, `js-yaml` and `uuid` (npm `overrides`, scoped to the packages that pull them). The 3 left (`prisma` → `@prisma/config` → `deepmerge-ts`) are in the Prisma CLI's config loader, not in the running API, and are fixed only by a major Prisma upgrade: accepted, revisit at the Prisma 7 migration.
- **Not run:** OWASP ZAP baseline (run `docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://host.docker.internal:4000/api/v1/docs-json -f openapi` and triage), manual authorisation tests, penetration test, PCI SAQ-A questionnaire. These need a person and, for the last two, a third party.

## 9. Still open for Phase 9 exit
QA-9.2 (staging 200 VU), QA-9.3, QA-9.4, QA-9.5, QA-9.6 (chaos), QA-9.7 (Lighthouse, needs the frontend), OPS-9.1 (uptime monitor and alert routing — the signals exist: 5xx in logs, `/health/ready`, `/admin/queues`), OPS-9.2 sign-off, and every FE-9.x item.
