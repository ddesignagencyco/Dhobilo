# Dhoblio web (`apps/web`)

Next.js 16 App Router app holding all four role UIs. The **admin panel** is built; `(customer)`,
`(vendor)` and `(rider)` are not started yet.

This file is the handover note for anyone adding a new role UI — mainly the decisions that are easy to
undo by accident.

## Running it

```bash
# From the repo root: Postgres + Redis, migrations, seed
docker compose up -d postgres redis
npm run db:migrate && npm run db:seed

# API on :4000
npm run api:build && node apps/api/dist/main.js

# Web on :3000
echo 'API_BASE_URL=http://localhost:4000/api/v1' > apps/web/.env.local
npm run dev -w @dhoblio/web
```

Sign in at `/en/admin/login` with the seeded admin (`admin@dhoblio.local`, password from
`SEED_ADMIN_PASSWORD`, default `ChangeMe!12345`).

## Layout

```
src/
  app/
    [locale]/
      layout.tsx              # html/lang/dir, fonts, next-intl + TanStack Query providers
      admin/
        login/                # outside the panel shell on purpose (see "Route groups")
        (panel)/              # the authenticated shell: sidebar, header, user menu
    api/bff/[...path]/        # the browser's only route to the API
  components/ui/              # shadcn-style primitives (we own these files)
  components/admin/           # panel-specific building blocks
  i18n/                       # next-intl routing, navigation, request config
  lib/
    api/                      # server client, BFF client, errors, types
    auth/                     # session cookie, refresh, server actions
    admin/                    # nav definition and sidebar counts
  messages/{en,ur}.json
  proxy.ts                    # Next 16's middleware: locale, guard, token refresh
```

## The things worth knowing

### Tokens never reach the browser

The API issues a short access token in the response body and a refresh token in a cookie scoped to
`/api/v1/auth` with `SameSite=Strict` — unusable from a browser on a different origin. So this app asks
for the refresh token in the body (`x-token-transport: body`, which the API supports) and keeps **both**
tokens in its own `httpOnly` cookie on the web origin.

Consequences, all deliberate:

- No token is readable from JavaScript, so an XSS in a chart library cannot exfiltrate a session.
- The browser talks only to `/api/bff/*`, which attaches the token server-side. Same origin, no CORS.
- Web and API can live on unrelated domains with no SameSite negotiation.

**If you build the customer app:** the same BFF works, but think about whether a customer UI needs
server-side session at all — a PWA that must work offline may want a different trade-off. Do not weaken
the admin side to share one.

### Refresh-token rotation is the sharp edge

The API rotates the refresh token on every `/auth/refresh` and revokes the whole chain if a spent token is
presented again — that is how it detects theft. Two consequences:

1. **Parallel refreshes log the user out.** `lib/auth/refresh.ts` deduplicates by the token being spent so
   concurrent calls share one request. Do not bypass it.
2. **A React Server Component cannot set cookies**, so it cannot persist a rotation. `proxy.ts` refreshes
   *before* the render and writes the new cookie on the response, and also mutates `request.cookies` so
   the same render sees the fresh token. Without that, an admin would be bounced to the login screen every
   15 minutes.

### Route groups: login must sit outside the shell

`(panel)/layout.tsx` redirects to the login page when there is no session. If the login page were inside
that layout it would redirect to itself — an immediate loop. That is why login lives at
`admin/login/` and everything authenticated lives in `admin/(panel)/`.

### next-intl does not run on admin routes

`proxy.ts` sends customer/vendor/rider routes through next-intl's middleware but handles `/admin/*` itself.
next-intl was redirecting an already-correct `/en/admin/login` back to itself. The panel does not need
what it offers — an admin URL always carries its locale — so prefixing is a two-line decision in the
proxy. Translations are unaffected: they come from `setRequestLocale` plus `NextIntlClientProvider`.

**Keep next-intl's middleware for the customer app.** Locale detection from `Accept-Language` genuinely
matters there.

### `typedRoutes` is off

It is incompatible with next-intl's convention. Links are written locale-less (`/admin/vendors`) and
next-intl adds the prefix; `typedRoutes` only knows `/[locale]/admin/vendors` and rejects every correct
link. Always import `Link`/`useRouter`/`usePathname` from `@/i18n/navigation`, never from `next/*`.

### Money is a decimal string

The API serialises money as `Decimal(12,2)` via its `fmt()` helper, so every amount arrives as a **string
in rupees**: `"170.00"`. Never `Number()` it for arithmetic. `@dhoblio/shared` has `toPaisa`/`fromPaisa`/
`sumMoney`/`formatMoney`; use them. A float here reintroduces exactly the rounding the backend avoids, and
a total that reads one paisa off the vendor's earnings report is a support ticket.

### Permissions are the API's job

`@dhoblio/shared/admin-areas.ts` mirrors the API's permission matrix, but only to hide navigation an admin
cannot use. The API enforces every admin route with `@AdminAreaOnly`, reloading the role from the database
per request. `packages/shared/src/admin-areas.spec.ts` fails if the mirror drifts. Never treat the mirror,
or anything in the session cookie, as an authorisation decision.

### Response types are hand-written

`src/lib/api/types.ts` is maintained by hand. `src/lib/api/schema.d.ts` *is* generated
(`npm run api:types`) and CI checks it is current, but most admin routes document their responses as
`{ type: 'object' }` with an example and no property schema, so the generated types are `unknown` where it
counts. Each type in `types.ts` was read off the example in `apps/api/openapi.json`.

Worth fixing upstream (tracker X-2): adding `@ApiQuery`/`@ApiResponse` schemas to the admin controllers
would let that file be generated instead of maintained. Note also that **no admin list endpoint documents
its query parameters** — the filters are real, but they are only in the DTO classes.

### Lists are cursor-paginated with no total

Every admin list returns `meta.nextCursor` and no count. So pagination is "load more", never numbered
pages, and the sidebar badges come from a capped probe that reads `20+` at the cap rather than inventing a
figure (`lib/admin/counts.ts`).

## Conventions

- **RTL:** logical properties only — `ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*`, and `text-start`, never
  `text-left`. Check every screen at `/ur/...`.
- **Urdu copy:** write it against [`docs/Dhoblio-URDU-GLOSSARY.md`](../../docs/Dhoblio-URDU-GLOSSARY.md),
  which is enforced by `apps/api/src/common/urdu-glossary.spec.ts` — brand spelling, Pakistani register
  (آرڈر, not حکم نامہ), آپ never تم, Latin digits. **Add a glossary row before inventing a term.** The
  API's shipping notification templates are the reference implementation; a term that exists there wins.
- **Skeletons, not spinners** (TRD §16.2). On 3G a spinner says nothing about what is coming.
- **Errors show the request ID.** It is the handle support needs to find the line in the API's log.
- **Status colours are semantic.** `components/admin/status-badge.tsx` is the only place that decides them.
- **No concatenated i18n keys.** `t(\`x.${action}\`)` is invisible to grep and silently renders the key.

## Charts

`src/components/charts` is hand-rolled SVG — no Recharts or d3. Four forms (stat tile, time series,
ranked bars) did not justify the bundle against the TRD §16.2 budget, and rolling them keeps the mark
specs exact.

The two chart hues in `globals.css` are **validated, not chosen**. They clear all five checks of the
data-viz validator against this app's real card surfaces (`#ffffff` light, `#121921` dark): lightness
band, chroma floor, CVD separation (worst adjacent ΔE 13.5 protan), normal-vision floor (ΔE 28.0) and
3:1 contrast. Note `--chart-1` is deliberately **not** `--primary`: the brand teal
`oklch(0.52 0.1 196)` fails the chroma floor at 0.089 and reads gray in a chart.

Two categorical slots exist because no admin chart plots more than two series. **Adding a third means
re-running the validator on the new ordering**, not picking a colour that looks nice.

Rules worth not breaking:

- **One y-axis, ever.** GMV and commission are separate charts because they are an order of magnitude
  apart; on one scale commission flattens onto the baseline. A second y-axis is never the answer.
- **Zero baseline, never truncated.**
- A legend for two or more series; a single series is named by the card title instead.
- Labels are selective — the endpoint, not a number on every point.

## Not done yet

All 17 admin screens are built. Still open:

- **Phase 9 FE** — JS/route budgets (FE-9.1; the largest client chunk currently gzips to ~70 KB, but
  per-route first-load has not been measured against the 170 KB target), offline behaviour audit,
  the full RTL/Urdu pass with a native speaker, the axe accessibility pass, and the cross-browser matrix.
- **Playwright and Lighthouse CI** (FE-0.9, QA-9.7) — `test:e2e` is wired but has no specs.
- **PWA baseline** (FE-0.7) — no manifest or service worker yet.
- **Urdu admin copy** — `ur.json` mirrors every `en.json` key (614 each, parity enforced), but the admin
  strings are English by agreement. Filling them needs no code change.
- next-intl ships the **whole** message catalogue to the client. Fine at this size; worth splitting per
  route when the customer app lands, since it will add far more strings.
- Customer, vendor and rider UIs.
