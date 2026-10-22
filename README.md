# Dhoblio

Laundry and dry-cleaning aggregator platform for Pakistan: customers book pickup and delivery from local vendors, vendors manage catalogs and orders, riders handle the legs, and admins run operations.

Product and technical specs live in [docs/](docs/): [SRS](docs/Dhoblio-SRS.md), [TRD](docs/Dhoblio-TRD.md), [ERD](docs/Dhoblio-ERD.md), [Tracker](docs/Dhoblio-TRACKER.md).

## Status

Backend only; the frontend (`apps/web`) has not been started.

- Phase 0 (Foundation): done.
- Phase 1 (Auth, users, addresses): backend done. The real SMS gateway adapter waits on choosing a provider (mock provider works).

### API so far (`/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/admin/login` |
| Profile | `GET/PATCH /me`, `POST/DELETE /me/devices` |
| Addresses | `GET/POST /me/addresses`, `PATCH/DELETE /me/addresses/:id` |
| Public | `GET /cities`, `GET /health/live`, `GET /health/ready` |

Every route needs a bearer token unless marked `@Public()`. Roles are enforced with `@Roles()`, resource ownership with `@OwnedBy()`.
Local login: any valid Pakistani mobile number plus code `123456` while `OTP_BYPASS=true` (dev only; the app refuses to boot with it in production).

| Done | Where |
|---|---|
| NestJS bootstrap: HTTP (`main.ts`) and worker (`worker.ts`), `/api/v1` prefix, helmet, CORS allow-list, compression | `apps/api/src` |
| zod-validated env that refuses to boot on bad values (including `OTP_BYPASS=true` in production) | `src/config` |
| Prisma 6 schema from the ERD, initial migration with CHECK constraints and append-only triggers, idempotent seed | `apps/api/prisma` |
| Response envelope, error codes and exception filter, validation pipe, request IDs, pino logging with PII redaction | `src/common` |
| Redis, BullMQ (all 8 queues from the TRD), Bull Board (dev only, flag-controlled) | `src/infra` |
| Mail (Nodemailer: MailHog locally, Google SMTP in prod) with a dev-only test endpoint | `src/infra/mail` |
| Cloudinary upload signing and asset verification (service only, no public endpoint until auth exists) | `src/infra/cloudinary` |
| `@Audit()` decorator and interceptor writing `AuditLog` | `src/modules/audit` |
| `/health/live` and `/health/ready` (Postgres + Redis) | `src/modules/health` |
| Swagger UI at `/api/v1/docs`, OpenAPI JSON at `/api/v1/docs-json` | `src/bootstrap.ts` |
| Unit and e2e test harness | `src/**/*.spec.ts`, `apps/api/test` |

Next: Phase 2 (vendor onboarding, approval, catalog). See the [tracker](docs/Dhoblio-TRACKER.md).

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
| `npm run test:e2e` | E2E tests (needs the Postgres and Redis containers) |
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
