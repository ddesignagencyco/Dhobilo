# Dhoblio — Technical Requirements Document (TRD)

**Version:** 1.0 (MVP) · **Companion docs:** `01-SRS.md`, `03-ERD.md`, `04-TRACKER.md`

---

## 1. Purpose & Scope

This document turns the SRS into concrete technical decisions: architecture, stack, module boundaries, APIs, background jobs, infrastructure, security, testing, and delivery. It covers the MVP for 1–3 pilot cities with a path to 10+ cities without redesign (SRS §7).

---

## 2. Stack (Fixed)

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript** (strict) end to end | shared types package |
| Package manager | **npm** (workspaces) | no yarn/pnpm |
| Runtime | **Node.js 22 LTS** | |
| Backend | **NestJS** (modular monolith) | REST + SSE |
| Frontend | **Next.js** (App Router) | one app, route groups per role |
| Database | **PostgreSQL 16** | |
| ORM | **Prisma 6** | migrations via `prisma migrate` |
| Cache / queues | **Redis 7** + **BullMQ** | |
| Media | **Cloudinary** | signed direct uploads |
| Email | **Google SMTP** (prod/staging) / **MailHog** (local) | via Nodemailer |
| Containers | **Docker** + Docker Compose | |
| Load testing | **k6** | |

### 2.1 Additions the SRS requires that are not in your stack list

These are *capabilities* the SRS mandates; they need a provider or library even though they aren't named in your stack. Please confirm or substitute.

| Need | SRS ref | Proposed | Why |
|---|---|---|---|
| Push notifications | C10 | **Firebase Cloud Messaging** (works for web push and any future native shell) | no stack item covers push |
| SMS / OTP | C1, §8.3 | Local PK SMS gateway behind an `SmsProvider` interface | OTP is the only login method |
| WhatsApp | C10, §8.3 | WhatsApp Business API via a BSP, behind a `WhatsAppProvider` interface | primary notification channel in PK |
| Maps | C2, C3, R3, §8.4 | Google Maps Platform (Maps JS, Places, Geocoding) | named in SRS |
| Payment gateways | C8, §8.2 | JazzCash, Easypaisa, Raast, card gateway (PayFast/HBL) | named in SRS |
| Validation | — | `zod` (shared FE/BE) + `class-validator` where Nest pipes need it | |
| Auth | C1 | `@nestjs/jwt`, `argon2` (admin passwords) | |

### 2.2 ⚠️ Native apps vs your stack (decision needed)

SRS §8.1 says *native* Android/iOS apps for customers and riders. Your stack has **Next.js only** (no React Native / Flutter / Kotlin / Swift). Recommendation for MVP:

- Build customer + rider as **installable PWAs** in Next.js (Android is the primary market, which PWAs serve well: install prompt, push via FCM, camera access for proof of delivery, geolocation).
- Keep the API mobile-agnostic so a native or Capacitor-wrapped app can be added post-MVP without backend changes.
- iOS 13+ (SRS §8.5): web push on iOS requires iOS 16.4+ and an installed PWA, so iOS push is limited. WhatsApp/SMS cover that gap.

If true native apps are non-negotiable, add React Native (Expo) as a third app in the monorepo; the API and shared packages stay as designed.

---

## 3. System Architecture

```
┌───────────────────────────── Clients ─────────────────────────────┐
│  Next.js (App Router)                                             │
│  ├─ (customer)  PWA   ├─ (rider) PWA                              │
│  └─ (vendor)  panel   └─ (admin) panel          next-intl en/ur   │
└──────────────┬────────────────────────────────────────────────────┘
               │ HTTPS  REST/JSON  + SSE (order status)
┌──────────────▼────────────────────────────────────────────────────┐
│  NestJS API (modular monolith)          NestJS Worker (same code, │
│  Guards · Pipes · Interceptors          BullMQ processors only)   │
└───┬──────────┬──────────┬──────────┬───────────┬──────────────────┘
    │          │          │          │           │
 PostgreSQL   Redis    Cloudinary  Gateways    Providers
 (Prisma)  cache/OTP/   media      JazzCash    SMS · WhatsApp · FCM
           GEO/BullMQ              Easypaisa   Google Maps · SMTP
                                   Raast·Card  Courier partner API
```

**Why a modular monolith:** one deployable for a small team, strict module boundaries so any module (notifications, payments, delivery) can be split out later. Scaling to 10+ cities is horizontal: more API/worker replicas, Postgres read replica, Redis. No per-city code paths; `cityId` is data.

**Two processes, one codebase:** `api` (HTTP) and `worker` (BullMQ processors + schedulers) are separate Docker services from the same image with different entrypoints so a slow job never starves HTTP.

---

## 4. Repository Layout (npm workspaces)

```
dhoblio/
├─ apps/
│  ├─ api/                      # NestJS
│  │  ├─ prisma/ (schema.prisma, migrations/, seed.ts)
│  │  ├─ src/
│  │  │  ├─ main.ts             # HTTP entry
│  │  │  ├─ worker.ts           # Worker entry (BullMQ only)
│  │  │  ├─ app.module.ts
│  │  │  ├─ common/             # guards, decorators, filters, interceptors, pipes
│  │  │  ├─ config/             # zod-validated env
│  │  │  ├─ infra/              # prisma, redis, bullmq, cloudinary, mail, sms, whatsapp, fcm, maps
│  │  │  └─ modules/            # see §5
│  │  └─ test/ (e2e)
│  └─ web/                      # Next.js
│     ├─ src/app/[locale]/(customer|vendor|rider|admin)/...
│     ├─ src/components/ src/lib/api src/messages/{en,ur}.json
│     └─ e2e/ (Playwright)
├─ packages/
│  ├─ shared/                   # enums, zod schemas, DTO types, constants
│  └─ config/                   # eslint, tsconfig, prettier presets
├─ load-tests/ (k6)
├─ docker/ (Dockerfiles, nginx.conf)
├─ docker-compose.yml  docker-compose.override.yml
└─ package.json (workspaces)
```

---

## 5. Backend Modules (NestJS)

Each module = `module.ts`, `controller.ts`, `service.ts`, `dto/`, optional `processor.ts` / `events`. Cross-module access goes through exported services or domain events (`@nestjs/event-emitter`), never through another module's Prisma queries.

| Module | Responsibility | SRS |
|---|---|---|
| `auth` | OTP request/verify, JWT access + rotating refresh, admin password login, RBAC guards | C1 |
| `users` | profile, locale, device tokens | C1, §7 |
| `addresses` | CRUD with lat/lng | C2 |
| `cities` | active city list | §1.2 |
| `vendors` | registration, profile, hours, radius, availability, staff | V1, V4, V7 |
| `catalog` | categories, service items, pricing, turnaround | C4, V3 |
| `discovery` | vendor search/filter/sort (geo, rating, service type, price) | C3 |
| `cart` | cart CRUD + server-side estimate | C5 |
| `slots` | pickup/delivery slot generation | C6, C7 |
| `orders` | placement, state machine, history, reorder, cancel | C5–C9, C12, V5, V6 |
| `tracking` | SSE stream of order/job status | C9 |
| `delivery` | jobs, assignment, rider status, proof, courier adapter | R1–R7 |
| `riders` | rider registration, online/offline, location | R1, R2 |
| `payments` | gateway abstraction, webhooks, refunds, COD | C8, §8.2 |
| `finance` | commission, ledger, earnings, payouts, COD settlement | A3, V8, V9 |
| `reviews` | vendor + rider reviews, rating aggregates | C11 |
| `complaints` | complaints/redo + admin mediation | C13, V10, A5 |
| `promos` | promo codes, redemptions, referrals | C14, A6 |
| `notifications` | templates, channel fan-out, device tokens, announcements | C10, A7 |
| `media` | Cloudinary signed upload params, validation, cleanup | V1, R1, R5 |
| `admin` | vendor/rider review, suspension, analytics, exports | A1–A8 |
| `audit` | interceptor + service writing `AuditLog` | §7 |
| `health` | liveness/readiness (DB, Redis) | §7 |

### 5.1 Cross-cutting
- **Config:** `@nestjs/config` + zod schema; app refuses to boot on invalid env.
- **Validation:** global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform).
- **Response envelope:** `{ data, meta? }` success; `{ error: { code, message, details?, requestId } }` failure. Stable machine-readable `code` values (e.g. `ORDER_INVALID_TRANSITION`).
- **Logging:** `nestjs-pino`, JSON, request-id propagated (`x-request-id`), PII redaction (phone, CNIC, tokens).
- **API docs:** `@nestjs/swagger` → OpenAPI JSON → generates the typed FE client (`openapi-typescript`).
- **Versioning:** URI prefix `/api/v1`.
- **Pagination:** cursor-based for lists (orders, notifications), `limit` ≤ 50.
- **Time:** store UTC, display `Asia/Karachi`.
- **i18n:** API returns codes; message text for notifications is rendered from en/ur templates by the notifications module based on `User.locale`.

---

## 6. Authentication & Authorization

### 6.1 OTP login (customers, vendors, riders — FR-C1)
1. `POST /auth/otp/request {phone}` → normalise to E.164 → rate limit (Redis: 3/10 min per phone, 10/hour per IP) → generate 6-digit code → store **hash** in Redis (`otp:{phone}`, TTL 5 min, attempts counter) → enqueue SMS job.
2. `POST /auth/otp/verify {phone, code, role?}` → max 5 attempts → on success upsert `User` (customer by default; vendor/rider onboarding sets role during registration flows) → issue tokens.
3. Dev/staging: fixed OTP `123456` only when `OTP_BYPASS=true` and `NODE_ENV != production`. The app fails to boot if `OTP_BYPASS=true` in production.

### 6.2 Tokens
- **Access JWT** 15 min, in memory on the client; **refresh token** 30 days, opaque random, stored hashed in `Session`, **rotated on every use** with reuse detection (reuse → revoke the whole session family).
- Web: refresh token in `httpOnly; Secure; SameSite=Lax` cookie; access token returned in body.
- Admin: email + password (argon2id) + lockout after 5 failures. (Optional 2FA is a post-MVP hardening item.)

### 6.3 RBAC
Roles: `CUSTOMER`, `VENDOR_OWNER`, `VENDOR_STAFF`, `RIDER`, `ADMIN`. Guards: `JwtAuthGuard` → `RolesGuard` (`@Roles()`) → `OwnershipGuard` (e.g. vendor can only touch its own orders; customer only own). Vendor must be `APPROVED` for catalog-live and order endpoints; rider must be `APPROVED` for job endpoints.

---

## 7. Data Layer

- Schema, constraints, and indexes: see `03-ERD.md`.
- Prisma Client as a Nest provider with `enableShutdownHooks`. Use `$transaction` for any multi-write operation (order placement, status change + history + ledger).
- **Migrations:** `prisma migrate dev` locally; `prisma migrate deploy` in CD (run as a one-shot container before the API starts).
- **Geo search (MVP):** bounding-box prefilter on `(lat,lng)` then Haversine via `$queryRaw`, filtered by each vendor's `serviceRadiusKm`. Move to PostGIS if needed.
- **Sensitive data:** CNIC encrypted with AES-256-GCM (key from env/secret manager, key-id prefix for rotation); `cnicHash` = HMAC-SHA256 with a separate key. Decryption is admin-only and logged to `AuditLog`.
- **Backups:** daily `pg_dump` + WAL archiving in prod; restore tested before pilot.

---

## 8. Redis Usage

| Purpose | Key pattern | TTL |
|---|---|---|
| OTP challenge + attempts | `otp:{phone}` | 5 min |
| OTP/API rate limiting (throttler storage) | `rl:{scope}:{id}` | window |
| Vendor discovery cache | `disc:{cityId}:{hash(filters)}` | 60 s (invalidate on vendor/catalog change) |
| Rider live position (GEO) | `riders:geo:{cityId}` (GEOADD) + `rider:{id}:ping` | 90 s heartbeat |
| Idempotency (non-order endpoints) | `idem:{userId}:{key}` | 24 h |
| Refresh-token denylist (fast revoke) | `deny:{sessionId}` | token life |
| SSE fan-out | pub/sub `order:{id}` | — |
| BullMQ | managed by BullMQ | — |

Redis is a cache/coordination layer. **Postgres is the source of truth**; losing Redis must never lose an order or payment (SRS §7 Reliability).

---

## 9. Background Jobs (BullMQ)

Run in the `worker` service. Bull Board mounted at `/admin/queues` (admin-only, behind auth, disabled by default in prod via flag).

| Queue | Jobs | Trigger | Retry/backoff |
|---|---|---|---|
| `notifications` | `send-sms`, `send-whatsapp`, `send-push`, `send-email` | order status events, OTP, announcements | 5 attempts, exponential (10 s base); fall back WhatsApp → SMS on final failure for order alerts |
| `order-timers` | `vendor-response-timeout` (delayed), `order-auto-cancel` | on `PLACED` (delay = `respondWithinMin`) | idempotent; checks current status before acting |
| `dispatch` | `assign-rider`, `reassign-rider` | order → `ACCEPTED` / `READY` | re-queue with widening radius until assigned or ops alerted |
| `payments` | `process-webhook`, `reconcile-pending`, `refund` | gateway webhook, cron every 10 min | 8 attempts, exponential |
| `finance` | `post-ledger`, `calc-earnings`, `process-payout` | on `DELIVERED`, admin approval | idempotent by `(orderId,type)` |
| `exports` | `generate-report` (CSV/XLSX) | admin request (A8) | result uploaded to Cloudinary (raw, private) and link emailed/notified |
| `media` | `cleanup-orphans` | nightly cron | |
| `analytics` | `rollup-daily` | nightly cron | |

**Rules:** every job payload carries `requestId`; handlers are **idempotent**; failed-after-retries jobs land in the failed set and trigger a Sentry/log alert; `removeOnComplete` keeps the last 1000.

---

## 10. Order Lifecycle (State Machine)

SRS §9.2 plus one required addition (`CANCELLED`), because customers and ops need an exit path before pickup, and COD/online payments need a defined refund trigger.

```mermaid
stateDiagram-v2
  [*] --> PLACED
  PLACED --> ACCEPTED: vendor accepts
  PLACED --> REJECTED: vendor rejects / timeout
  PLACED --> CANCELLED: customer cancels
  ACCEPTED --> CANCELLED: customer (before pickup) / admin
  ACCEPTED --> PICKED_UP: rider collects (PICKUP job done)
  PICKED_UP --> IN_PROCESS: vendor starts work
  IN_PROCESS --> READY: vendor marks ready
  READY --> OUT_FOR_DELIVERY: rider dispatched (DROP job in transit)
  OUT_FOR_DELIVERY --> DELIVERED: proof captured (photo/OTP)
  DELIVERED --> [*]
  REJECTED --> [*]
  CANCELLED --> [*]
```

**Implementation rules**
- A single `OrderStateMachine` service owns an explicit transition table `{from → to: allowedActors}`. Controllers never write `status` directly.
- Each transition runs in **one DB transaction**: update order (with `WHERE status = :expected` for optimistic concurrency) + insert `OrderStatusHistory` + emit domain event (after commit).
- Side effects (notifications, dispatch, ledger, timers) are event-driven and queued; they never run inside the transaction.
- **Delivered:** the SRS says "Customer confirms". Technical interpretation: delivery completes when the rider submits proof (customer OTP or photo, R5). If you want an explicit in-app customer confirmation as well, add an `auto-confirm after N hours` job. *(Confirm which you want.)*
- **Redo (C13):** a redo creates a linked complaint of type `REDO`; MVP handles the physical redo as an admin/vendor-coordinated follow-up (new DROP/PICKUP jobs on the same order), not a new order.

---

## 11. API Surface (v1)

Base: `/api/v1`. All authenticated unless marked public. Full OpenAPI generated by Swagger.

### Auth & Users
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/otp/request` · `/auth/otp/verify` | public, rate-limited |
| POST | `/auth/refresh` · `/auth/logout` | |
| POST | `/auth/admin/login` | public |
| GET/PATCH | `/me` | profile, locale |
| POST/DELETE | `/me/devices` | FCM token |
| GET/POST/PATCH/DELETE | `/me/addresses` | C2 |

### Discovery, Catalog, Cart
| Method | Path | Notes |
|---|---|---|
| GET | `/vendors?lat&lng&q&serviceType&minRating&maxPrice&sort&cursor` | C3 |
| GET | `/vendors/:id` · `/vendors/:id/catalog` | C4 |
| GET | `/vendors/:id/slots?date&type=pickup|delivery` | C6, C7 |
| GET/PUT/DELETE | `/cart` | server-side cart |
| POST | `/cart/estimate` | C5 (items + promo → totals) |

### Orders & Tracking
| Method | Path | Notes |
|---|---|---|
| POST | `/orders` | header `Idempotency-Key` required |
| GET | `/orders` · `/orders/:id` | history (C12) |
| POST | `/orders/:id/cancel` · `/orders/:id/reorder` | |
| GET | `/orders/:id/events` | **SSE** status stream (C9) |
| GET | `/orders/:id/timeline` | status history |

### Vendor panel
| Method | Path | Notes |
|---|---|---|
| POST | `/vendor/register` | V1 |
| GET/PATCH | `/vendor/profile` · `/vendor/hours` · `/vendor/availability` | V4, V7 |
| CRUD | `/vendor/catalog/items` | V3 |
| GET | `/vendor/orders?status=` | |
| POST | `/vendor/orders/:id/accept` · `/reject` · `/status` | V5, V6 |
| GET | `/vendor/earnings?range=day|week|month` | V8 |
| POST/GET | `/vendor/payouts` | V9 |
| GET/POST | `/vendor/complaints` · `/:id/messages` | V10 |

### Rider
| Method | Path | Notes |
|---|---|---|
| POST | `/rider/register` | R1 |
| POST | `/rider/online` · `/offline` · `/location` | R2 |
| GET | `/rider/jobs/available` · `/rider/jobs/mine` | R2, R3 |
| POST | `/rider/jobs/:id/accept` · `/status` · `/proof` | R2, R4, R5 |
| GET | `/rider/earnings` | R6 |
| POST | `/rider/cod/settlements` (admin-recorded) | §8.2 |

### Payments, Reviews, Complaints, Promos
| Method | Path | Notes |
|---|---|---|
| POST | `/payments/initiate` | returns redirect/params per gateway |
| POST | `/webhooks/{jazzcash|easypaisa|raast|card}` | public, signature-verified, idempotent |
| POST | `/orders/:id/reviews` | C11 (after `DELIVERED`) |
| POST/GET | `/orders/:id/complaints` | C13 |
| POST | `/promos/validate` | C14 |
| GET | `/me/referral` | C14 |

### Media
| Method | Path | Notes |
|---|---|---|
| POST | `/media/sign` | returns Cloudinary signature + folder/preset; client uploads directly |

### Admin
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/admin/vendors` · `/:id/approve` · `/:id/reject` · `/:id/suspend` | A1, A2 |
| GET/POST | `/admin/riders` · `/:id/approve` · `/:id/suspend` | R1, A2 |
| CRUD | `/admin/commission-rules` | A3 |
| GET | `/admin/analytics/{overview|orders|revenue|vendors}` | A4 |
| GET/POST | `/admin/complaints` · `/:id/resolve` | A5 |
| CRUD | `/admin/promos` | A6 |
| POST | `/admin/announcements` | A7 |
| POST/GET | `/admin/reports` | A8 (async via `exports` queue) |
| GET/POST | `/admin/payouts` · `/:id/approve` · `/:id/pay` | V9 |
| GET | `/admin/audit?entity&entityId&actor` | §7 |

---

## 12. Real-time Tracking (FR-C9)

- **SSE** (`text/event-stream`) at `/orders/:id/events`. Chosen over WebSockets because it is lighter on low-bandwidth/intermittent links, reconnects natively with `Last-Event-ID`, and passes through proxies simply.
- Events published to Redis pub/sub `order:{id}` after commit; every API replica fans out to its connected clients.
- **Fallback:** client polls `GET /orders/:id` every 15–30 s if SSE fails or the tab is backgrounded.
- Rider position for the customer map (optional in MVP): rider pings `POST /rider/location` every 15 s while on a job; stored in Redis GEO; customer view polls `GET /orders/:id/rider-location`.

---

## 13. Payments

### 13.1 Abstraction
```ts
interface PaymentGateway {
  code: 'jazzcash' | 'easypaisa' | 'raast' | 'card';
  initiate(order: PaymentOrder): Promise<{ redirectUrl?: string; formFields?: Record<string,string>; gatewayRef: string }>;
  verifyWebhook(headers, rawBody): VerifiedEvent;      // signature check
  refund(payment: Payment, amount: Decimal): Promise<RefundResult>;
  status(gatewayRef: string): Promise<GatewayStatus>;   // for reconciliation
}
```
Each gateway is a Nest provider registered in `PaymentsModule`; a `GatewayRegistry` picks by `PaymentMethod`.

### 13.2 Rules
- **Hosted/redirect checkout only.** Card data never touches our servers or logs, which keeps scope at PCI-DSS SAQ-A (SRS §7). No PAN storage, ever.
- **Webhooks:** verify signature on the **raw body**, then upsert `Payment` by `(gateway, gatewayRef)` and enqueue `process-webhook`. Return `200` fast; processing is async and idempotent.
- **Reconciliation:** cron every 10 min polls `status()` for payments `PENDING` > 10 min.
- **Order ↔ payment:** online methods: order is created `PLACED` with `paymentStatus=PENDING`; vendor sees it only after payment `PAID` (or the order is auto-cancelled after a payment timeout). COD: `paymentStatus=COD_PENDING`, visible to vendor immediately.
- **COD flow (§8.2):** rider confirms cash at drop → `CodCollection` → admin records rider deposit as `CodSettlement` → outstanding cash per rider is a reportable balance.
- **Commission & ledger:** on `DELIVERED` the `finance` queue posts `ORDER_EARNING` (+vendorEarning) and `COMMISSION` (−commission, for reporting) ledger entries, idempotent per order. For COD orders the platform holds no money, so the earning is credited only after the rider's cash is settled; the exact rule is a business decision (flagged in §20).
- **Sandbox first:** every gateway adapter ships with a mock implementation for local/dev/k6.

---

## 14. Notifications (FR-C10, A7)

- Domain event (`order.status_changed`) → `NotificationOrchestrator` → picks channels per user prefs → enqueues one job per channel.
- Channels behind interfaces: `SmsProvider`, `WhatsAppProvider`, `PushProvider` (FCM), `MailProvider` (Nodemailer → **MailHog** locally, **Google SMTP** with an app password in staging/prod).
- **Templates:** versioned in code (`templates/{name}.{en|ur}.ts`); WhatsApp templates must be pre-approved by the BSP — keep a name↔template-id map in config.
- Every send is logged in `Notification` (status, attempts, error).
- Email is used for admin/vendor communications (approval decisions, reports, password reset), not for customers (phone-first).

---

## 15. Media (Cloudinary)

- **Signed direct upload:** `POST /media/sign` returns `{timestamp, signature, folder, upload_preset, api_key, cloud_name}`; browser uploads directly, then sends `publicId` to the API, which verifies with the Admin API before persisting.
- **Folders:** `dhoblio/{env}/vendors/{vendorId}/docs`, `.../riders/{riderId}`, `.../proof/{orderId}`, `.../complaints/{id}`, `.../catalog`.
- **Sensitive docs (CNIC) must use `type: authenticated`/private delivery**, never public URLs; admin views via short-lived signed URLs.
- **Low-bandwidth:** deliver images with `f_auto,q_auto,w_<n>,dpr_auto`; lazy-load; low-quality placeholders.
- **Validation:** type whitelist (jpg/png/webp), max 5 MB, preset-enforced.
- **Cleanup:** nightly job removes orphaned uploads not referenced in DB after 24 h.

---

## 16. Frontend (Next.js)

### 16.1 Structure
- **App Router** with a locale segment: `/[locale]/(customer|rider|vendor|admin)/…` — `locale ∈ {en, ur}`; `ur` sets `dir="rtl"`.
- **Libraries:** Tailwind CSS (logical properties `ms-*/me-*/ps-*/pe-*` for RTL), `next-intl`, TanStack Query, React Hook Form + zod, Google Maps JS loader, Workbox-based service worker (custom, via `next-pwa`-style config or hand-rolled), Playwright.
- **Server vs client:** RSC for public/SEO pages (vendor listing, vendor detail); client components for cart/checkout/panels.
- **API client:** generated from OpenAPI into `packages/shared` or `src/lib/api`; one place for token refresh and error mapping.

### 16.2 Low-bandwidth & intermittent connectivity (SRS §2.5, §7)
- **Budget:** order placement + estimate screens interactive < 3 s on 3G → JS per route ≤ ~170 KB gzip, images via Cloudinary transforms, system font stack + one Urdu font (Noto Nastaliq Urdu or Noto Naskh Arabic) subset and `font-display: swap`.
- **Caching:** service worker caches the app shell + last-seen vendor list/catalog (stale-while-revalidate).
- **Order never lost:** order draft persisted in IndexedDB; "place order" retries with the **same `Idempotency-Key`**; UI shows a pending state until server confirms.
- **Skeletons** instead of spinners; optimistic UI for cart.
- **Pagination/infinite scroll** with small page sizes.

### 16.3 UX targets
- First-time user completes a booking in < 2 minutes without a tutorial (SRS §7): max 3 taps from home to cart, phone+OTP as the only sign-up step, address via map pin with GPS prefill, big touch targets, plain icons + Urdu labels.
- Vendor panel: incoming-order board with countdown to the response deadline and an audible alert.
- Rider PWA: single-column job cards, deep link to Google Maps navigation (R3), camera capture for proof (R5).

---

## 17. Infrastructure & DevOps

### 17.1 Docker Compose (local)
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: dhoblio, POSTGRES_PASSWORD: dhoblio, POSTGRES_DB: dhoblio }
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL","pg_isready -U dhoblio"], interval: 5s, retries: 10 }

  redis:
    image: redis:7-alpine
    command: ["redis-server","--appendonly","yes"]
    ports: ["6379:6379"]
    volumes: [redisdata:/data]

  mailhog:
    image: mailhog/mailhog
    ports: ["1025:1025","8025:8025"]      # SMTP / web UI

  migrate:
    build: { context: ., dockerfile: docker/api.Dockerfile, target: build }
    command: npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
    env_file: .env
    depends_on: { postgres: { condition: service_healthy } }

  api:
    build: { context: ., dockerfile: docker/api.Dockerfile }
    command: node dist/main.js
    env_file: .env
    ports: ["4000:4000"]
    depends_on: [migrate, redis, mailhog]

  worker:
    build: { context: ., dockerfile: docker/api.Dockerfile }
    command: node dist/worker.js
    env_file: .env
    depends_on: [migrate, redis]

  web:
    build: { context: ., dockerfile: docker/web.Dockerfile }
    env_file: .env
    ports: ["3000:3000"]
    depends_on: [api]

  k6:
    image: grafana/k6
    profiles: ["load"]
    volumes: ["./load-tests:/scripts"]
    environment: { BASE_URL: "http://api:4000/api/v1" }
    command: run /scripts/smoke.js

volumes: { pgdata: {}, redisdata: {} }
```
Dockerfiles are **multi-stage** (deps → build → slim runtime, non-root user, `npm ci --omit=dev` in the runtime stage). `docker-compose.override.yml` adds bind mounts + `nest start --watch` / `next dev` for local development.

### 17.2 Environments
| Env | Purpose | Mail | Gateways | OTP |
|---|---|---|---|---|
| local | dev | MailHog | mock | bypass `123456` |
| staging | QA/UAT, k6 | Google SMTP (test inbox) | sandbox | real SMS to whitelisted numbers |
| production | pilot cities | Google SMTP | live | real |

Hosting target per SRS §2.4: AWS or Azure in a region close to Pakistan (e.g. AWS `ap-south-1` Mumbai / Azure Central India are the closest major regions). Managed Postgres + managed Redis recommended; run `api`, `worker`, `web` as containers (ECS/Fargate, App Service, or a single VM with Compose for the pilot). **Residency:** confirm with counsel whether SBP/PTA data rules require in-country storage for payment or personal data before choosing the region (§20).

### 17.3 Environment variables (`.env.example`)
```
NODE_ENV=development
APP_URL=http://localhost:3000        API_URL=http://localhost:4000
DATABASE_URL=postgresql://dhoblio:dhoblio@postgres:5432/dhoblio?schema=public
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=            JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m            JWT_REFRESH_TTL_DAYS=30
OTP_BYPASS=true               OTP_TTL_SECONDS=300
ENC_KEY_ID=k1                 ENC_KEY_BASE64=         HMAC_KEY_BASE64=
CLOUDINARY_CLOUD_NAME=        CLOUDINARY_API_KEY=     CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_PRESET=
SMTP_HOST=mailhog             SMTP_PORT=1025          SMTP_USER=      SMTP_PASS=
SMTP_FROM="Dhoblio <no-reply@dhoblio.pk>"
# prod: SMTP_HOST=smtp.gmail.com SMTP_PORT=587 (App Password)
SMS_PROVIDER=mock             SMS_API_KEY=
WHATSAPP_PROVIDER=mock        WHATSAPP_TOKEN=
FCM_PROJECT_ID=               FCM_CLIENT_EMAIL=       FCM_PRIVATE_KEY=
GOOGLE_MAPS_API_KEY=          NEXT_PUBLIC_GOOGLE_MAPS_KEY=
JAZZCASH_MERCHANT_ID=         JAZZCASH_PASSWORD=      JAZZCASH_SALT=
EASYPAISA_STORE_ID=           EASYPAISA_HASH_KEY=
RAAST_*=                      CARD_GATEWAY_*=
BULL_BOARD_ENABLED=false
```
Secrets: never committed; use the cloud secret manager in staging/prod.

### 17.4 CI/CD (GitHub Actions or equivalent)
`lint → typecheck → unit → prisma validate + migrate on a throwaway PG → e2e (Testcontainers/compose) → build images → (main) push + deploy staging → run k6 smoke`. Husky + lint-staged + commitlint on commit. Dependabot/`npm audit` weekly.

### 17.5 Observability
Structured logs (pino) shipped to the cloud log service; `/health/live` and `/health/ready`; Bull Board for queues; error tracking via Sentry (recommended addition, optional); uptime monitor on `/health/ready` for the 99.5% target (≈ 3.6 h downtime/month allowed).

---

## 18. Non-Functional Requirements → Technical Mapping

| SRS NFR | How we meet it | How we verify |
|---|---|---|
| Order + estimate < 3 s on 3G | lean JS budget, server-side estimate with indexed queries, cached catalog, CDN images, gzip/brotli | Lighthouse CI with 3G + 4× CPU throttle; k6 p95 on `/cart/estimate` and `/orders` |
| Scale 1 → 10+ cities | stateless API/worker, `cityId` everywhere, Redis for shared state, read-replica-ready queries | k6 stress at 10× pilot volume; no code change when adding a `City` row |
| Encryption at rest / in transit | managed-disk encryption + TLS 1.2+/HSTS; field-level AES-GCM for CNIC; no card data stored | config review, pen-test checklist |
| PCI-DSS | hosted gateway checkout only (SAQ-A scope), no PAN in logs/DB | log-scrub tests, SAQ-A questionnaire |
| 99.5 % uptime, no order loss | ≥ 2 API replicas, DB backups + PITR, idempotent order creation, IndexedDB draft + retry, queue retries | chaos test: kill API mid-order; k6 soak; restore drill |
| Usability < 2 min | UX targets (§16.3) | moderated usability test with 5 first-time users |
| Urdu/English + RTL | `next-intl`, logical CSS, Urdu fonts, bilingual catalog fields, notification templates in both | RTL visual QA on all screens |
| Compliance (SBP/PTA) | consent capture, data minimisation, retention policy, audit trail, vendor agreements | legal review before launch |
| Auditability | `OrderStatusHistory`, `Payment`, `AuditLog` (append-only triggers) | e2e tests assert a row per transition |
| Android 8+ / iOS 13+ / Chrome-Edge-Safari | Next.js browserslist, polyfills as needed | BrowserStack / device matrix |

---

## 19. Testing Strategy

| Layer | Tooling | Scope |
|---|---|---|
| Unit | Jest | services, state machine transition table, pricing/commission/promo math, slot generation |
| Integration/e2e (API) | Jest + Supertest + real Postgres/Redis (compose or Testcontainers) | each module's happy + failure paths; webhook idempotency; RBAC matrix |
| Frontend | Vitest/RTL (components), **Playwright** (journeys, en + ur) | register → order → track; vendor accept; rider deliver; admin approve |
| Contract | OpenAPI snapshot diff in CI | prevents silent API breaks |
| **Load (k6)** | `load-tests/` | see §19.1 |
| Security | `npm audit`, OWASP ZAP baseline, manual authZ tests | before pilot |
| Accessibility/perf | Lighthouse CI, axe | budgets enforced in CI |

**Coverage gates:** ≥ 80 % lines on `orders`, `payments`, `finance`, `auth`, `promos`.

### 19.1 k6 Plan

| Script | Type | Profile | Pass criteria |
|---|---|---|---|
| `smoke.js` | smoke | 1 VU, 1 min, hits health + login + discovery | 0 errors |
| `customer-journey.js` | load | ramp to **200 VUs** over 5 min, hold 10 min: OTP(bypass) → discovery → catalog → estimate → place order → poll status | `http_req_failed < 1%`; `p(95) < 800ms` API-side for reads, `< 1500ms` for `POST /orders` |
| `vendor-board.js` | load | 50 VUs polling `/vendor/orders` + accept/status changes | p95 < 600 ms |
| `rider-dispatch.js` | load | 100 VUs sending `/rider/location` every 15 s + job accept | p95 < 500 ms |
| `stress.js` | stress | step up to 1000 VUs until degradation | find breaking point; no data corruption |
| `soak.js` | soak | 50 VUs for 2–4 h | no memory growth, no connection-pool leaks, queue depth stable |
| `webhook-burst.js` | spike | 500 duplicate gateway webhooks | exactly one state change per gatewayRef |

```js
// load-tests/customer-journey.js (skeleton)
import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [{ duration: '5m', target: 200 }, { duration: '10m', target: 200 }, { duration: '2m', target: 0 }],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:estimate}': ['p(95)<800'],
    'http_req_duration{name:place_order}': ['p(95)<1500'],
  },
};

const BASE = __ENV.BASE_URL;
export default function () {
  const phone = `+92300${Math.floor(1000000 + Math.random() * 8999999)}`;
  http.post(`${BASE}/auth/otp/request`, JSON.stringify({ phone }), { headers: { 'Content-Type': 'application/json' } });
  const v = http.post(`${BASE}/auth/otp/verify`, JSON.stringify({ phone, code: '123456' }), { headers: { 'Content-Type': 'application/json' } });
  const token = v.json('data.accessToken');
  const h = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };

  const list = http.get(`${BASE}/vendors?lat=31.52&lng=74.35`, h);
  check(list, { 'vendors 200': (r) => r.status === 200 });
  // …catalog → estimate (tag name:estimate) → place order with Idempotency-Key: uuidv4() (tag name:place_order) → poll
  sleep(1);
}
```

> **Honest limit:** k6 measures server/API latency under load; it does **not** emulate a 3G radio or device CPU. The "< 3 s on 3G" requirement is verified by Lighthouse/Playwright with network throttling on top of k6's server-side budgets (together they cover it). Run k6 against **staging** with realistic data volume (≥ 100 k orders, ≥ 500 vendors seeded), not local.

---

## 20. Open Questions & Assumptions

| # | Topic | Assumption in this TRD | Needs decision |
|---|---|---|---|
| 1 | Native vs PWA (§2.2) | PWA for customer + rider in MVP | Confirm, or add React Native |
| 2 | Push / SMS / WhatsApp providers | FCM + a local SMS gateway + a WhatsApp BSP | Pick vendors; WhatsApp template approval takes days, so start early |
| 3 | Payment gateways | JazzCash, Easypaisa, Raast, one card gateway | Merchant onboarding is slow; start in parallel with Phase 0 |
| 4 | Pickup/delivery address | Same address used for both legs in MVP | Different drop address? |
| 5 | "Delivered → Customer confirms" | Proof of delivery (OTP/photo) completes delivery | Add explicit customer confirm / auto-confirm window? |
| 6 | COD + commission | Vendor earning credited after the rider's cash is settled | **Implemented as assumed:** the platform holds no money until the rider's deposit is recorded, so a cash order credits the vendor in the same step as that deposit (online-paid orders are credited at delivery). Revisit if the business wants to advance vendors against cash still in transit. |
| 7 | Delivery fee | Flat/zone fee configurable per city, shown in estimate | Pricing model; who earns it (rider pay vs platform) |
| 8 | Slots | Hourly windows within vendor hours, capacity-limited per vendor | Slot length and capacity rules |
| 9 | Vendor response window | Default 15 min, configurable per vendor, auto-reject on timeout | Confirm default |
| 10 | Cancellation & refunds | Customer can cancel until pickup; online payments refunded to source | Fees / policy |
| 11 | Hosting region / data residency | Nearest AWS/Azure region | Legal confirmation for SBP/PTA |
| 12 | Rider model | In-house riders first; courier adapter interface built, one partner integrated post-MVP | Which courier, if any, at launch |
| 13 | Rider pay | Per-job `riderFee` recorded; payout process is manual in MVP | Payroll approach |
| 14 | Pilot cities | Lahore, Karachi, Islamabad used as placeholders | Actual 3 cities |
