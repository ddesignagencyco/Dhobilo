# Dhoblio

[![CI](https://github.com/ddesignagencyco/Dhobilo/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/ddesignagencyco/Dhobilo/actions/workflows/ci.yml)

Laundry and dry-cleaning aggregator platform for Pakistan: customers book pickup and delivery from local vendors, vendors manage catalogs and orders, riders handle the legs, and admins run operations.

Product and technical specs live in [docs/](docs/): [SRS](docs/Dhoblio-SRS.md), [TRD](docs/Dhoblio-TRD.md), [ERD](docs/Dhoblio-ERD.md), [Tracker](docs/Dhoblio-TRACKER.md).

## Status

Backend only; the frontend (`apps/web`) has not been started.

- Phase 0 (Foundation): done.
- Phase 1 (Auth, users, addresses): backend done. The real SMS gateway adapter waits on choosing a provider (mock provider works).
- Phase 2 (Vendor onboarding, approval, catalog): backend done. Uploads, verification and the short-lived signed document links were checked end to end against a live Cloudinary account (private files, not publicly reachable).

- Phase 3 (Discovery, cart, order placement): backend done. Cash on delivery only until Phase 6; promo codes are refused until Phase 7.
- Phase 4 (Order lifecycle, vendor operations, notifications): backend done. State machine, vendor accept/reject/advance, cancel, reorder, live tracking (SSE), vendor-timeout auto-cancel, and English/Urdu notifications over SMS, WhatsApp (SMS fallback), push and email. The real WhatsApp provider and SMS gateway adapters wait on choosing providers (mock providers work); the FCM client is unit-tested but not yet run against live Firebase.
- Phase 5 (Riders and delivery): backend done. Rider registration and admin review, Redis presence/location, delivery jobs created from order events, auto-dispatch with widening radius plus race-safe manual claim, proof of delivery by code or photo, rider earnings, customer delivery view and live rider position, admin dispatch board, and a courier-partner adapter with a mock partner. Only the mock partner exists; a real one waits on choosing a provider. Rider position is polled (no SSE yet), and COD collection/settlement is Phase 6.

### API so far (`/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/admin/login` |
| Profile | `GET/PATCH /me`, `POST/DELETE /me/devices` |
| Addresses | `GET/POST /me/addresses`, `PATCH/DELETE /me/addresses/:id` |
| Media | `POST /media/sign` for `vendor-docs` (vendor owners; private), `rider-photo` (riders; public, customers see it) and `delivery-proof` (riders; private) |
| Vendor | `POST /vendor/register`, `GET/PATCH /vendor/profile`, `GET/PUT /vendor/hours`, `PATCH /vendor/availability`, `GET/POST /vendor/staff`, `DELETE /vendor/staff/:userId` |
| Catalog | `GET /service-categories` (public), `GET/POST /vendor/catalog/items`, `PATCH/DELETE /vendor/catalog/items/:id`, `POST /vendor/catalog/import` (JSON or CSV) |
| Admin | `GET /admin/vendors`, `GET /admin/vendors/:id`, `GET /admin/vendors/:id/cnic` (audited), `POST /admin/vendors/:id/{approve,reject,suspend,reactivate}` |
| Discovery (public) | `GET /vendors` (geo search: `lat`, `lng`, `q`, `serviceType`, `minRating`, `maxPrice`, `sort=distance, rating or price`, cursor), `GET /vendors/:id`, `GET /vendors/:id/catalog`, `GET /vendors/:id/slots` |
| Cart | `GET/PUT/DELETE /cart`, `POST /cart/estimate` (customers) |
| Orders | `POST /orders` (needs an `Idempotency-Key` header), `GET /orders` (filters: status, vendor, dates), `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/reorder`, `GET /orders/:id/timeline`, `GET /orders/:id/events` (live SSE; customer, vendor or admin) |
| Order delivery | `GET /orders/:id/delivery` (pickup/drop legs and rider), `GET /orders/:id/rider-location` (while the rider is on the way), `POST /orders/:id/delivery-code/resend` (rate-limited) |
| Vendor orders | `GET /vendor/orders` (board), `GET /vendor/orders/counts`, `GET /vendor/orders/:id`, `POST /vendor/orders/:id/{accept,reject,status}` |
| Rider | `POST /rider/register`, `GET /rider/status`, `GET /rider/me`, `POST /rider/{online,offline,location}`, `GET /rider/jobs/available`, `GET /rider/jobs` (`view=active` or `history`), `GET /rider/jobs/:id`, `POST /rider/jobs/:id/{claim,accept,decline,release,start,complete,fail}`, `GET /rider/earnings` |
| Admin orders | `GET /admin/orders`, `GET /admin/orders/:id`, `POST /admin/orders/:id/cancel` |
| Admin riders | `GET /admin/riders`, `GET /admin/riders/:id`, `GET /admin/riders/:id/cnic` (audited), `POST /admin/riders/:id/{approve,reject,suspend,reactivate}` |
| Admin delivery | `GET /admin/delivery/summary`, `GET /admin/delivery/jobs` (board), `GET /admin/delivery/jobs/:id`, `POST /admin/delivery/jobs/:id/{assign,unassign,fail,redispatch}` |
| Courier partners | `GET /admin/courier-partners`, `PATCH /admin/courier-partners/:id` |
| Webhook | `POST /webhooks/courier/:code` (public; the partner signs each call, `eventId` makes retries safe) |
| Notifications | `GET/PATCH /me/notification-preferences` (language and per-channel opt-outs) |
| Admin | `PATCH /admin/cities/:id` (delivery fee, active flag, order code, `courierPartnerId`) |
| Public | `GET /cities`, `GET /health/live`, `GET /health/ready` |

Every route needs a bearer token unless marked `@Public()`. Roles are enforced with `@Roles()`, resource ownership with `@OwnedBy()`, and vendor-panel routes by vendor status with `@RequireVendorStatus()`.
Local login: any valid Pakistani mobile number plus code `123456` while `OTP_BYPASS=true` (dev only; the app refuses to boot with it in production).

**Demo data** (development only, created by `npm run db:seed`): vendor owners `+923000000011`, `+923000000012`, `+923000000013` (approved, with hours and a catalog in Lahore, Karachi and Islamabad) and `+923000000019` (pending, for the admin review queue). Sign in with the bypass code. The admin is `admin@dhoblio.local`. No rider is seeded: sign in with any valid number, apply with `POST /rider/register`, then approve the rider as admin.

**How ordering works:** a vendor shows up in discovery only when it is approved, set to Open, inside today's opening hours (in the city's timezone), has at least one active item and its own service radius reaches the customer. Pickup and delivery are hourly windows inside the vendor's hours (default capacity 10 orders per window, 1 hour minimum notice, up to 7 days ahead); delivery cannot be earlier than pickup end plus the longest item turnaround. To place an order the client sends the total it was shown (`expectedTotal`); if prices moved, the API answers `409 PRICE_CHANGED` with the new total instead of charging it. Retrying with the same `Idempotency-Key` returns the original order. Commission (vendor rule, else category rule, else global) is fixed on the order at placement and never shown to customers. Order numbers look like `DHB-LHR-000123`.

**How delivery works:** accepting an order creates a pickup job; reaching `READY` creates the drop job. Dispatch starts `DISPATCH_LEAD_MIN` (60) minutes before the window, offering the job to the nearest online approved rider, widening the radius and retrying until someone accepts or the attempts run out (then ops is alerted, if `OPS_ALERT_EMAIL` is set). Riders can also claim unassigned jobs manually; two riders racing for one job means one wins and the other gets `409 JOB_ALREADY_TAKEN`. A completed pickup/drop moves the order to `PICKED_UP`/`OUT_FOR_DELIVERY`/`DELIVERED`. A delivery needs the customer's 4-digit code or a proof photo. If a vendor or admin advances the order themselves, the matching open job is cancelled so nobody is sent for work already done. Cities with a courier partner switch to that partner instead of the in-house dispatch flow.

**Cloudinary setup** (needed for vendor registration, rider photos and delivery proof): set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` and `CLOUDINARY_UPLOAD_PRESET` in `.env`. Vendor documents and delivery proofs are uploaded as `authenticated` assets, so they never have a public URL; rider profile photos are public because customers see them. The API itself enforces JPG/PNG/WebP and 5 MB when it verifies an upload (presets cannot cap file size).

*Sharing one Cloudinary account with another app:* everything Dhoblio stores lives under `<CLOUDINARY_FOLDER_ROOT>/<env>/...` (default `dhoblio`; folders are created automatically on first upload, nothing to set up in the dashboard), and the API refuses any file outside the caller's own folder (including `..` tricks), so two apps on one account do not collide. Still give Dhoblio its own **upload preset** (signed mode, allowed formats `jpg,png,webp`, name it e.g. `dhoblio_vendor_docs`) and, ideally, its own **API key** (Cloudinary dashboard > Settings > API Keys > Generate New API Key) so each app's key can be revoked on its own. Storage and bandwidth quotas are shared across the whole account.

| Done | Where |
|---|---|
| NestJS bootstrap: HTTP (`main.ts`) and worker (`worker.ts`), `/api/v1` prefix, helmet, CORS allow-list, compression | `apps/api/src` |
| zod-validated env that refuses to boot on bad values (including `OTP_BYPASS=true` in production) | `src/config` |
| Prisma 6 schema from the ERD, initial migration with CHECK constraints and append-only triggers, idempotent seed | `apps/api/prisma` |
| Response envelope, error codes and exception filter, validation pipe, request IDs, pino logging with PII redaction | `src/common` |
| Redis, BullMQ (all 8 queues from the TRD), Bull Board (dev only, flag-controlled) | `src/infra` |
| Mail (Nodemailer: MailHog locally, Google SMTP in prod) with a dev-only test endpoint | `src/infra/mail` |
| Cloudinary upload signing, asset verification and short-lived private download links | `src/infra/cloudinary` |
| Field encryption (AES-256-GCM with key ids for rotation, keyed hashes) | `src/common/crypto` |
| `@Audit()` decorator and interceptor writing `AuditLog` | `src/modules/audit` |
| `/health/live` and `/health/ready` (Postgres + Redis) | `src/modules/health` |
| Swagger UI at `/api/v1/docs` (OpenAPI JSON at `/api/v1/docs-json`): every operation has a summary, who can call it, request and response examples and error examples; signing in through the UI applies the token automatically. Kept truthful by tests that compare examples with real responses | `src/docs`, `src/bootstrap.ts` |
| Rider registration/review, Redis presence and location, delivery jobs from order events, dispatch (auto + manual claim), proof of delivery, earnings | `src/modules/delivery` |
| Notification orchestration and bilingual templates (order, delivery and rider events) | `src/modules/notifications` |
| Courier-partner adapter, signed idempotent webhook and per-city switch (mock partner only) | `src/modules/delivery/courier` |
| Unit and e2e test harness | `src/**/*.spec.ts`, `apps/api/test` |
| CI: install, Prisma generate/validate, lint (when configured), typecheck, unit + e2e tests, API build, OpenAPI artifact | `.github/workflows/ci.yml` |

Next: Phase 6 (payments, COD, commissions and payouts). See the [tracker](docs/Dhobilo-TRACKER.md).

## Stack

TypeScript (strict), Node.js 22+, NestJS 11, PostgreSQL 16, Prisma 6, Redis 7 + BullMQ, Docker Compose, npm workspaces.

## Quick start

Requires Node.js 22+ and Docker.

```bash
npm install
cp .env.example .env        # then fill in the secrets (see comments in the file)
docker compose up -d postgres redis mailhog     # local infrastructure
npm run db:migrate          # generate Prisma client and apply migrations
npm run db:seed             # cities, categories, admin user, global commission
npm run api:dev             # API on http://localhost:4000
```

The root `.env` is read by the API and by the `db:*` scripts. Open http://localhost:4000/api/v1/docs for the Swagger UI and http://localhost:8025 for MailHog.

### Everything in Docker

```bash
docker compose up -d --build
```

All containers run under the `dhoblio` compose project: `dhoblio-postgres`, `dhoblio-redis`, `dhoblio-mailhog`, `dhoblio-migrate` (runs migrations once), `dhoblio-api` and `dhoblio-worker`.

### Seeded admin

Development default: `admin@dhoblio.local` / `ChangeMe!12345`. Override with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`; both are required when seeding with `NODE_ENV=production`.

## Scripts

From the repo root:

| Command | What it does |
|---|---|
| `npm run api:dev` | API in watch mode |
| `npm run api:build` | Compile the API to `apps/api/dist/` |
| `npm run db:migrate` | Generate the Prisma client and apply migrations |
| `npm run db:seed` | Seed cities, categories, admin user, global commission and demo vendors |
| `npm run lint` / `npm run typecheck` / `npm test` | Run across all workspaces (`--if-present`) |

From `apps/api` (the root `api:*` shortcuts run the first two):

| Command | What it does |
|---|---|
| `npm run start:dev` | API in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests |
| `npm run test:e2e` | E2E tests. Needs the Postgres and Redis containers; runs against a separate `dhoblio_test` database and Redis db 1, which are created, migrated and wiped at the start of every run (your dev data is never touched) |
| `npm run openapi` | Write `openapi.json` for client generation |

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `dev`, `main` and `phase-*`, and on pull requests to `dev` and `main`. It uses Node 22 with throwaway PostgreSQL 16 and Redis 7 services and runs: install, Prisma generate + schema validation, lint (once workspace lint scripts exist), typecheck, unit tests, API build, the full e2e suite, and uploads the generated `openapi.json` as an artifact.

## Layout

```
apps/api/            NestJS backend (API + worker share one codebase)
  prisma/            schema, migrations, seed
  src/common/        envelope, errors, filters, pipes, logging
  src/config/        zod env validation
  src/infra/         prisma, redis, queues, mail, cloudinary
  src/modules/       feature modules (audit, health so far)
  test/              e2e tests
packages/config/     shared TypeScript presets
docker/              Dockerfiles
docs/                SRS, TRD, ERD, tracker
```

## Notes

- NestJS is on 11.x, not 12: Nest 12 is ESM-only and this repo (Jest, Prisma 6, CommonJS TypeScript config) is CommonJS.
- Tests use Jest 29. Jest 30's native resolver failed to load on the development machine.
- Demo vendors and riders in the seed are deferred until the CNIC encryption helper exists (tracker BE-2.2).
