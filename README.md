# Dhoblio

Laundry and dry-cleaning aggregator platform for Pakistan: customers book pickup and delivery from local vendors, vendors manage catalogs and orders, riders handle the legs, and admins run operations.

Product and technical specs live in [docs/](docs/): [SRS](docs/Dhoblio-SRS.md), [TRD](docs/Dhoblio-TRD.md), [ERD](docs/Dhoblio-ERD.md), [Tracker](docs/Dhoblio-TRACKER.md).

## Status

Backend only; the frontend (`apps/web`) has not been started.

- Phase 0 (Foundation): done.
- Phase 1 (Auth, users, addresses): backend done. The real SMS gateway adapter waits on choosing a provider (mock provider works).
- Phase 2 (Vendor onboarding, approval, catalog): backend done. Uploads, verification and the short-lived signed document links were checked end to end against a live Cloudinary account (private files, not publicly reachable).

- Phase 3 (Discovery, cart, order placement): backend done. Cash on delivery only until Phase 6; promo codes are refused until Phase 7.

### API so far (`/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/admin/login` |
| Profile | `GET/PATCH /me`, `POST/DELETE /me/devices` |
| Addresses | `GET/POST /me/addresses`, `PATCH/DELETE /me/addresses/:id` |
| Media | `POST /media/sign` (vendor owners; private uploads for CNIC and shop photos) |
| Vendor | `POST /vendor/register`, `GET/PATCH /vendor/profile`, `GET/PUT /vendor/hours`, `PATCH /vendor/availability`, `GET/POST /vendor/staff`, `DELETE /vendor/staff/:userId` |
| Catalog | `GET /service-categories` (public), `GET/POST /vendor/catalog/items`, `PATCH/DELETE /vendor/catalog/items/:id`, `POST /vendor/catalog/import` (JSON or CSV) |
| Admin | `GET /admin/vendors`, `GET /admin/vendors/:id`, `GET /admin/vendors/:id/cnic` (audited), `POST /admin/vendors/:id/{approve,reject,suspend,reactivate}` |
| Discovery (public) | `GET /vendors` (geo search: `lat`, `lng`, `q`, `serviceType`, `minRating`, `maxPrice`, `sort=distance, rating or price`, cursor), `GET /vendors/:id`, `GET /vendors/:id/catalog`, `GET /vendors/:id/slots` |
| Cart | `GET/PUT/DELETE /cart`, `POST /cart/estimate` (customers) |
| Orders | `POST /orders` (needs an `Idempotency-Key` header), `GET /orders`, `GET /orders/:id` (customers) |
| Admin | `PATCH /admin/cities/:id` (delivery fee, active flag, order code) |
| Public | `GET /cities`, `GET /health/live`, `GET /health/ready` |

Every route needs a bearer token unless marked `@Public()`. Roles are enforced with `@Roles()`, resource ownership with `@OwnedBy()`, and vendor-panel routes by vendor status with `@RequireVendorStatus()`.
Local login: any valid Pakistani mobile number plus code `123456` while `OTP_BYPASS=true` (dev only; the app refuses to boot with it in production).

**Demo data** (development only, created by `npx prisma db seed`): vendor owners `+923000000011`, `+923000000012`, `+923000000013` (approved, with hours and a catalog in Lahore, Karachi and Islamabad) and `+923000000019` (pending, for the admin review queue). Sign in with the bypass code. The admin is `admin@dhoblio.local`.

**How ordering works:** a vendor shows up in discovery only when it is approved, set to Open, inside today's opening hours (in the city's timezone), has at least one active item and its own service radius reaches the customer. Pickup and delivery are hourly windows inside the vendor's hours (default capacity 10 orders per window, 1 hour minimum notice, up to 7 days ahead); delivery cannot be earlier than pickup end plus the longest item turnaround. To place an order the client sends the total it was shown (`expectedTotal`); if prices moved, the API answers `409 PRICE_CHANGED` with the new total instead of charging it. Retrying with the same `Idempotency-Key` returns the original order. Commission (vendor rule, else category rule, else global) is fixed on the order at placement and never shown to customers. Order numbers look like `DHB-LHR-000123`.

**Cloudinary setup** (needed for vendor registration): set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` and `CLOUDINARY_UPLOAD_PRESET` in `.env`. Vendor documents are uploaded as `authenticated` assets, so they never have a public URL. The API itself enforces JPG/PNG/WebP and 5 MB when it verifies an upload (presets cannot cap file size).

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
| Swagger UI at `/api/v1/docs`, OpenAPI JSON at `/api/v1/docs-json` | `src/bootstrap.ts` |
| Unit and e2e test harness | `src/**/*.spec.ts`, `apps/api/test` |

Next: Phase 3 (discovery, cart, order placement). See the [tracker](docs/Dhoblio-TRACKER.md).

## Stack

TypeScript (strict), Node.js 22+, NestJS 11, PostgreSQL 16, Prisma 6, Redis 7 + BullMQ, Docker Compose, npm workspaces.

## Quick start

Requires Node.js 22+ and Docker.

```bash
npm install
cp .env.example .env        # then fill in the secrets (see comments in the file)
docker compose up -d postgres redis mailhog     # local infrastructure
cd apps/api
npx prisma migrate deploy   # apply migrations
npx prisma db seed          # cities, categories, admin user, global commission
npm run start:dev           # API on http://localhost:4000
```

Open http://localhost:4000/api/v1/docs for the Swagger UI and http://localhost:8025 for MailHog.

### Everything in Docker

```bash
docker compose up -d --build
```

All containers run under the `dhoblio` compose project: `dhoblio-postgres`, `dhoblio-redis`, `dhoblio-mailhog`, `dhoblio-migrate` (runs migrations once), `dhoblio-api` and `dhoblio-worker`.

### Seeded admin

Development default: `admin@dhoblio.local` / `ChangeMe!12345`. Override with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`; both are required when seeding with `NODE_ENV=production`.

## Scripts (run from `apps/api`, or use the root `api:*` shortcuts)

| Command | What it does |
|---|---|
| `npm run start:dev` | API in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests |
| `npm run test:e2e` | E2E tests. Needs the Postgres and Redis containers; runs against a separate `dhoblio_test` database and Redis db 1, which are created, migrated and wiped at the start of every run (your dev data is never touched) |
| `npm run openapi` | Write `openapi.json` for client generation |

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
