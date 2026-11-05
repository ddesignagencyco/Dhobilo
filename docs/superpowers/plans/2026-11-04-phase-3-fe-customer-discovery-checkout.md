# Phase 3 FE: Customer Discovery & Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete customer discovery, cart, and checkout flow — enabling customers to find vendors, browse catalogs, add items to cart, select pickup/delivery slots, and place orders with instant price estimates.

**Architecture:** The customer app follows the Phase 0 FE foundation (Next.js App Router, route groups, Tailwind v4, shadcn-style primitives, TanStack Query). Discovery flows through a filterable/sortable vendor list with optional map view. Cart persists in-memory with server-side validation on estimate and checkout. Slot selection uses a time-picker driven by vendor hours + turnaround. Checkout is resilient: draft in IndexedDB, idempotent submit, safe retry. All screens are bilingual (en/ur with RTL) and mobile-responsive. JS budget enforced per route.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Tailwind v4, React Hook Form + zod (schemas in `packages/shared`), TanStack Query v5, Cloudinary for any customer-uploaded images, generated API client from OpenAPI.

**Spec:** [Dhoblio-SRS.md](../Dhoblio-SRS.md) FR-C3–C7; [Dhoblio-TRACKER.md](../Dhoblio-TRACKER.md) Phase 3 FE (FE-3.1–3.10).

## Global Constraints

- All strings must exist in both `en` and `ur` message catalogs; no hard-coded copy (enforced in CI).
- Cart and checkout draft are persisted in IndexedDB; survive app crashes and tab closes.
- Idempotency-Key header on `POST /orders` prevents duplicate orders; implementer handles safe retry.
- Mobile-first design; large touch targets (≥44px); tested on low-bandwidth (3G throttle).
- Responsive web (mobile/tablet/desktop); discovery list scrolls; cart overlay or drawer.
- Urdu terminology enforced by `apps/api/src/common/urdu-glossary.spec.ts`; add glossary row before coining a term.
- JS budget per route: discovery ≤ ~170 KB gz (including maps if lazy-loaded); checkout ≤ ~140 KB gz.
- No customer financial data (addresses, payment info) is ever cached in localStorage; only memory + server-side session.
- Estimate < 3 seconds on 3G throttle (SRS §7).

---

## Task 1: Customer Shell & Bottom Navigation

**Status:** Pre-existing from Phase 1 FE. Skip.

---

## Task 2: Discovery Hooks & API Client Setup

**Files:**
- Create: `apps/web/src/lib/customer/hooks/use-discovery.ts`
- Create: `apps/web/src/lib/customer/hooks/use-vendor-detail.ts`
- Create: `apps/web/src/lib/customer/queries.ts`
- Modify: `packages/shared/src/schemas/customer.ts` (create file with schemas)

**Interfaces:**
- Consumes: generated API client (GET /discovery, GET /vendors/:id)
- Produces: TanStack Query hooks for discovery filtering/sorting and vendor detail

### Step 1: Create discovery filter & sort schemas in packages/shared

```typescript
// packages/shared/src/schemas/customer.ts
export const discoveryFiltersSchema = z.object({
  serviceType: z.string().optional(),
  minRating: z.number().min(1).max(5).optional(),
  maxPrice: z.number().min(0).optional(),
  sortBy: z.enum(['distance', 'rating', 'price']).default('distance'),
});

export type DiscoveryFilters = z.infer<typeof discoveryFiltersSchema>;
```

### Step 2: Create discovery hook

```typescript
// apps/web/src/lib/customer/hooks/use-discovery.ts
// useDiscovery(filters, cursor): TanStack Query for GET /discovery?...
// Returns: { vendors: VendorCard[], nextCursor, hasMore }
// Supports cursor-based pagination
```

### Step 3: Create vendor detail hook

```typescript
// apps/web/src/lib/customer/hooks/use-vendor-detail.ts
// useVendorDetail(vendorId): TanStack Query for GET /vendors/:id
// Returns: vendor info + catalog items grouped by category
```

### Step 4: Create TanStack Query config

```typescript
// apps/web/src/lib/customer/queries.ts
// Export queryKeys for discovery, vendor detail, cache management
// Set staleTime, gcTime appropriately
```

### Step 5: Test hooks locally

Write a simple test component that calls useDiscovery and useVendorDetail.

### Step 6: Commit

```bash
git add packages/shared/src/schemas/customer.ts apps/web/src/lib/customer/hooks/use-discovery.ts apps/web/src/lib/customer/hooks/use-vendor-detail.ts apps/web/src/lib/customer/queries.ts
git commit -m "feat: discovery and vendor detail hooks with TanStack Query"
```

---

**(Remaining 18 tasks abbreviated for context; full plan in editor)**

---

**Expected execution: 20 tasks over inline native mode, single final review at end.**