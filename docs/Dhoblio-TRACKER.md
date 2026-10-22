# Dhoblio — Build Tracker (Phase by Phase, BE + FE)

**How to use:** tick `[x]` when a task meets its Definition of Done. Update the dashboard counts at the end of each week. Task IDs are stable. Put blockers in the log at the bottom.
**Refs:** `FR-*` = SRS requirement · `TRD §` = `02-TRD.md` · `ERD` = `03-ERD.md`
**Legend:** `BE` backend (NestJS) · `FE` frontend (Next.js) · `OPS` infra/devops · `QA` testing

### Definition of Done (applies to every task)
- Code merged to `main` via PR with review, CI green (lint, typecheck, tests)
- Unit/integration tests for new logic (BE) or component/E2E tests for the flow (FE)
- Swagger/OpenAPI updated (BE) and typed client regenerated (FE)
- Both `en` and `ur` strings present; screen checked in RTL (FE)
- No secrets or PII in logs; audit log written for sensitive actions

---

## Dashboard

| Phase | Name | Target | Done / Total | Status |
|---|---|---|---|---|
| 0 | Foundation & DevOps | Wk 1–2 | {{P0}} | ⬜ Not started |
| 1 | Auth, Users & Addresses | Wk 3–4 | {{P1}} | ⬜ Not started |
| 2 | Vendor Onboarding, Approval & Catalog | Wk 5–7 | {{P2}} | ⬜ Not started |
| 3 | Discovery, Cart & Order Placement | Wk 8–10 | {{P3}} | ⬜ Not started |
| 4 | Order Lifecycle, Vendor Ops & Notifications | Wk 11–13 | {{P4}} | ⬜ Not started |
| 5 | Rider / Delivery Module | Wk 14–16 | {{P5}} | ⬜ Not started |
| 6 | Payments, COD, Commission & Payouts | Wk 17–20 | {{P6}} | ⬜ Not started |
| 7 | Reviews, Complaints, Promos & Referrals | Wk 21–22 | {{P7}} | ⬜ Not started |
| 8 | Admin Analytics, Reports & Announcements | Wk 23–24 | {{P8}} | ⬜ Not started |
| 9 | Hardening: Performance, Security, k6 | Wk 25–27 | {{P9}} | ⬜ Not started |
| 10 | UAT, Pilot Launch & Handover | Wk 28–30 | {{P10}} | ⬜ Not started |
| | **Total** | ~30 wks | {{TOTAL}} | |

> Timeline is a starting estimate for a small team (2 BE, 2 FE, 1 QA/DevOps part-time). Phases 0–1 are strictly sequential. After Phase 2, BE and FE can run in parallel per phase. **Start payment-gateway merchant onboarding, WhatsApp BSP template approval, and SMS gateway contracts in Week 1**; they have long lead times and block Phases 1, 4, 6.

**Status key:** ⬜ not started · 🟦 in progress · ✅ done · 🟥 blocked

---

## Phase 0 — Foundation & DevOps
**Goal:** a running skeleton: both apps boot in Docker, DB migrates, CI is green, one end-to-end "hello" path works.
**Entry:** SRS, TRD, ERD signed off; open questions in TRD §20 triaged.

### OPS
- [ ] **OPS-0.1** Create monorepo with npm workspaces (`apps/api`, `apps/web`, `packages/shared`, `packages/config`); shared eslint/tsconfig/prettier presets (TRD §4)
- [ ] **OPS-0.2** Multi-stage Dockerfiles (api/worker share an image, web) + `docker-compose.yml` with Postgres 16, Redis 7, MailHog, migrate, api, worker, web, k6 profile (TRD §17.1)
- [ ] **OPS-0.3** `.env.example`, secret-handling rules, `.gitignore`; document one-command start (`docker compose up`)
- [ ] **OPS-0.4** CI pipeline: lint → typecheck → unit → prisma validate/migrate on throwaway PG → build images (TRD §17.4)
- [ ] **OPS-0.5** Husky + lint-staged + commitlint; branch protection and PR template
- [ ] **OPS-0.6** Staging environment provisioned (managed Postgres, Redis, container runtime, TLS, domain); region decision recorded (TRD §20 #11)
- [ ] **OPS-0.7** Start external lead-time items: gateway merchant accounts, SMS gateway, WhatsApp BSP, Google Maps + Cloudinary + Firebase projects, Google SMTP app password

### BE
- [ ] **BE-0.1** NestJS bootstrap: `main.ts` (HTTP) + `worker.ts` (BullMQ only), global prefix `/api/v1`, helmet, CORS allow-list, compression
- [ ] **BE-0.2** Config module with zod-validated env; fail-fast on invalid values (incl. `OTP_BYPASS` in prod)
- [ ] **BE-0.3** Prisma 6 setup from ERD schema; first migration + raw SQL constraints/triggers (ERD §6.1); `PrismaService` with shutdown hooks
- [ ] **BE-0.4** Seed script: cities, service categories, admin user, global commission rule, demo data
- [ ] **BE-0.5** Common layer: response envelope, global exception filter with error codes, `ValidationPipe`, request-id middleware, pino logger with PII redaction
- [ ] **BE-0.6** Redis module + BullMQ module + Bull Board (admin-only, flag-controlled)
- [ ] **BE-0.7** Mail module (Nodemailer): MailHog locally, Google SMTP via env; test email endpoint (dev only)
- [ ] **BE-0.8** Cloudinary module: signed-upload endpoint skeleton + server-side verification helper
- [ ] **BE-0.9** Health module: `/health/live`, `/health/ready` (DB + Redis)
- [ ] **BE-0.10** Swagger/OpenAPI generation + CI artifact for client generation
- [ ] **BE-0.11** Audit module: interceptor/decorator `@Audit()` writing `AuditLog`
- [ ] **BE-0.12** Test harness: Jest unit config, Supertest e2e with real Postgres/Redis, factory helpers

### FE
- [ ] **FE-0.1** Next.js App Router + TypeScript strict + Tailwind; route groups `(customer)`, `(rider)`, `(vendor)`, `(admin)` under `[locale]`
- [ ] **FE-0.2** `next-intl` with `en`/`ur`, RTL `dir`, logical-property Tailwind conventions, Urdu font subset
- [ ] **FE-0.3** Design tokens + base components (Button, Input, Select, Modal, Toast, Skeleton, EmptyState, Pagination, Timeline) — mobile-first, large touch targets
- [ ] **FE-0.4** Typed API client generated from OpenAPI; token refresh interceptor; error-code → message mapping
- [ ] **FE-0.5** App shells: customer (bottom nav), rider, vendor (sidebar), admin (sidebar); locale switcher
- [ ] **FE-0.6** Route guard middleware by role; global error and not-found pages; offline banner
- [ ] **FE-0.7** PWA baseline: manifest, icons, service-worker with app-shell caching
- [ ] **FE-0.8** TanStack Query setup, form stack (React Hook Form + zod from `packages/shared`)
- [ ] **FE-0.9** Playwright setup (en + ur projects) + Lighthouse CI config with 3G throttling and JS budget

### QA
- [ ] **QA-0.1** Smoke e2e: web loads, calls `/health/ready`, renders in both locales

**Exit criteria:** `docker compose up` brings up everything; CI green; migration + seed run clean; en/ur shell renders; Swagger available.

---

## Phase 1 — Auth, Users & Addresses
**Goal:** all roles can sign in; customers can manage addresses with a map pin.
**Refs:** FR-C1, FR-C2 · TRD §6

### BE
- [x] **BE-1.1** `POST /auth/otp/request`: E.164 normalisation, Redis rate limits (phone + IP), hashed OTP with TTL, enqueue SMS job (FR-C1)
- [ ] **BE-1.2** `SmsProvider` interface + `MockSmsProvider` (logs OTP) + first real PK gateway adapter *(interface + mock done; real adapter waits on the SMS provider decision, TRD §20 item 2)*
- [x] **BE-1.3** `POST /auth/otp/verify`: attempt limit, user upsert, role-aware first login, `phoneVerifiedAt` (FR-C1)
- [x] **BE-1.4** JWT access (15 m) + rotating refresh (hashed in `Session`, reuse detection), `/auth/refresh`, `/auth/logout`
- [x] **BE-1.5** Admin email + password login (argon2id), lockout after repeated failures
- [x] **BE-1.6** RBAC: `JwtAuthGuard`, `RolesGuard`, `OwnershipGuard`, `@CurrentUser()` decorator; status checks (suspended users blocked)
- [x] **BE-1.7** `GET/PATCH /me` (name, locale), device-token register/remove
- [x] **BE-1.8** Addresses CRUD with lat/lng, city resolution, default address rule, soft delete (FR-C2)
- [x] **BE-1.9** `GET /cities` (active only)
- [x] **BE-1.10** Referral code generation on first login (used in Phase 7)
- [x] **BE-1.11** Tests: OTP rate-limit, expiry, brute-force, refresh reuse, RBAC matrix for every role

### FE
- [ ] **FE-1.1** Phone entry + OTP screen: numeric keypad, 6-box input, resend countdown, auto-submit, Urdu/English copy (FR-C1)
- [ ] **FE-1.2** Auth state: in-memory access token + httpOnly refresh cookie flow, silent refresh, logout
- [ ] **FE-1.3** Admin login page (email/password)
- [ ] **FE-1.4** Address book: list, add/edit/delete, set default (FR-C2)
- [ ] **FE-1.5** Map-pin picker: Google Maps + Places autocomplete, GPS "use my location", draggable pin, reverse-geocode prefill (FR-C2)
- [ ] **FE-1.6** Profile screen: name, language switch (persists to `/me`)
- [ ] **FE-1.7** City selection / detection with "not available in your city yet" state

### QA
- [ ] **QA-1.1** Playwright: login (OTP bypass) → add address → logout, en + ur
- [ ] **QA-1.2** Security pass: token handling, cookie flags, enumeration-safe responses

**Exit criteria:** every role can authenticate; customer has ≥ 1 saved address; refresh rotation verified.

---

## Phase 2 — Vendor Onboarding, Approval & Catalog
**Goal:** vendors register, admin approves, vendor catalog is live and editable.
**Refs:** FR-V1–V4, FR-V7, FR-A1, FR-A2 · TRD §15

### BE
- [x] **BE-2.1** Media signing: `POST /media/sign` (folder per entity, preset, type/size limits); private delivery for CNIC (TRD §15)
- [x] **BE-2.2** Field encryption util (AES-256-GCM + key-id) and HMAC hash for CNIC; unit tests incl. key rotation
- [x] **BE-2.3** `POST /vendor/register`: business, address/geo, CNIC (encrypted), documents (verify Cloudinary publicIds) → status `PENDING` (FR-V1)
- [x] **BE-2.4** Admin vendor review: list/filter by status, detail with signed doc URLs, approve/reject with reason, audit entries (FR-V2, FR-A1)
- [x] **BE-2.5** Decision notifications to vendor (email via SMTP + SMS) through the notifications queue
- [x] **BE-2.6** Admin suspend/reactivate vendor; suspended vendors vanish from discovery and cannot accept orders (FR-A2)
- [x] **BE-2.7** Service categories (read) + vendor catalog CRUD: item name (en/ur), service type, price, turnaround, active flag, soft delete (FR-V3)
- [x] **BE-2.8** Bulk catalog import (JSON/CSV) for quick vendor setup
- [x] **BE-2.9** Vendor hours + service radius + availability toggle (open/closed/busy) (FR-V4, FR-V7)
- [x] **BE-2.10** Vendor staff accounts (owner invites by phone; role `VENDOR_STAFF`)
- [x] **BE-2.11** Tests: only `APPROVED` vendors are live; vendor can only edit own data; price validation

### FE
- [ ] **FE-2.1** Vendor registration wizard (business info → map location → CNIC → photos → review/submit) with image compression before upload and resumable draft
- [ ] **FE-2.2** Direct-to-Cloudinary uploader with progress, retry, and preview (FR-V1)
- [ ] **FE-2.3** Vendor status screen: Pending / Rejected (with reason + resubmit) / Approved
- [ ] **FE-2.4** Vendor panel layout (responsive web) + dashboard placeholder
- [ ] **FE-2.5** Catalog manager: category groups, inline price edit, bilingual names, turnaround, enable/disable, bulk import (FR-V3)
- [ ] **FE-2.6** Hours editor + service-radius control with map circle preview (FR-V4)
- [ ] **FE-2.7** Open/Closed/Busy quick toggle in the header (FR-V7)
- [ ] **FE-2.8** Staff management screen
- [ ] **FE-2.9** Admin: vendor review queue + detail (docs viewer, approve/reject modal) (FR-A1)
- [ ] **FE-2.10** Admin: suspend/reactivate vendor with reason (FR-A2)

### QA
- [ ] **QA-2.1** Playwright: vendor registers → admin approves → vendor builds catalog → vendor appears in API list
- [ ] **QA-2.2** Verify CNIC never reachable via public URL; decryption audited

**Exit criteria:** ≥ 3 real/demo vendors fully onboarded in staging with bilingual catalogs.

---

## Phase 3 — Discovery, Cart & Order Placement
**Goal:** a customer finds a vendor, builds a cart, sees an instant estimate, picks slots, and places an order (payment = COD only for now).
**Refs:** FR-C3–C7 · TRD §8, §11

### BE
- [x] **BE-3.1** Vendor discovery endpoint: city + geo (bbox + Haversine, within each vendor's radius), filter by service type, min rating, max price; sort by distance/rating/price; cursor pagination (FR-C3)
- [x] **BE-3.2** Discovery caching in Redis with invalidation on vendor/catalog changes; `EXPLAIN` the hot query and confirm index use
- [x] **BE-3.3** Vendor detail + public catalog endpoints (FR-C4)
- [x] **BE-3.4** Cart: one cart per customer per vendor, add/update/remove/clear, validation against active items (FR-C5)
- [x] **BE-3.5** `POST /cart/estimate`: server-side totals (subtotal, delivery fee, discount hook, total, commission preview internal) — target < 200 ms (FR-C5)
- [x] **BE-3.6** Slot service: generate pickup/delivery windows from vendor hours + turnaround + capacity; delivery slot must be ≥ pickup + turnaround (FR-C6, FR-C7)
- [x] **BE-3.7** `POST /orders` with required `Idempotency-Key`: re-validate prices/slots/vendor availability, snapshot items + address + commission rate, create order `PLACED` + `OrderStatusHistory` in one transaction; generate `orderNo`
- [x] **BE-3.8** Commission resolution service (VENDOR > CATEGORY > GLOBAL) used at placement (FR-A3 groundwork)
- [x] **BE-3.9** Order read APIs for customer: list (cursor) + detail
- [x] **BE-3.10** Tests: idempotent retry creates one order; price changed after cart → clear error; out-of-radius/closed vendor rejected; slot rules

### FE
- [ ] **FE-3.1** Home/discovery: nearest-first list with skeleton loading, filter sheet (service type, rating, price), sort, infinite scroll (FR-C3)
- [ ] **FE-3.2** Optional map view of vendors (lazy-loaded to protect the JS budget)
- [ ] **FE-3.3** Vendor detail page: rating, hours, turnaround, catalog grouped by category with Urdu/English names (FR-C4) — server-rendered
- [ ] **FE-3.4** Cart UI: +/− steppers, sticky total bar, optimistic updates (FR-C5)
- [ ] **FE-3.5** Estimate display with breakdown, updates instantly on change (FR-C5)
- [ ] **FE-3.6** Slot picker (pickup then delivery) with unavailable-slot states (FR-C6, FR-C7)
- [ ] **FE-3.7** Checkout screen: address, slots, payment selector (COD enabled; others "coming soon"), notes, place order
- [ ] **FE-3.8** Resilient submit: draft persisted in IndexedDB, retry with same idempotency key, pending/confirmed states, never double-submits
- [ ] **FE-3.9** Order confirmation screen + order list/detail (basic)
- [ ] **FE-3.10** Route-level JS budget check in CI for discovery → checkout (≤ ~170 KB gz/route)

### QA
- [ ] **QA-3.1** Playwright: discover → cart → estimate → slots → place order (en + ur)
- [ ] **QA-3.2** Throttled-3G run (Lighthouse/Playwright) on the order path; record baseline
- [ ] **QA-3.3** k6 `smoke.js` + first cut of `customer-journey.js` on staging

**Exit criteria:** end-to-end order creation works on staging; estimate < 3 s on throttled 3G; duplicate submits impossible.

---

## Phase 4 — Order Lifecycle, Vendor Ops & Notifications
**Goal:** vendors work the order board; customers track in real time; every change notifies.
**Refs:** FR-C9, FR-C10, FR-C12, FR-V5, FR-V6 · TRD §9, §10, §12, §14

### BE
- [x] **BE-4.1** `OrderStateMachine`: explicit transition table with allowed actors, optimistic concurrency, transactional history write, post-commit domain events (TRD §10)
- [x] **BE-4.2** Vendor accept/reject with reason (FR-V5); vendor status updates received → in process → ready → handed to rider (FR-V6)
- [x] **BE-4.3** `order-timers` queue: delayed `vendor-response-timeout` → auto-reject/cancel and notify; idempotent
- [x] **BE-4.4** Customer cancel rules (before pickup), admin cancel, `CANCELLED` state
- [x] **BE-4.5** SSE endpoint `/orders/:id/events` with Redis pub/sub fan-out and `Last-Event-ID` replay; polling fallback endpoint (FR-C9)
- [x] **BE-4.6** Notifications module: orchestrator, channel interfaces (SMS, WhatsApp, Push/FCM, Email), en/ur templates, per-user locale, `Notification` log (FR-C10)
- [x] **BE-4.7** WhatsApp adapter via BSP + approved template map; fallback to SMS on failure (adapter + mock done; real BSP provider pending choice of provider)
- [x] **BE-4.8** FCM adapter + device-token cleanup on invalid-token responses (FCM v1 client + cleanup done, unit-tested; not yet run against live Firebase)
- [x] **BE-4.9** Order history with filters + `POST /orders/:id/reorder` (re-validates items/prices, returns a prefilled cart) (FR-C12)
- [x] **BE-4.10** Vendor order endpoints: board by status, counts, detail
- [x] **BE-4.11** Tests: every legal/illegal transition by every role; timeout fires once; notification fan-out per status

### FE
- [ ] **FE-4.1** Customer tracking screen: status timeline (Picked up → In process → Ready → Out for delivery → Delivered) via SSE with polling fallback and reconnect (FR-C9)
- [ ] **FE-4.2** Push permission prompt (contextual, post-first-order) + FCM service worker (FR-C10)
- [ ] **FE-4.3** Order history list + one-tap Reorder (FR-C12)
- [ ] **FE-4.4** Cancel order flow with confirmation
- [ ] **FE-4.5** Vendor order board: New / In process / Ready columns, response countdown, audible + vibrate alert, accept/reject modal (FR-V5)
- [ ] **FE-4.6** Vendor order detail: items, notes, slot, one-tap status buttons (FR-V6)
- [ ] **FE-4.7** Notification preferences screen (channels)
- [ ] **FE-4.8** Admin: orders list/search + detail with timeline and manual cancel (support tool)

### QA
- [ ] **QA-4.1** Playwright: customer places order → vendor accepts → statuses advance → customer sees live updates
- [ ] **QA-4.2** Network chaos: drop connection during tracking; verify reconnect and state correctness
- [ ] **QA-4.3** Verify audit rows exist for every transition

**Exit criteria:** an order moves PLACED → READY with live updates and correct notifications in en + ur.

---

## Phase 5 — Rider / Delivery Module
**Goal:** riders (or a courier partner) complete pickup and drop legs with proof.
**Refs:** FR-R1–R7 · TRD §9 (dispatch), §12

### BE
- [ ] **BE-5.1** Rider registration (CNIC encrypted, photo upload) → `PENDING`; admin approve/reject/suspend (FR-R1, FR-A2)
- [ ] **BE-5.2** `DeliveryJob` creation: PICKUP on `ACCEPTED`, DROP on `READY`; unique per order+type
- [ ] **BE-5.3** Rider online/offline + location ping stored in Redis GEO with heartbeat TTL (FR-R2)
- [ ] **BE-5.4** Dispatch worker: auto-assign nearest available approved rider with widening radius; re-assign on timeout/decline; ops alert if unassigned (FR-R2)
- [ ] **BE-5.5** Manual mode: riders list nearby available jobs and accept (race-safe claim) (FR-R2)
- [ ] **BE-5.6** Job status updates: accepted → in transit → completed/failed; drives order transitions (`PICKED_UP`, `OUT_FOR_DELIVERY`, `DELIVERED`) (FR-R4)
- [ ] **BE-5.7** Proof of delivery: photo (Cloudinary) or customer OTP (generated on `OUT_FOR_DELIVERY`, hashed, sent to customer) (FR-R5)
- [ ] **BE-5.8** Rider earnings: per-job fee record, daily summary, completed count (FR-R6)
- [ ] **BE-5.9** `CourierPartner` adapter interface (create job, cancel, webhook status, tracking ref) + mock partner; switchable per city (FR-R7)
- [ ] **BE-5.10** Admin dispatch endpoints: reassign, force-assign, mark failed
- [ ] **BE-5.11** Tests: two riders accept same job (one wins), OTP brute force limits, illegal rider transitions, partner webhook idempotency

### FE
- [ ] **FE-5.1** Rider registration + verification status screens (FR-R1)
- [ ] **FE-5.2** Rider home: online/offline switch, available jobs, current job (FR-R2)
- [ ] **FE-5.3** Job detail: pickup/drop addresses, customer contact (masked), deep link to Google Maps navigation (FR-R3)
- [ ] **FE-5.4** Status stepper with large buttons (FR-R4); handles flaky network via queued actions
- [ ] **FE-5.5** Proof capture: camera photo with compression, or OTP entry (FR-R5)
- [ ] **FE-5.6** Rider earnings and jobs completed (FR-R6)
- [ ] **FE-5.7** Customer app: show rider name/photo/status on tracking screen (+ rider position if enabled)
- [ ] **FE-5.8** Admin: rider approval queue, rider list, dispatch board (unassigned jobs, reassign) (FR-A2)
- [ ] **FE-5.9** Admin: courier-partner toggle per city (FR-R7)

### QA
- [ ] **QA-5.1** Playwright: full order from placement → pickup → process → drop with proof
- [ ] **QA-5.2** Real-device test of rider PWA on low-end Android (camera, geolocation, background behaviour)

**Exit criteria:** a complete order cycle (customer → vendor → rider → delivered) works on real devices in staging.

---

## Phase 6 — Payments, COD, Commission & Payouts
**Goal:** all payment methods work; money is tracked end to end; vendors can withdraw.
**Refs:** FR-C8, FR-V8, FR-V9, FR-A3, SRS §8.2 · TRD §13

### BE
- [ ] **BE-6.1** `PaymentGateway` interface + registry + mock gateway; `Payment` lifecycle and `Order.paymentStatus` sync
- [ ] **BE-6.2** JazzCash adapter: initiate, signature/hash verify, webhook, status inquiry, refund (FR-C8)
- [ ] **BE-6.3** Easypaisa adapter (same scope) (FR-C8)
- [ ] **BE-6.4** Card gateway adapter (PayFast/HBL) with hosted checkout — no PAN touches our systems (FR-C8)
- [ ] **BE-6.5** Raast adapter (bank-to-bank/QR) (SRS §8.2)
- [ ] **BE-6.6** Webhook controller: raw-body signature verification, idempotent upsert by `(gateway, gatewayRef)`, async processing (TRD §13.2)
- [ ] **BE-6.7** Payment timeout + reconciliation cron (poll pending > 10 min); auto-cancel unpaid orders
- [ ] **BE-6.8** Refunds on cancel/reject/dispute; refund ledger entries
- [ ] **BE-6.9** COD: `CodCollection` on delivery, rider COD balance, admin records `CodSettlement` (SRS §8.2)
- [ ] **BE-6.10** Commission rules CRUD (global/category/vendor) + effective-dating; admin endpoints (FR-A3)
- [ ] **BE-6.11** Finance queue: on `DELIVERED` post `ORDER_EARNING` / `COMMISSION` ledger entries idempotently (per agreed COD rule, TRD §20 #6)
- [ ] **BE-6.12** Vendor earnings API: day/week/month totals, commission deducted, per-order lines (FR-V8)
- [ ] **BE-6.13** Payout request (balance check under row lock), admin approve/pay/reject, ledger `PAYOUT` entry (FR-V9)
- [ ] **BE-6.14** Tests: duplicate webhooks, out-of-order webhooks, partial failures, ledger sums equal order math, payout can't exceed balance
- [ ] **BE-6.15** Log-scrubbing test: no card/wallet secrets or full payloads with PII in logs

### FE
- [ ] **FE-6.1** Checkout payment selector (COD, Card, JazzCash, Easypaisa, Raast) with clear fees/instructions (FR-C8)
- [ ] **FE-6.2** Gateway redirect/return pages with pending/success/failed states and safe retry (FR-C8)
- [ ] **FE-6.3** Payment status in order detail + "pay now" for pending online payments
- [ ] **FE-6.4** Vendor earnings dashboard: period switcher, totals, commission, per-order table (FR-V8)
- [ ] **FE-6.5** Vendor payout request (bank IBAN / wallet), history, status (FR-V9)
- [ ] **FE-6.6** Rider COD screen: cash to deposit, history
- [ ] **FE-6.7** Admin: commission configuration UI with effective dates (FR-A3)
- [ ] **FE-6.8** Admin: payments list, payout approval queue, COD settlement recording, refund action

### QA
- [ ] **QA-6.1** Gateway sandbox E2E per method (success, fail, timeout, abandon)
- [ ] **QA-6.2** Financial reconciliation test: sum(orders) = sum(ledger) + commission across a seeded dataset
- [ ] **QA-6.3** k6 `webhook-burst.js`

**Exit criteria:** each method completes a sandbox order; ledger reconciles to the rupee; refund and payout flows verified.

---

## Phase 7 — Reviews, Complaints, Promos & Referrals
**Goal:** trust and growth features.
**Refs:** FR-C11, FR-C13, FR-C14, FR-V10, FR-A5, FR-A6

### BE
- [ ] **BE-7.1** Reviews: vendor + rider, 1–5 + comment, only after `DELIVERED`, one per target per order; maintain `ratingAvg/ratingCount` transactionally (FR-C11)
- [ ] **BE-7.2** Complaints/redo: create with photos, vendor reply thread, admin assignment, statuses, resolution (refund/redo/reject) (FR-C13, FR-V10, FR-A5)
- [ ] **BE-7.3** Redo handling: linked follow-up jobs on the same order (TRD §10) with notifications
- [ ] **BE-7.4** Promo engine: percent/flat, caps, min order, validity, per-user + global limits, city scope; atomic redemption at order placement (FR-C14, FR-A6)
- [ ] **BE-7.5** Admin promo CRUD + usage stats (FR-A6)
- [ ] **BE-7.6** Referral: referee applies code at signup; reward on referee's first delivered order (credit as promo/discount) (FR-C14)
- [ ] **BE-7.7** Tests: promo race (limit exceeded under concurrency), review rules, complaint permissions

### FE
- [ ] **FE-7.1** Post-delivery rating prompt: vendor + rider stars and comment (FR-C11)
- [ ] **FE-7.2** Ratings display on vendor cards/detail; reviews list
- [ ] **FE-7.3** Complaint/redo form on order detail with photo upload; thread view (FR-C13)
- [ ] **FE-7.4** Vendor complaint inbox + reply (FR-V10)
- [ ] **FE-7.5** Admin dispute console: complaint queue, order context, decision actions (FR-A5)
- [ ] **FE-7.6** Promo code field in cart/checkout with live validation and savings display (FR-C14)
- [ ] **FE-7.7** Referral screen: share code via WhatsApp deep link, status of rewards (FR-C14)
- [ ] **FE-7.8** Admin promo management UI (FR-A6)

### QA
- [ ] **QA-7.1** Playwright: deliver → review → complaint → vendor response → admin resolution
- [ ] **QA-7.2** Promo abuse tests (stacking, replay, concurrent redemption)

**Exit criteria:** ratings visible in discovery; a complaint can be raised and resolved end to end; promo and referral discounts calculate correctly.

---

## Phase 8 — Admin Analytics, Reports & Announcements
**Goal:** operations visibility and communication.
**Refs:** FR-A4, FR-A7, FR-A8, SRS §7 Auditability

### BE
- [ ] **BE-8.1** Analytics aggregates: orders, GMV, revenue (commission), active users, top vendors, by city/date range (FR-A4)
- [ ] **BE-8.2** Nightly `analytics` rollup job into summary tables to keep dashboards fast
- [ ] **BE-8.3** Vendor-facing analytics (own orders/earnings summary) (SRS §9.1 "View analytics")
- [ ] **BE-8.4** Async report generation (`exports` queue): CSV and XLSX for orders, payments, payouts, COD, vendors; delivered via signed link (FR-A8)
- [ ] **BE-8.5** Announcements: segment by role/city/activity; fan-out via notifications queue with batching + rate limits (FR-A7)
- [ ] **BE-8.6** Audit log query API with filters (entity, actor, date)
- [ ] **BE-8.7** Tests: report totals match source tables; announcement batching respects provider limits

### FE
- [ ] **FE-8.1** Admin dashboard: KPI cards + charts (orders, revenue, active users, top vendors), city/date filters (FR-A4)
- [ ] **FE-8.2** Reports page: choose report + range, request, download when ready (FR-A8)
- [ ] **FE-8.3** Announcement composer with segment preview, send confirmation, history (FR-A7)
- [ ] **FE-8.4** Audit log viewer (filter/search/export)
- [ ] **FE-8.5** Vendor dashboard: today's orders, earnings summary, rating trend

### QA
- [ ] **QA-8.1** Cross-check analytics numbers against SQL on a seeded dataset
- [ ] **QA-8.2** Large export (100 k rows) completes without blocking the API

**Exit criteria:** admin can answer "how many orders/revenue today by city" from the dashboard and export the data.

---

## Phase 9 — Hardening: Performance, Security, k6
**Goal:** meet SRS §7 non-functional targets with evidence.
**Refs:** SRS §7 (all) · TRD §18, §19

### BE
- [ ] **BE-9.1** Rate limiting review on all public/sensitive endpoints; abuse protections on OTP, promos, webhooks
- [ ] **BE-9.2** Security headers, strict CORS, cookie flags, CSRF review for cookie-based refresh
- [ ] **BE-9.3** Query performance: `EXPLAIN ANALYZE` hot paths (discovery, orders list, vendor board, ledger); add/adjust indexes; confirm no N+1
- [ ] **BE-9.4** Connection pooling (Prisma/PgBouncer sizing) and Redis/BullMQ settings under load
- [ ] **BE-9.5** Data protection review: encryption at rest enabled, CNIC access audited, log redaction verified, retention/deletion policy implemented
- [ ] **BE-9.6** Backups + restore drill (PITR); document RTO/RPO
- [ ] **BE-9.7** Graceful shutdown + zero-downtime deploy; ≥ 2 API replicas behind LB
- [ ] **BE-9.8** Fix issues found by ZAP baseline scan and dependency audit
- [ ] **BE-9.9** Queue resilience: DLQ/failed-job alerts, stuck-job detection, poison-job handling

### FE
- [ ] **FE-9.1** Meet JS/route budgets; code-split maps and charts; Cloudinary `f_auto,q_auto,dpr_auto` everywhere
- [ ] **FE-9.2** Offline/flaky-network behaviour audit: cached shell, cached vendor list, queued actions, clear status messaging
- [ ] **FE-9.3** Full RTL/Urdu QA across all four role UIs; font loading and line-height review
- [ ] **FE-9.4** Accessibility pass (axe): contrast, focus, labels, tap-target size
- [ ] **FE-9.5** Usability test with 5 first-time users: booking in < 2 min without a tutorial; fix findings
- [ ] **FE-9.6** Cross-browser/device matrix: Android 8+, iOS 13+, Chrome/Edge/Safari for panels

### OPS / QA (k6 and verification)
- [ ] **QA-9.1** Seed staging with realistic volume (≥ 500 vendors, ≥ 100 k orders)
- [ ] **QA-9.2** k6 `customer-journey.js` at 200 VUs — thresholds in TRD §19.1 met
- [ ] **QA-9.3** k6 `vendor-board.js` and `rider-dispatch.js` — thresholds met
- [ ] **QA-9.4** k6 `stress.js` — record breaking point; confirm graceful degradation and no data corruption
- [ ] **QA-9.5** k6 `soak.js` (2–4 h) — no memory/connection leaks, queue depth stable
- [ ] **QA-9.6** Chaos tests: kill API mid-order, Redis restart, DB failover, gateway timeout; no lost orders/payments (SRS §7 Reliability)
- [ ] **QA-9.7** Lighthouse CI on throttled 3G for the order path: interactive < 3 s (SRS §7 Performance)
- [ ] **OPS-9.1** Uptime monitor, alerts (5xx rate, p95 latency, queue depth, failed jobs, DB CPU/connections)
- [ ] **OPS-9.2** Pen-test / security review sign-off; PCI SAQ-A checklist completed

**Exit criteria:** every NFR in TRD §18 has a recorded passing result; no open critical/high security findings.

---

## Phase 10 — UAT, Pilot Launch & Handover
**Goal:** go live safely in the pilot cities and learn fast.
**Refs:** SRS §1.2, §2.6, §10.1

### OPS
- [ ] **OPS-10.1** Production environment provisioned and hardened; secrets in secret manager; production gateways/SMS/WhatsApp/FCM keys set
- [ ] **OPS-10.2** Production deploy pipeline with manual approval + rollback procedure rehearsed
- [ ] **OPS-10.3** Runbooks: payment incident, stuck orders, queue backlog, rider no-show, data-restore
- [ ] **OPS-10.4** Go-live checklist signed (legal, payments, data, monitoring, support)

### BE
- [ ] **BE-10.1** Production seed: real cities, categories, global commission, admin accounts (no demo data)
- [ ] **BE-10.2** Feature flags/config for per-city enablement and kill switches (payments, courier partner, notifications channel)
- [ ] **BE-10.3** Final data-migration dry run + backup before launch

### FE
- [ ] **FE-10.1** Production copy review (English + Urdu by a native speaker), legal pages: Terms, Privacy, Refund/Cancellation, vendor agreement acceptance
- [ ] **FE-10.2** Analytics/event tracking for the funnel (open → cart → order → delivered)
- [ ] **FE-10.3** In-app support/contact entry points (WhatsApp deep link)

### QA / Business
- [ ] **QA-10.1** UAT with real vendors and riders in each pilot city; defect triage and fix
- [ ] **QA-10.2** Pilot vendor onboarding session + printed quick-start (Urdu)
- [ ] **QA-10.3** Soft launch (limited vendors/customers), daily metrics review for 2 weeks
- [ ] **QA-10.4** Post-pilot retrospective + backlog for Post-MVP items (SRS §10.2: subscriptions, loyalty, in-app chat, allied services, AI photo estimation)

**Exit criteria:** pilot live in all target cities; SLOs (99.5 %) tracked; support process running.

---

## Cross-Phase Tracks (ongoing)

- [ ] **X-1** Weekly: dependency updates, `npm audit`, rotate any exposed keys
- [ ] **X-2** Keep OpenAPI, ERD, and TRD in sync with code (update docs in the same PR as the change)
- [ ] **X-3** Maintain bilingual message catalog; no hard-coded strings
- [ ] **X-4** Keep k6 smoke in CI on staging after each deploy
- [ ] **X-5** Legal/compliance: SECP registration, SBP/PTA review, vendor agreement, data-protection policy (SRS §10.1) — owner: business side

---

## SRS Traceability (every FR has at least one owning task)

| FR | Tasks | FR | Tasks |
|---|---|---|---|
| FR-C1 | BE-1.1–1.4, FE-1.1–1.2 | FR-V1 | BE-2.2–2.3, FE-2.1–2.2 |
| FR-C2 | BE-1.8, FE-1.4–1.5 | FR-V2 | BE-2.4, FE-2.9 |
| FR-C3 | BE-3.1–3.2, FE-3.1–3.2 | FR-V3 | BE-2.7–2.8, FE-2.5 |
| FR-C4 | BE-3.3, FE-3.3 | FR-V4 | BE-2.9, FE-2.6 |
| FR-C5 | BE-3.4–3.5, FE-3.4–3.5 | FR-V5 | BE-4.2–4.3, FE-4.5 |
| FR-C6 | BE-3.6, FE-3.6 | FR-V6 | BE-4.2, FE-4.6 |
| FR-C7 | BE-3.6, FE-3.6 | FR-V7 | BE-2.9, FE-2.7 |
| FR-C8 | BE-6.1–6.7, FE-6.1–6.3 | FR-V8 | BE-6.12, FE-6.4 |
| FR-C9 | BE-4.5, FE-4.1 | FR-V9 | BE-6.13, FE-6.5 |
| FR-C10 | BE-4.6–4.8, FE-4.2 | FR-V10 | BE-7.2, FE-7.4 |
| FR-C11 | BE-7.1, FE-7.1–7.2 | FR-A1 | BE-2.4, FE-2.9 |
| FR-C12 | BE-4.9, FE-4.3 | FR-A2 | BE-2.6, BE-5.1, FE-2.10, FE-5.8 |
| FR-C13 | BE-7.2–7.3, FE-7.3 | FR-A3 | BE-3.8, BE-6.10, FE-6.7 |
| FR-C14 | BE-7.4, BE-7.6, FE-7.6–7.7 | FR-A4 | BE-8.1–8.3, FE-8.1 |
| FR-R1 | BE-5.1, FE-5.1 | FR-A5 | BE-7.2, FE-7.5 |
| FR-R2 | BE-5.3–5.5, FE-5.2 | FR-A6 | BE-7.4–7.5, FE-7.8 |
| FR-R3 | FE-5.3 | FR-A7 | BE-8.5, FE-8.3 |
| FR-R4 | BE-5.6, FE-5.4 | FR-A8 | BE-8.4, FE-8.2 |
| FR-R5 | BE-5.7, FE-5.5 | | |
| FR-R6 | BE-5.8, FE-5.6 | | |
| FR-R7 | BE-5.9, FE-5.9 | | |

---

## Weekly Status Log

| Week | Phase | Done this week | Next | Blockers / risks | Decisions needed |
|---|---|---|---|---|---|
| 1 | 0 | | | | TRD §20 items 1–3 |
| 2 | | | | | |
