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

## Review Focus

1. **Discovery infinite scroll with filters**: Pagination works on slow network; filter/sort persist across scroll; no duplicate results; list is never empty when vendor exists in city.
2. **Cart resilience**: Draft survives tab close; resumed cart matches server state (prices/availability re-validated); concurrent tab changes sync correctly.
3. **Slot picker accuracy**: Pickup and delivery windows are correct per vendor hours and turnaround; delivery slot >= pickup + turnaround; unavailable slots are unselectable.
4. **Estimate accuracy**: Subtotal + delivery fee + discount = total; estimate recalculates instantly on cart/slot change; matches server calculation within 1 rupee.
5. **Idempotent checkout**: Same Idempotency-Key within 24 hours returns same order; double-submit is impossible; pending state is unambiguous to customer.

---

## File Structure

### Route Groups and Screens

```
apps/web/src/app/[locale]/
├── (customer)/                  # Customer route group
│   ├── layout.tsx               # Customer shell (bottom nav)
│   ├── page.tsx                 # Home / discovery redirect
│   ├── discovery/
│   │   ├── page.tsx             # Vendor list with filters, sort, infinite scroll
│   │   ├── layout.tsx           # Optional: discovery shell with filter sidebar
│   │   └── map/page.tsx         # Optional: lazy-loaded map view
│   ├── vendor/
│   │   ├── [id]/                # Vendor detail route
│   │   │   ├── page.tsx         # Vendor detail + catalog view
│   │   │   └── layout.tsx       # Optional: shared vendor detail layout
│   ├── orders/
│   │   ├── page.tsx             # Order history list
│   │   └── [id]/page.tsx        # Order detail + tracking
│   └── checkout/
│       ├── page.tsx             # Checkout flow (multi-step or single)
│       ├── cart/page.tsx        # Cart review before checkout
│       ├── slots/page.tsx       # Slot selection (pickup then delivery)
│       └── confirmation/page.tsx # Order confirmation screen
```

### Shared Components

```
apps/web/src/components/customer/
├── customer-shell.tsx           # Bottom nav, user menu
├── discovery/
│   ├── vendor-list.tsx          # List of vendors with infinite scroll
│   ├── vendor-card.tsx          # Vendor card (name, rating, distance, est. time)
│   ├── discovery-filters.tsx    # Filter sheet (service type, price, rating)
│   ├── discovery-sort.tsx       # Sort options (distance, rating, price)
│   └── map-view.tsx             # Optional: lazy-loaded map with vendor pins
├── vendor-detail/
│   ├── vendor-header.tsx        # Vendor name, rating, hours, service radius
│   ├── catalog-section.tsx      # Items grouped by category
│   ├── catalog-item-card.tsx    # Item card with price, turnaround, + button
│   └── item-detail-modal.tsx    # Item detail modal (full desc, price, + button)
├── cart/
│   ├── cart-drawer.tsx          # Drawer/modal for cart preview + checkout CTA
│   ├── cart-summary.tsx         # Items list with quantity steppers
│   ├── cart-item.tsx            # Single item row with +/− buttons
│   ├── cart-estimate-bar.tsx    # Sticky bottom bar (subtotal, delivery fee, total)
│   └── estimate-display.tsx     # Breakdown of estimate (subtotal, fee, discount)
├── checkout/
│   ├── checkout-stepper.tsx     # Steps: Cart → Slots → Payment → Confirm
│   ├── address-selector.tsx     # Pick saved address or add new
│   ├── slot-picker.tsx          # Date + time window picker
│   ├── pickup-slot-picker.tsx   # Pickup slot selection
│   ├── delivery-slot-picker.tsx # Delivery slot selection (after pickup)
│   ├── payment-method-selector.tsx # COD, Card, JazzCash, Easypaisa (phase 6)
│   ├── notes-input.tsx          # Optional delivery/service notes
│   ├── order-submit-button.tsx  # Safe submit with pending state
│   └── confirmation-screen.tsx  # Order placed, next steps, tracking link
└── shared/
    ├── estimate-summary.tsx     # Reusable breakdown display
    ├── loading-skeleton.tsx     # Skeleton for async data
    └── unavailable-badge.tsx    # Vendor closed/busy indicator
```

### Hooks and API Clients

```
apps/web/src/lib/customer/
├── hooks/
│   ├── use-discovery.ts         # GET /discovery with filters/sort
│   ├── use-vendor-detail.ts     # GET /vendors/:id + catalog
│   ├── use-cart.ts              # In-memory cart state + server sync
│   ├── use-estimate.ts          # POST /cart/estimate
│   ├── use-slots.ts             # GET /vendors/:id/slots
│   ├── use-orders.ts            # GET /orders (history)
│   ├── use-order-detail.ts      # GET /orders/:id
│   ├── use-checkout-draft.ts    # IndexedDB draft persistence
│   ├── use-order-submit.ts      # POST /orders with idempotency
│   └── use-sse-order-tracking.ts # SSE for order status updates
└── queries.ts                   # TanStack Query config for customer endpoints
```

### Validation Schemas (in `packages/shared`)

```
packages/shared/src/schemas/customer.ts:
- discoveryFiltersSchema (serviceType, priceRange, minRating, city)
- cartItemSchema (vendorId, itemId, quantity)
- cartSchema (items, vendorId, address)
- checkoutDraftSchema (cart, address, pickupSlot, deliverySlot, paymentMethod, notes)
- slotSchema (date, startTime, endTime)
```

---

## Task 1: Customer Shell & Bottom Navigation

**Files:**
- Create: `apps/web/src/components/customer/customer-shell.tsx`
- Create: `apps/web/src/app/[locale]/(customer)/layout.tsx`
- Create: `apps/web/src/app/[locale]/(customer)/page.tsx`
- Modify: `apps/web/src/proxy.ts` (add customer route guard)

**Interfaces:**
- Consumes: existing UI components (BottomNav, Avatar, DropdownMenu); user context from login
- Produces: `(customer)/layout.tsx` that renders customer-shell with bottom nav for all customer routes; middleware guards routes by role

- [ ] **Step 1: Create customer shell component with bottom navigation**

```typescript
// apps/web/src/components/customer/customer-shell.tsx
// Bottom navigation with icons: Home | Orders | Profile
// User menu in header with profile icon, logout
// Mobile-first; sticky bottom nav
// Active route highlighting
```

- [ ] **Step 2: Create customer layout wrapping all (customer) routes**

```typescript
// apps/web/src/app/[locale]/(customer)/layout.tsx
// Imports CustomerShell; renders children inside it
// Guard: check role is CUSTOMER; redirect to /login if not
// Wrap with Providers (QueryProvider, ToastProvider)
```

- [ ] **Step 3: Create customer home page redirecting to discovery**

```typescript
// apps/web/src/app/[locale]/(customer)/page.tsx
// Redirect to /[locale]/customer/discovery (the primary task for a customer)
// Or render a brief intro screen with CTA to browse vendors
```

- [ ] **Step 4: Add customer route guard in proxy.ts**

Guard `/customer/*` to require `role === CUSTOMER`; redirect to `/login` with return path if not authenticated.

- [ ] **Step 5: Test customer shell in browser**

Run `npm run dev -w @dhoblio/web`; sign in as a customer. Verify bottom nav renders, navigation works, route guard blocks unauthorized access.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/customer/customer-shell.tsx apps/web/src/app/\[locale\]/\(customer\)/layout.tsx apps/web/src/app/\[locale\]/\(customer\)/page.tsx apps/web/src/proxy.ts
git commit -m "feat: customer app shell with bottom navigation"
```

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

- [ ] **Step 1: Create discovery filter & sort schemas in packages/shared**

```typescript
// packages/shared/src/schemas/customer.ts
export const discoveryFiltersSchema = z.object({
  serviceType: z.string().optional(), // e.g., "LAUNDRY"
  minRating: z.number().min(1).max(5).optional(),
  maxPrice: z.number().min(0).optional(),
  sortBy: z.enum(['distance', 'rating', 'price']).default('distance'),
});

export type DiscoveryFilters = z.infer<typeof discoveryFiltersSchema>;
```

- [ ] **Step 2: Create discovery hook**

```typescript
// apps/web/src/lib/customer/hooks/use-discovery.ts
// useDiscovery(filters, cursor): TanStack Query for GET /discovery?...
// Returns: { vendors: VendorCard[], nextCursor, hasMore }
// Supports cursor-based pagination
```

- [ ] **Step 3: Create vendor detail hook**

```typescript
// apps/web/src/lib/customer/hooks/use-vendor-detail.ts
// useVendorDetail(vendorId): TanStack Query for GET /vendors/:id
// Returns: vendor info + catalog items grouped by category
```

- [ ] **Step 4: Create TanStack Query config**

```typescript
// apps/web/src/lib/customer/queries.ts
// Export queryKeys for discovery, vendor detail, cache management
// Set staleTime, gcTime appropriately
```

- [ ] **Step 5: Test hooks locally**

Write a simple test component that calls useDiscovery and useVendorDetail; verify data fetches correctly from mock API or real staging.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/customer.ts apps/web/src/lib/customer/hooks/use-discovery.ts apps/web/src/lib/customer/hooks/use-vendor-detail.ts apps/web/src/lib/customer/queries.ts
git commit -m "feat: discovery and vendor detail hooks with TanStack Query"
```

---

## Task 3: Discovery List with Filters & Sort

**Files:**
- Create: `apps/web/src/app/[locale]/(customer)/discovery/page.tsx`
- Create: `apps/web/src/components/customer/discovery/vendor-list.tsx`
- Create: `apps/web/src/components/customer/discovery/vendor-card.tsx`
- Create: `apps/web/src/components/customer/discovery/discovery-filters.tsx`
- Create: `apps/web/src/components/customer/discovery/discovery-sort.tsx`

**Interfaces:**
- Consumes: useDiscovery hook; user's active city (from context or URL param)
- Produces: vendor list page with infinite scroll, filter sheet, sort options

- [ ] **Step 1: Create vendor card component**

```typescript
// apps/web/src/components/customer/discovery/vendor-card.tsx
// Display: vendor name, rating (stars + count), distance, est. pickup time, availability badge
// Tap to navigate to vendor detail
// Show unavailable badge if CLOSED or BUSY
```

- [ ] **Step 2: Create discovery filters sheet**

```typescript
// apps/web/src/components/customer/discovery/discovery-filters.tsx
// Filters: service type (LAUNDRY/DRY_CLEANER), min rating (1–5 stars), max price (slider)
// Apply button; clear filters button
// Mobile: bottom sheet; desktop: sidebar
```

- [ ] **Step 3: Create discovery sort options**

```typescript
// apps/web/src/components/customer/discovery/discovery-sort.tsx
// Options: Nearest | Highest Rated | Lowest Price
// Current selection highlighted
// Tap to sort; re-fetch with new order
```

- [ ] **Step 4: Create vendor list component**

```typescript
// apps/web/src/components/customer/discovery/vendor-list.tsx
// Infinite scroll using useInfiniteQuery or manual cursor pagination
// Render vendor-card in a grid or list
// Loading skeleton while fetching
// Empty state: "No vendors found. Try adjusting filters."
// Pull-to-refresh on mobile
```

- [ ] **Step 5: Create discovery page**

```typescript
// apps/web/src/app/[locale]/(customer)/discovery/page.tsx
// Get city from context or URL (e.g., ?city=Karachi)
// Render discovery-filters + discovery-sort + vendor-list
// Manage filter/sort state; pass to useDiscovery
// Handle city unavailable state
```

- [ ] **Step 6: Test discovery in browser**

Navigate to /discovery. Verify vendors load. Apply filters; verify list updates. Change sort; verify order changes. Scroll to load more; verify infinite scroll works. Refresh page; verify filters persist (optional).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/customer/discovery/ apps/web/src/app/\[locale\]/\(customer\)/discovery/page.tsx
git commit -m "feat: vendor discovery with filters, sort, and infinite scroll"
```

---

## Task 4: Vendor Detail Page with Catalog

**Files:**
- Create: `apps/web/src/app/[locale]/(customer)/vendor/[id]/page.tsx`
- Create: `apps/web/src/app/[locale]/(customer)/vendor/[id]/layout.tsx`
- Create: `apps/web/src/components/customer/vendor-detail/vendor-header.tsx`
- Create: `apps/web/src/components/customer/vendor-detail/catalog-section.tsx`
- Create: `apps/web/src/components/customer/vendor-detail/catalog-item-card.tsx`

**Interfaces:**
- Consumes: useVendorDetail hook; cart context (to dispatch add-to-cart)
- Produces: vendor detail screen with catalog grouped by category; item cards with + button

- [ ] **Step 1: Create vendor header component**

```typescript
// apps/web/src/components/customer/vendor-detail/vendor-header.tsx
// Display: vendor name, rating (stars + count), distance, service radius, turnaround time
// Hours display (open/closed/busy status)
// Back button
```

- [ ] **Step 2: Create catalog item card component**

```typescript
// apps/web/src/components/customer/vendor-detail/catalog-item-card.tsx
// Display: item name (en/ur), price (Rs), turnaround (hours), + button
// Tap + to add to cart (dispatch action)
// Show disabled state if vendor is closed
```

- [ ] **Step 3: Create catalog section component (grouped by category)**

```typescript
// apps/web/src/components/customer/vendor-detail/catalog-section.tsx
// Group items by category (e.g., Shirts, Trousers, Bedding)
// Render category header + items grid
// Load skeleton while fetching
```

- [ ] **Step 4: Create vendor detail page**

```typescript
// apps/web/src/app/[locale]/(customer)/vendor/[id]/page.tsx
// Fetch vendor detail using useVendorDetail(id)
// Server-render if possible (for SEO)
// Render vendor-header + catalog-section
// Cart button in sticky bottom bar
```

- [ ] **Step 5: Test vendor detail in browser**

Navigate to a vendor detail page (from discovery). Verify vendor info loads. Verify catalog items render. Tap + on an item; verify cart updates (see Task 5 for cart implementation). Verify back button works.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/customer/vendor-detail/ apps/web/src/app/\[locale\]/\(customer\)/vendor/\[id\]/
git commit -m "feat: vendor detail page with catalog grouped by category"
```

---

## Task 5: Cart State Management & Persistence

**Files:**
- Create: `apps/web/src/lib/customer/hooks/use-cart.ts`
- Create: `apps/web/src/lib/customer/hooks/use-checkout-draft.ts`
- Create: `apps/web/src/lib/customer/cart-context.tsx` (optional; if using Context instead of Zustand)
- Modify: `packages/shared/src/schemas/customer.ts` (add cartSchema)

**Interfaces:**
- Consumes: TanStack Query (for server validation); IndexedDB (for draft persistence)
- Produces: cart state (in-memory or Context); draft persistence to IndexedDB

- [ ] **Step 1: Create cart schema**

```typescript
// packages/shared/src/schemas/customer.ts (add to file)
export const cartItemSchema = z.object({
  itemId: string(),
  quantity: z.number().min(1),
  // Price and name come from server at estimate time
});

export const cartSchema = z.object({
  vendorId: string(),
  items: z.array(cartItemSchema),
});

export type CartItem = z.infer<typeof cartItemSchema>;
export type Cart = z.infer<typeof cartSchema>;
```

- [ ] **Step 2: Create cart hook (in-memory + server validation)**

```typescript
// apps/web/src/lib/customer/hooks/use-cart.ts
// useCart(): { cart, addItem, removeItem, updateQuantity, clearCart }
// Store in React state or Context
// No persistence to localStorage (only IndexedDB on checkout)
```

- [ ] **Step 3: Create checkout draft hook (IndexedDB)**

```typescript
// apps/web/src/lib/customer/hooks/use-checkout-draft.ts
// saveDraft(data): save checkout draft to IndexedDB
// loadDraft(): load draft on app init
// clearDraft(): clear after successful order or explicit action
```

- [ ] **Step 4: Wrap app with cart context (if using Context)**

Update `apps/web/src/app/[locale]/(customer)/layout.tsx` to wrap with CartProvider.

- [ ] **Step 5: Test cart operations**

From vendor detail, add items to cart. Verify cart state updates. Remove items; verify removal. Quantity updates; verify. Refresh page; verify cart persists (in memory during session). Close tab and reopen; verify cart is cleared (unless in checkout flow).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/customer.ts apps/web/src/lib/customer/hooks/use-cart.ts apps/web/src/lib/customer/hooks/use-checkout-draft.ts
git commit -m "feat: cart state management with IndexedDB draft persistence"
```

---

## Task 6: Cart UI & Estimate Display

**Files:**
- Create: `apps/web/src/components/customer/cart/cart-drawer.tsx`
- Create: `apps/web/src/components/customer/cart/cart-summary.tsx`
- Create: `apps/web/src/components/customer/cart/cart-item.tsx`
- Create: `apps/web/src/components/customer/cart/cart-estimate-bar.tsx`
- Create: `apps/web/src/components/customer/cart/estimate-display.tsx`

**Interfaces:**
- Consumes: cart context; useEstimate hook (Task 7); TanStack Query
- Produces: cart drawer/modal; sticky estimate bar; estimate breakdown

- [ ] **Step 1: Create estimate display component**

```typescript
// apps/web/src/components/customer/cart/estimate-display.tsx
// Show breakdown: subtotal, delivery fee, discount (if promo), total
// Format as rows or collapsible details
// Urdu/English labels
```

- [ ] **Step 2: Create cart item component (with +/− steppers)**

```typescript
// apps/web/src/components/customer/cart/cart-item.tsx
// Item: name, price, quantity with + and − buttons
// Update quantity on button tap; re-fetch estimate
// Remove button (trash icon)
```

- [ ] **Step 3: Create cart summary component**

```typescript
// apps/web/src/components/customer/cart/cart-summary.tsx
// List of cart-item components
// Empty state: "Your cart is empty"
```

- [ ] **Step 4: Create sticky estimate bar**

```typescript
// apps/web/src/components/customer/cart/cart-estimate-bar.tsx
// Sticky to bottom of page
// Shows: item count, subtotal, total (bold)
// "Proceed to Checkout" button (large, full-width on mobile)
```

- [ ] **Step 5: Create cart drawer/modal**

```typescript
// apps/web/src/components/customer/cart/cart-drawer.tsx
// Bottom sheet (mobile) or modal (desktop)
// Render cart-summary + estimate-display
// Proceed to Checkout button
// Close button
```

- [ ] **Step 6: Test cart UI**

Add items to cart from vendor detail. Verify cart drawer opens. Verify estimate displays correctly. Adjust quantities; verify estimate updates. Remove items; verify removal from cart. Proceed to checkout button is clickable.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/customer/cart/
git commit -m "feat: cart UI with estimate display and quantity controls"
```

---

## Task 7: Estimate Hook & Real-time Calculation

**Files:**
- Create: `apps/web/src/lib/customer/hooks/use-estimate.ts`

**Interfaces:**
- Consumes: TanStack Query; POST /cart/estimate endpoint
- Produces: estimate hook that recalculates on cart/slot change

- [ ] **Step 1: Create estimate hook**

```typescript
// apps/web/src/lib/customer/hooks/use-estimate.ts
// useEstimate(cart, pickupSlot?, deliverySlot?): 
//   POST /cart/estimate; returns { subtotal, deliveryFee, discount, total }
// Debounce requests (e.g., 300 ms)
// Re-fetch when cart or slots change
// Show loading state; cache result
```

- [ ] **Step 2: Integrate estimate hook into cart components**

Update `cart-estimate-bar.tsx` and `estimate-display.tsx` to use useEstimate. Show loading skeleton while fetching.

- [ ] **Step 3: Verify estimate < 3 s on 3G**

Test with DevTools throttled to 3G. Measure time from cart change to estimate display. Should be < 3 seconds per SRS §7.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/customer/hooks/use-estimate.ts
git commit -m "feat: real-time estimate calculation with debounce"
```

---

## Task 8: Slot Picker (Pickup & Delivery)

**Files:**
- Create: `apps/web/src/lib/customer/hooks/use-slots.ts`
- Create: `apps/web/src/components/customer/checkout/slot-picker.tsx`
- Create: `apps/web/src/components/customer/checkout/pickup-slot-picker.tsx`
- Create: `apps/web/src/components/customer/checkout/delivery-slot-picker.tsx`

**Interfaces:**
- Consumes: TanStack Query; GET /vendors/:id/slots endpoint; vendor turnaround time
- Produces: slot picker UI; validation that delivery >= pickup + turnaround

- [ ] **Step 1: Create slots hook**

```typescript
// apps/web/src/lib/customer/hooks/use-slots.ts
// useSlots(vendorId): GET /vendors/:id/slots
// Returns: { pickupSlots: [], deliverySlots: [] }
// Filter based on vendor hours and turnaround
```

- [ ] **Step 2: Create pickup slot picker component**

```typescript
// apps/web/src/components/customer/checkout/pickup-slot-picker.tsx
// Date selector (calendar; today + next 7 days)
// Time windows for selected date (e.g., 10 AM–12 PM)
// Unavailable slots are greyed out or disabled
// Selection highlighted
```

- [ ] **Step 3: Create delivery slot picker component**

```typescript
// apps/web/src/components/customer/checkout/delivery-slot-picker.tsx
// Date selector (starts from pickup date + turnaround)
// Time windows for selected date
// Enforce: delivery date >= pickup date + turnaround
// Unavailable slots disabled
```

- [ ] **Step 4: Create slot picker (combined)**

```typescript
// apps/web/src/components/customer/checkout/slot-picker.tsx
// Render pickup-slot-picker, then delivery-slot-picker (sequential)
// Step indicator: Step 1 → Step 2
// Back button; confirm button
// Validation: both slots selected before proceeding
```

- [ ] **Step 5: Test slot selection**

Select a pickup slot. Verify delivery options are restricted to after pickup + turnaround. Verify unavailable slots are disabled. Change slots; verify estimate updates.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/customer/hooks/use-slots.ts apps/web/src/components/customer/checkout/
git commit -m "feat: slot picker with pickup and delivery time windows"
```

---

## Task 9: Address Selector in Checkout

**Files:**
- Create: `apps/web/src/components/customer/checkout/address-selector.tsx`
- Modify: `apps/web/src/lib/customer/hooks/use-cart.ts` (add address to cart)

**Interfaces:**
- Consumes: customer's saved addresses (from GET /me); map picker (for new address)
- Produces: address selection in checkout; validation that address is valid

- [ ] **Step 1: Create address selector component**

```typescript
// apps/web/src/components/customer/checkout/address-selector.tsx
// List saved addresses (from GET /me)
// Radio selection
// Add New Address button → opens map picker
// Selected address displayed prominently
```

- [ ] **Step 2: Integrate map picker for new address**

If user clicks "Add New Address", open a Google Maps picker (reuse from FE-1.5 login phase) to set lat/lng and address.

- [ ] **Step 3: Test address selection**

In checkout, verify saved addresses appear. Select an address. Click "Add New Address"; verify map picker opens. Pin location; verify address is added to list and can be selected.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/customer/checkout/address-selector.tsx
git commit -m "feat: address selector in checkout with map picker"
```

---

## Task 10: Payment Method Selector (COD + Placeholder for Phase 6)

**Files:**
- Create: `apps/web/src/components/customer/checkout/payment-method-selector.tsx`

**Interfaces:**
- Consumes: (Phase 6 will add gateway adapters)
- Produces: payment method UI with COD enabled, others "coming soon"

- [ ] **Step 1: Create payment method selector**

```typescript
// apps/web/src/components/customer/checkout/payment-method-selector.tsx
// Options: 
//   - COD (Cash on Delivery) — ENABLED
//   - Card (Visa/Mastercard) — "Coming Soon"
//   - JazzCash — "Coming Soon"
//   - Easypaisa — "Coming Soon"
// Radio selection
// Show fee for each method (e.g., "2% = Rs X")
```

- [ ] **Step 2: Store selected payment method in checkout draft**

Update checkout draft schema to include paymentMethod field.

- [ ] **Step 3: Test payment selector**

In checkout, verify COD is selectable. Verify other methods show "Coming Soon" (greyed out). Verify selection persists in draft.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/customer/checkout/payment-method-selector.tsx
git commit -m "feat: payment method selector (COD enabled, others coming soon)"
```

---

## Task 11: Checkout Flow & Draft Persistence

**Files:**
- Create: `apps/web/src/app/[locale]/(customer)/checkout/page.tsx`
- Create: `apps/web/src/app/[locale]/(customer)/checkout/cart/page.tsx`
- Create: `apps/web/src/app/[locale]/(customer)/checkout/slots/page.tsx`
- Create: `apps/web/src/app/[locale]/(customer)/checkout/confirmation/page.tsx`
- Create: `apps/web/src/components/customer/checkout/checkout-stepper.tsx`
- Create: `apps/web/src/components/customer/checkout/notes-input.tsx`

**Interfaces:**
- Consumes: cart state, checkout draft hook, address selector, slot picker, payment selector
- Produces: multi-step checkout flow; draft persisted to IndexedDB

- [ ] **Step 1: Create checkout stepper component**

```typescript
// apps/web/src/components/customer/checkout/checkout-stepper.tsx
// Steps: Cart → Address → Slots → Payment → Review
// Current step highlighted; completed steps show checkmark
// Step indicators
```

- [ ] **Step 2: Create notes input component**

```typescript
// apps/web/src/components/customer/checkout/notes-input.tsx
// Text input for delivery notes (e.g., "Handle carefully")
// Max 200 chars
// Optional
```

- [ ] **Step 3: Create checkout page (multi-step router)**

```typescript
// apps/web/src/app/[locale]/(customer)/checkout/page.tsx
// Load checkout draft from IndexedDB
// Route to current step based on URL param or state
// Or render a single-step checkout (simpler UX)
```

- [ ] **Step 4: Create cart review step**

```typescript
// apps/web/src/app/[locale]/(customer)/checkout/cart/page.tsx
// Render cart-summary + estimate-display
// Edit button (go back to vendor detail)
// Continue button (next step)
```

- [ ] **Step 5: Create slots step**

```typescript
// apps/web/src/app/[locale]/(customer)/checkout/slots/page.tsx
// Render slot-picker
// Continue button (next step)
```

- [ ] **Step 6: Create confirmation step (review)**

```typescript
// apps/web/src/app/[locale]/(customer)/checkout/confirmation/page.tsx
// Summary: vendor, items, address, slots, notes, payment method, estimate
// Edit buttons for each section
// Large "Place Order" button
```

- [ ] **Step 7: Test checkout flow**

Navigate through all checkout steps. Verify draft persists between steps. Refresh page; verify draft is restored. Go back and edit items; verify changes persist. Verify cannot proceed without all required fields.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/customer/checkout/checkout-stepper.tsx apps/web/src/components/customer/checkout/notes-input.tsx apps/web/src/app/\[locale\]/\(customer\)/checkout/
git commit -m "feat: multi-step checkout flow with draft persistence"
```

---

## Task 12: Order Submission with Idempotency & Safe Retry

**Files:**
- Create: `apps/web/src/lib/customer/hooks/use-order-submit.ts`
- Create: `apps/web/src/components/customer/checkout/order-submit-button.tsx`
- Modify: `packages/shared/src/schemas/customer.ts` (add checkout schema)

**Interfaces:**
- Consumes: TanStack Query; POST /orders with Idempotency-Key header
- Produces: safe order submit hook; pending state management; retry logic

- [ ] **Step 1: Create checkout draft schema**

```typescript
// packages/shared/src/schemas/customer.ts (add)
export const checkoutDraftSchema = z.object({
  cart: cartSchema,
  address: z.object({ id: z.string() }),
  pickupSlot: slotSchema,
  deliverySlot: slotSchema,
  paymentMethod: z.enum(['COD']),
  notes: z.string().max(200).optional(),
});

export type CheckoutDraft = z.infer<typeof checkoutDraftSchema>;
```

- [ ] **Step 2: Create order submit hook**

```typescript
// apps/web/src/lib/customer/hooks/use-order-submit.ts
// useOrderSubmit(draft):
//   1. Generate or load Idempotency-Key from draft
//   2. POST /orders with Idempotency-Key header
//   3. On success: redirect to /checkout/confirmation?orderId=X
//   4. On failure: show error; allow retry (same key)
//   5. Handle pending state
```

- [ ] **Step 3: Create order submit button**

```typescript
// apps/web/src/components/customer/checkout/order-submit-button.tsx
// Button: "Place Order" (large, full-width)
// Disabled during submission (show loading spinner)
// On success: navigate to confirmation
// On error: show toast with error message + retry button
// Pending state persists: if user closes app mid-submit, draft is preserved
```

- [ ] **Step 4: Generate Idempotency-Key**

```typescript
// In use-order-submit.ts:
// Generate UUID on first submit attempt
// Store in IndexedDB draft alongside checkout data
// Reuse same key for retries within 24 hours
```

- [ ] **Step 5: Test order submission**

Complete checkout flow. Click "Place Order". Verify loading state. On success, verify redirect to confirmation screen. Test retry: simulate network error; verify retry button is available; verify same order is not created (idempotency).

- [ ] **Step 6: Test pending state recovery**

Start checkout. Click "Place Order". Kill network during submission. App should show pending state. Reopen app; verify draft is restored; offer to retry or discard.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/customer.ts apps/web/src/lib/customer/hooks/use-order-submit.ts apps/web/src/components/customer/checkout/order-submit-button.tsx
git commit -m "feat: idempotent order submission with safe retry"
```

---

## Task 13: Order Confirmation Screen

**Files:**
- Create: `apps/web/src/app/[locale]/(customer)/checkout/confirmation/page.tsx`
- Create: `apps/web/src/components/customer/checkout/confirmation-screen.tsx`

**Interfaces:**
- Consumes: order ID (from URL param); GET /orders/:id endpoint
- Produces: confirmation screen with order details and tracking link

- [ ] **Step 1: Create confirmation screen component**

```typescript
// apps/web/src/components/customer/checkout/confirmation-screen.tsx
// Success icon + message: "Order placed successfully!"
// Order number prominently displayed
// Order summary: items, vendor, address, slots, estimate
// Next steps: 
//   - "Track your order" button → /orders/:id
//   - "Continue shopping" button → /discovery
//   - "Share" button (optional: WhatsApp)
```

- [ ] **Step 2: Create confirmation page**

```typescript
// apps/web/src/app/[locale]/(customer)/checkout/confirmation/page.tsx
// Get orderId from URL param
// Fetch order detail via useOrderDetail(orderId)
// Render confirmation-screen
// Clear IndexedDB draft after successful render
```

- [ ] **Step 3: Test confirmation screen**

Complete checkout and place order. Verify confirmation screen appears with order number. Verify order details are correct. Click "Track your order"; verify navigation to order detail page. Click "Continue shopping"; verify navigation to discovery.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\[locale\]/\(customer\)/checkout/confirmation/ apps/web/src/components/customer/checkout/confirmation-screen.tsx
git commit -m "feat: order confirmation screen with next steps"
```

---

## Task 14: Order History & Detail Screens

**Files:**
- Create: `apps/web/src/lib/customer/hooks/use-orders.ts`
- Create: `apps/web/src/lib/customer/hooks/use-order-detail.ts`
- Create: `apps/web/src/lib/customer/hooks/use-sse-order-tracking.ts`
- Create: `apps/web/src/app/[locale]/(customer)/orders/page.tsx`
- Create: `apps/web/src/app/[locale]/(customer)/orders/[id]/page.tsx`
- Create: `apps/web/src/components/customer/orders/order-list.tsx`
- Create: `apps/web/src/components/customer/orders/order-card.tsx`
- Create: `apps/web/src/components/customer/orders/order-detail.tsx`
- Create: `apps/web/src/components/customer/orders/order-tracking.tsx`

**Interfaces:**
- Consumes: TanStack Query; GET /orders (list), GET /orders/:id (detail), SSE /orders/:id/events (tracking)
- Produces: order history list; order detail page with real-time status tracking

- [ ] **Step 1: Create orders hook**

```typescript
// apps/web/src/lib/customer/hooks/use-orders.ts
// useOrders(filters?): GET /orders with pagination/cursor
// Returns: orders list with summary info
```

- [ ] **Step 2: Create order detail hook**

```typescript
// apps/web/src/lib/customer/hooks/use-order-detail.ts
// useOrderDetail(orderId): GET /orders/:id
// Returns: full order info + items + vendor + status history
```

- [ ] **Step 3: Create SSE tracking hook**

```typescript
// apps/web/src/lib/customer/hooks/use-sse-order-tracking.ts
// useOrderSSE(orderId): SSE connection to GET /orders/:id/events
// Auto-reconnect on disconnect
// Sync to TanStack Query cache
```

- [ ] **Step 4: Create order card component**

```typescript
// apps/web/src/components/customer/orders/order-card.tsx
// Display: order number, vendor name, status (badge), total, date
// Tap to navigate to detail
```

- [ ] **Step 5: Create order list component**

```typescript
// apps/web/src/components/customer/orders/order-list.tsx
// List of order cards (most recent first)
// Load skeleton while fetching
// Empty state: "No orders yet"
// Pagination / infinite scroll
```

- [ ] **Step 6: Create order tracking component**

```typescript
// apps/web/src/components/customer/orders/order-tracking.tsx
// Timeline: Placed → Accepted → Picked Up → In Process → Ready → Out for Delivery → Delivered
// Current status highlighted
// Timestamps for each step (if available)
// Rider info (name, photo) once assigned
```

- [ ] **Step 7: Create order detail page**

```typescript
// apps/web/src/app/[locale]/(customer)/orders/[id]/page.tsx
// Fetch order detail
// Establish SSE connection for live updates
// Render: order summary, items, timeline, tracking, actions (cancel if applicable)
```

- [ ] **Step 8: Create orders list page**

```typescript
// apps/web/src/app/[locale]/(customer)/orders/page.tsx
// Render order-list
// Filter: all / in-progress / completed (optional)
```

- [ ] **Step 9: Test order history and tracking**

Place an order. Navigate to /orders; verify order appears in list. Click order; verify detail page loads. Monitor real-time status updates via SSE. Verify status timeline updates. Test with two tabs; verify sync across tabs.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/customer/hooks/use-orders.ts apps/web/src/lib/customer/hooks/use-order-detail.ts apps/web/src/lib/customer/hooks/use-sse-order-tracking.ts apps/web/src/components/customer/orders/ apps/web/src/app/\[locale\]/\(customer\)/orders/
git commit -m "feat: order history and real-time tracking with SSE"
```

---

## Task 15: Internationalization & RTL Audit

**Files:**
- Modify: `apps/web/src/messages/en.json` (add customer Phase 3 keys)
- Modify: `apps/web/src/messages/ur.json` (add customer Phase 3 Urdu translations)

**Interfaces:**
- Consumes: Urdu glossary; message catalog structure
- Produces: complete en/ur key parity; RTL-safe layouts

- [ ] **Step 1: Audit all Phase 3 screens for hard-coded strings**

Search for untranslated copy; ensure all UI text is in message catalogs.

- [ ] **Step 2: Add customer Phase 3 keys to catalogs**

Categories: customer.discovery, customer.vendor_detail, customer.cart, customer.checkout, customer.orders, customer.tracking

Examples:
- `customer.discovery.filter_title`
- `customer.cart.proceed_to_checkout`
- `customer.checkout.place_order`

- [ ] **Step 3: RTL audit on all Phase 3 screens**

Check with `dir="rtl"`:
- Filter sheet alignment
- Cart drawer layout
- Slot picker calendar
- Checkout stepper
- Order tracking timeline

Fix any LTR-biased layouts.

- [ ] **Step 4: Test in Urdu**

Switch app to Urdu. Navigate discovery, vendor detail, cart, checkout, confirmation, order tracking. Verify text reads correctly; no clipping; icons align; line-height is correct.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/ur.json
git commit -m "feat: customer Phase 3 Urdu translations and RTL audit"
```

---

## Task 16: Mobile Responsiveness & Touch Targets

**Files:**
- Modify: customer components (ensure touch targets ≥44px)
- Modify: customer layouts (test on mobile viewports)

**Interfaces:**
- Consumes: customer UI components
- Produces: mobile-first layouts; tested on Android 8+, iOS 13+

- [ ] **Step 1: Audit all touch targets**

All buttons, inputs, and interactive elements must be ≥44x44px on mobile. Fix any buttons/cards < 44px.

- [ ] **Step 2: Test on mobile viewports**

Use DevTools to test on:
- iPhone 12 (390x844)
- Android (375x812, common)
- iPad (768x1024)

Verify no horizontal scrolling; modals are full-screen on mobile; cart drawer is usable.

- [ ] **Step 3: Test discovery list on mobile**

Infinite scroll should not jump. Filters should be in a bottom sheet. Sort should be sticky. List should be easy to scroll.

- [ ] **Step 4: Test checkout on mobile**

Steps should be clear. Inputs should have large touch targets. Numbers should be readable. Slots should be easy to select.

- [ ] **Step 5: Test on real device**

Use Android phone or iOS device (or simulator). Complete flow: discovery → vendor detail → checkout → confirmation. Verify no layout issues; touch targets are easy to tap.

- [ ] **Step 6: Commit**

```bash
git commit -m "fix: customer app mobile responsiveness and touch targets"
```

---

## Task 17: JS Budget & Performance Verification

**Files:**
- Modify: CI config (add JS budget check for Phase 3 routes)

**Interfaces:**
- Consumes: built route bundles
- Produces: verified JS budgets per route

- [ ] **Step 1: Build the web app**

```bash
npm run build -w @dhoblio/web
```

- [ ] **Step 2: Check discovery route bundle size**

Use `next/bundle-analyzer` or similar to measure `/discovery` route JS. Target: ≤ 170 KB gz (including lazy-loaded maps).

- [ ] **Step 3: Check checkout route bundle size**

Measure `/checkout` route JS. Target: ≤ 140 KB gz.

- [ ] **Step 4: Check vendor detail route bundle size**

Measure `/vendor/[id]` route JS. Target: ≤ 130 KB gz.

- [ ] **Step 5: Optimize if needed**

If budgets are exceeded:
- Lazy-load maps with dynamic imports
- Code-split large charts/tables
- Move utility functions to shared packages
- Remove unused dependencies

- [ ] **Step 6: Add CI check**

Update `.github/workflows/ci.yml` to fail if JS budgets are exceeded (or document expected sizes).

- [ ] **Step 7: Measure estimate latency**

Test POST /cart/estimate latency on 3G throttle. Should be < 3 s per SRS §7. Record baseline.

- [ ] **Step 8: Commit**

```bash
git commit -m "perf: verify JS budgets and estimate latency on 3G"
```

---

## Task 18: Accessibility & SEO

**Files:**
- Modify: customer components (add aria-labels, semantic HTML)

**Interfaces:**
- Consumes: customer UI components
- Produces: axe audit passing; semantic markup; keyboard navigation

- [ ] **Step 1: Add semantic HTML**

Use `<button>`, `<input>`, `<label>` correctly. Use `<nav>` for bottom nav, `<main>` for content.

- [ ] **Step 2: Add aria-labels**

- Buttons: aria-label if text is not visible (e.g., icon-only buttons)
- Form inputs: linked `<label>` with `for` attribute
- Modals: `role="dialog"` with aria-labelledby
- Links: descriptive text (not "click here")

- [ ] **Step 3: Test with axe**

Run axe on each Phase 3 screen; fix violations (contrast, labels, heading hierarchy).

- [ ] **Step 4: Test keyboard navigation**

Tab through all screens. Verify focus visible; all interactive elements reachable; no focus traps.

- [ ] **Step 5: Verify SEO basics**

- Vendor detail page should be server-rendered for SEO
- Meta tags (title, description) should be dynamic per vendor
- Structured data (Schema.org Product) optional for vendor catalog

- [ ] **Step 6: Commit**

```bash
git commit -m "fix: customer app accessibility and SEO optimization"
```

---

## Task 19: End-to-End Testing with Playwright

**Files:**
- Create: `apps/web/playwright/customer-discovery-checkout.spec.ts`

**Interfaces:**
- Consumes: playwright config (en + ur projects)
- Produces: E2E test scenario covering entire Phase 3 flow

- [ ] **Step 1: Write E2E test scenario**

```typescript
// apps/web/playwright/customer-discovery-checkout.spec.ts
test('customer flow: discover → vendor detail → cart → checkout → confirmation', async ({ page }) => {
  // 1. Navigate to discovery
  // 2. Apply filters
  // 3. Click vendor; verify detail page
  // 4. Add items to cart
  // 5. Review cart and estimate
  // 6. Proceed to checkout
  // 7. Select address
  // 8. Select pickup and delivery slots
  // 9. Choose COD
  // 10. Review order
  // 11. Place order
  // 12. Verify confirmation screen
  // 13. Navigate to order tracking
  // 14. Verify SSE updates (optional: simulate status change)
});

test('cart draft persistence', async ({ page, context }) => {
  // 1. Add items to cart
  // 2. Navigate to checkout
  // 3. Open new tab (same context)
  // 4. Verify draft is accessible from new tab
  // 5. Close tab; reopen app
  // 6. Verify draft is restored
});

test('idempotent order submission', async ({ page }) => {
  // 1. Complete checkout and place order
  // 2. Simulate network error during submission
  // 3. Verify pending state
  // 4. Retry submission
  // 5. Verify same order is returned (not duplicated)
});
```

- [ ] **Step 2: Run Playwright tests**

```bash
npm run test:e2e:playwright -w @dhoblio/web
```

Expected: all tests pass on en and ur projects.

- [ ] **Step 3: Test on 3G throttle**

Run discovery test with DevTools throttled to 3G. Measure time to interactive. Verify < 3 s per SRS §7.

- [ ] **Step 4: Commit**

```bash
git add apps/web/playwright/customer-discovery-checkout.spec.ts
git commit -m "test: comprehensive E2E tests for Phase 3 customer flow"
```

---

## Task 20: Final Review, Documentation & Handoff

**Files:**
- Modify: `docs/Dhoblio-TRACKER.md` (tick Phase 3 FE tasks)
- Modify: `apps/web/README.md` (add Phase 3 FE section)

**Interfaces:**
- Consumes: completed Phase 3 FE implementation
- Produces: documentation; tracker updated; code ready for review and merge

- [ ] **Step 1: Run full typecheck**

```bash
npm run typecheck -w @dhoblio/web
```

Fix any TS errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint -w @dhoblio/web
```

Fix any ESLint issues.

- [ ] **Step 3: Run tests**

```bash
npm test -w @dhoblio/web
npm run test:e2e:playwright -w @dhoblio/web
```

All tests should pass.

- [ ] **Step 4: Update tracker**

Tick FE-3.1 through FE-3.10 in `docs/Dhoblio-TRACKER.md`.

- [ ] **Step 5: Update README**

Add section: "Phase 3 FE — Customer Discovery & Checkout" with brief description of implemented screens.

- [ ] **Step 6: Final manual smoke test**

As a customer:
1. Discover vendors (with filters/sort)
2. View vendor detail + catalog
3. Add items to cart
4. Proceed to checkout
5. Select address + slots
6. Place order with COD
7. View confirmation
8. Track order in real-time

All should work end-to-end.

- [ ] **Step 7: Verify en/ur parity**

Switch to Urdu. Repeat smoke test. No missing translations; RTL layout correct.

- [ ] **Step 8: Verify mobile experience**

Repeat smoke test on mobile viewport (375x812). Verify no horizontal scrolling; touch targets are large; flow is intuitive.

- [ ] **Step 9: Measure performance**

Test discovery → checkout on 3G throttle. Estimate should load < 3 s. Interactive should be < 5 s.

- [ ] **Step 10: Final commit**

```bash
git add docs/Dhoblio-TRACKER.md apps/web/README.md
git commit -m "docs: mark Phase 3 FE complete; update tracker and README"
```

---

## Execution Notes

1. **Branch strategy**: Work in branch `phase-3-fe-customer-discovery` (from `dev`); create PR to `dev` when complete.

2. **API dependency**: All Phase 3 BE endpoints must be on `dev` and stable. Verify with `npm run openapi` that generated client includes all customer endpoints (discovery, vendors, cart estimate, slots, orders, SSE).

3. **Cart state**: Use React Context or lightweight state manager (not Redux). Keep state in memory; no localStorage for sensitive data. IndexedDB only for checkout draft.

4. **Estimate recalculation**: Debounce POST /cart/estimate to 300 ms to avoid excessive requests during rapid quantity changes.

5. **Slot picker logic**: Server-side validation is authoritative. FE slot picker mirrors server windows; server re-validates at order submit.

6. **Idempotency**: Generate UUID on first order submit; store in IndexedDB draft. Reuse same key for retries within 24 hours. Server returns same order if key matches.

7. **SSE reconnect**: Implement exponential backoff (1 s, 2 s, 4 s, max 30 s). Use Last-Event-ID header for replay on reconnect.

8. **Urdu glossary**: Add Phase 3 terms to `apps/api/src/common/urdu-glossary.spec.ts` before translating.

9. **Testing data**: Seed demo vendor + customer in dev mode. Use seeded data to test flows.

10. **Performance baselines**: Record on dev laptop with 3G throttle:
    - Discovery list (with 10 vendors): < 2 s to interactive
    - Vendor detail + catalog (20 items): < 1.5 s
    - POST /cart/estimate: < 1 s
    - Checkout flow (all steps): < 2 s
    - Order submit: < 1 s

11. **Route guards**: `/customer/*` requires `role === CUSTOMER`. Shared login routes to appropriate panel.

12. **Commits before final merge**:
    - Typecheck, lint, tests all green
    - All commits squashed to 15–20 meaningful messages (one per task)
    - PR description links to SRS and this plan
    - Screenshots or demo video optional but appreciated

---

## Plan Review Checklist

- [x] Spec coverage: All FR-C3–C7 tasks assigned
- [x] Step clarity: Each step is unambiguous; implementer knows what to build
- [x] Type consistency: Function names, API endpoints, field names used consistently
- [x] Review Focus: Five input classes and failure modes identified; tests named per task
- [x] Proportion: Plan length reasonable for scope; code blocks only for algorithms not determined by signature

---

**Plan saved to `docs/superpowers/plans/2026-11-04-phase-3-fe-customer-discovery-checkout.md`.**
