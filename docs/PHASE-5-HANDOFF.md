# Phase 5 (rider and delivery): where things stand

Branch: `phase-5-rider-delivery` (stacked on `phase-4-order-lifecycle-notifications`). Backend only.

## Built and tested

- Rider registration and admin review (approve, reject, suspend, reactivate, audited CNIC reveal).
- Rider presence in Redis (online/offline, location pings, heartbeat expiry).
- Delivery jobs created from order events, job state machine, race-safe claim, offers with timeout, decline, release.
- Auto-dispatch worker (nearest rider, widening radius, ops alert once, sweeper), manual claim list.
- Proof of delivery: 4-digit code (hashed, attempt limit, expiry, resend) or proof photo.
- Rider earnings, customer-side delivery view and live rider position.
- Courier partner adapter with a mock partner, signed idempotent webhook, per-city switch.
- Admin dispatch board endpoints. Swagger docs for every new route, with a test comparing examples to real responses.
- Migration `20261025090000_rider_delivery_support` (applied to the dev DB).

## Still to do

1. **Flaky e2e test: cause found and fixed, not yet re-verified.** The delivery example in
   `test/swagger-examples.e2e-spec.ts` failed in about two of three full runs because the job list's first item depended on
   leftover jobs from other specs. The docs example now shows a job with a rider and the test queries one rider's jobs.
   Run the full e2e suite three times to confirm it is green.
2. **Run the full regression** (`npx tsc -p tsconfig.json --noEmit`, `npx jest`, `npx jest --config jest.e2e.config.js`).
   Last full run before the flake: 218 unit tests and 479 of 480 e2e tests passed.
3. **Docker smoke test.** Rebuild (`docker compose up -d --build`; stop any local dev server on port 4000 first) and walk
   through: rider register, admin approve, order, accept, rider claim, start, complete with code. The migration must
   apply on the Docker DB (the `migrate` container does it).
4. **README.** Add Phase 5 status, the new endpoints (rider app, admin riders and dispatch board, courier partners,
   customer delivery routes, webhook) and the new env variables (see `.env.example`, "Delivery and dispatch").
5. **Tracker.** BE-5.1 to BE-5.10 are ticked. Tick BE-5.11 once item 1 is fixed. The sign-in-as-rider demo data in the
   seed is not done (optional).
6. **Not done on purpose or not yet possible:** COD cash collection at delivery and settlement (Phase 6); a real
   courier partner adapter (only the mock exists); rider live position over SSE (customers poll
   `GET /orders/:id/rider-location`); a proxy number so riders can call customers (phones are masked).

## Things worth knowing

- A vendor or admin who moves an order to PICKED_UP / OUT_FOR_DELIVERY / DELIVERED themselves cancels that leg's open
  job, so nobody is sent for work already done.
- Dispatch only starts looking `DISPATCH_LEAD_MIN` (60) minutes before a job's window.
- The e2e database is wiped on every run, including the seeded `mock` courier partner row; tests recreate it.
