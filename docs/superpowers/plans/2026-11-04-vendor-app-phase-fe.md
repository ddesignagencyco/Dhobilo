# Vendor App Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete vendor panel UI across onboarding, order management, earnings, and dashboard screens — a responsive web app enabling laundry vendors to register, manage catalogs, process orders, track earnings, and request payouts.

**Architecture:** The vendor app follows the Phase 0 FE foundation (Next.js App Router, route groups, Tailwind v4, shadcn-style primitives, TanStack Query). A shared vendor shell with sidebar navigation spans all screens. Registration flows through a multi-step wizard with client-side validation and draft persistence (IndexedDB). Operations screens (order board, earnings) use TanStack Query for server sync and optimistic updates. All screens are bilingual (en/ur with RTL) and mobile-responsive (tested on Android 8+, iOS 13+, desktop).

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Tailwind v4, React Hook Form + zod (schemas in `packages/shared`), TanStack Query v5, Zod for validation, Cloudinary direct uploads, generated API client from OpenAPI.

**Spec:** [Dhoblio-SRS.md](../Dhoblio-SRS.md) FR-V1–V10; [Dhoblio-TRACKER.md](../Dhoblio-TRACKER.md) Phase 2 FE (FE-2.1–2.8), Phase 4 FE (FE-4.5–4.6), Phase 6 FE (FE-6.4–6.5), Phase 8 FE (FE-8.5).

## Global Constraints

- All strings must exist in both `en` and `ur` message catalogs; no hard-coded copy (enforced in CI).
- CNIC and sensitive vendor documents are never shown client-side; only admins see decrypted CNIC via an audited API endpoint.
- The vendor can only view/edit their own data; role-based access enforced by API and route guards.
- Mobile-first design; large touch targets (≥44px); tested on low-bandwidth (3G throttle).
- Vendor registration wizard must persist draft to IndexedDB to survive app crashes.
- Responsive web (desktop/tablet/mobile); vendor-panel sidebar collapses on mobile.
- Urdu terminology enforced by `apps/api/src/common/urdu-glossary.spec.ts`; add glossary row before coining a term.
- No vendor-sensitive data (earnings, payouts, orders) is ever cached in localStorage; only memory + server-side session.

## Review Focus

1. **Wizard draft persistence**: IndexedDB survives app restart; incomplete draft can be resumed; abandoning the wizard clears the draft safely.
2. **Vendor isolation**: A vendor can only see their own data (orders, earnings, settings). API enforces this, but the FE must not request other vendors' data and must guard routes.
3. **Order-board real-time updates**: Orders appear as soon as they enter the vendor's shop (SSE or polling); vendor response timeout countdown is accurate; accept/reject do not double-submit.
4. **Catalog bulk import**: CSV/JSON import fails gracefully; partial success is communicated; large files (1000+ rows) do not freeze the UI.
5. **Payout safety**: A vendor cannot request a payout exceeding their available balance; the form disables the submit if insufficient balance; a successful request shows confirmation and clears the form.

---

## File Structure

### Route Groups and Screens

```
apps/web/src/app/[locale]/
├── (vendor)/                    # NEW: Vendor route group
│   ├── layout.tsx               # Vendor shell (sidebar, nav, user menu)
│   ├── page.tsx                 # Vendor home/dashboard redirect
│   ├── registration/            # Wizard screens
│   │   ├── layout.tsx           # Wizard shell (steps indicator)
│   │   ├── page.tsx             # Step 1: Business info
│   │   ├── location/page.tsx    # Step 2: Map location + service radius
│   │   ├── documents/page.tsx   # Step 3: CNIC + business photos
│   │   ├── review/page.tsx      # Step 4: Review + submit
│   │   └── status/page.tsx      # Status screen (pending/rejected/approved)
│   ├── orders/                  # Order board + detail
│   │   ├── page.tsx             # Order board (columns: New, In Process, Ready)
│   │   └── [id]/page.tsx        # Order detail with action buttons
│   ├── catalog/                 # Catalog manager
│   │   ├── page.tsx             # Catalog list with inline edit
│   │   ├── import/page.tsx      # Bulk import wizard
│   │   └── [id]/page.tsx        # Item detail/edit
│   ├── hours/page.tsx           # Hours + service radius editor
│   ├── availability/page.tsx    # Open/Closed/Busy quick toggle
│   ├── staff/page.tsx           # Staff accounts management
│   ├── earnings/page.tsx        # Earnings dashboard (day/week/month)
│   ├── ledger/page.tsx          # Detailed ledger transactions
│   ├── payouts/page.tsx         # Payout history + request form
│   ├── profile/page.tsx         # Vendor profile edit
│   └── settings/page.tsx        # Preferences (notifications, etc.)
```

### Shared Components

```
apps/web/src/components/vendor/
├── vendor-shell.tsx             # Sidebar nav, user menu, logout
├── sidebar-nav.tsx              # Navigation menu items
├── status-badge.tsx             # Vendor status (PENDING/APPROVED/REJECTED)
├── wizard/
│   ├── wizard-header.tsx        # Steps indicator
│   ├── business-form.tsx        # Business info form
│   ├── location-picker.tsx      # Map + radius editor (reuses Google Maps)
│   ├── documents-uploader.tsx   # CNIC + photo upload
│   └── review-summary.tsx       # Draft review before submit
├── orders/
│   ├── order-board.tsx          # Kanban-style board (3 columns)
│   ├── order-card.tsx           # Order card for board
│   ├── order-detail-sheet.tsx   # Bottom sheet / modal for detail
│   ├── status-buttons.tsx       # Accept/reject/ready/process buttons
│   └── response-timer.tsx       # Countdown timer for vendor response
├── catalog/
│   ├── catalog-table.tsx        # List of items with inline edit
│   ├── catalog-import-form.tsx  # CSV/JSON uploader
│   ├── item-form.tsx            # Item create/edit form
│   └── category-picker.tsx      # Service category selector
├── earnings/
│   ├── earnings-summary.tsx     # Period switcher + KPI tiles
│   ├── earnings-chart.tsx       # Time-series earnings chart
│   ├── commission-breakdown.tsx # Commission % and deduction detail
│   └── ledger-table.tsx         # Detailed ledger with filters
├── payouts/
│   ├── payout-form.tsx          # Bank IBAN / wallet selector + amount
│   ├── payout-history.tsx       # Past payout requests + status
│   └── payout-status-badge.tsx  # PENDING/APPROVED/PAID/REJECTED
└── forms/
    ├── hours-editor.tsx         # Opening hours day-by-day
    ├── availability-toggle.tsx  # Quick open/closed/busy switch
    └── staff-form.tsx           # Add/remove staff by phone
```

### Hooks and API Clients

```
apps/web/src/lib/vendor/
├── hooks/
│   ├── use-vendor-profile.ts    # GET /vendor/profile (mutation for PATCH)
│   ├── use-vendor-orders.ts     # GET /vendor/orders with filtering
│   ├── use-vendor-catalog.ts    # GET/POST /vendor/catalog/items
│   ├── use-vendor-earnings.ts   # GET /vendor/earnings
│   ├── use-vendor-ledger.ts     # GET /vendor/ledger
│   ├── use-vendor-payouts.ts    # GET/POST /vendor/payouts
│   ├── use-registration-draft.ts # IndexedDB draft CRUD
│   └── use-sse-orders.ts        # SSE connection for live order updates
└── queries.ts                   # TanStack Query configuration for vendor endpoints
```

### Validation Schemas (in `packages/shared`)

```
packages/shared/src/schemas/vendor.ts:
- vendorRegistrationSchema (business, location, documents)
- vendorProfileSchema (name, contact updates)
- catalogItemSchema (name, category, price, turnaround)
- bulkImportSchema (CSV/JSON validation)
- payoutRequestSchema (IBAN, amount <= available balance)
```

---

## Task 1: Vendor Shell & Navigation

**Files:**
- Create: `apps/web/src/components/vendor/vendor-shell.tsx`
- Create: `apps/web/src/components/vendor/sidebar-nav.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/layout.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/page.tsx`
- Modify: `apps/web/src/proxy.ts` (add vendor route guard)

**Interfaces:**
- Consumes: existing UI components (Button, Sheet, Avatar, DropdownMenu); user context from login
- Produces: `(vendor)/layout.tsx` that renders vendor-shell with sidebar for all vendor routes; middleware guards routes by role

- [ ] **Step 1: Create vendor shell component with sidebar navigation**

```typescript
// apps/web/src/components/vendor/vendor-shell.tsx
// Sidebar nav with logo, menu items (Orders, Catalog, Earnings, Hours, Staff, Profile)
// User menu with vendor name, settings, logout
// Collapsible on mobile; stays open on desktop
// Active route highlighting; role-aware visibility
```

- [ ] **Step 2: Create sidebar navigation items component**

```typescript
// apps/web/src/components/vendor/sidebar-nav.tsx
// Menu items: Dashboard, Orders, Catalog, Hours, Availability, Staff, Earnings, Ledger, Payouts, Profile, Settings
// Icons from shadcn/lucide; active state matching current route
// Urdu/English titles from message catalog
```

- [ ] **Step 3: Create vendor layout wrapping all (vendor) routes**

```typescript
// apps/web/src/app/[locale]/(vendor)/layout.tsx
// Imports VendorShell; renders children inside it
// Guard: check role is VENDOR; redirect to /login if not
// Wrap with Providers (QueryProvider, ToastProvider)
```

- [ ] **Step 4: Create vendor home page redirecting to dashboard**

```typescript
// apps/web/src/app/[locale]/(vendor)/page.tsx
// Redirect to /[locale]/vendor/orders (the primary task for a vendor)
// Or render a dashboard overview (summary of pending orders, today's earnings)
```

- [ ] **Step 5: Add vendor route guard in proxy.ts**

Guard `/vendor/*` to require `role === VENDOR`; redirect to `/login` with return path if not authenticated.

- [ ] **Step 6: Test vendor shell in browser**

Run `npm run dev -w @dhoblio/web`; sign in as a vendor (use `/vendor/register` flow or seed a vendor). Verify sidebar renders, navigation works, route guard blocks unauthorized access.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/vendor/ apps/web/src/app/\[locale\]/\(vendor\)/layout.tsx apps/web/src/app/\[locale\]/\(vendor\)/page.tsx apps/web/src/proxy.ts
git commit -m "feat: vendor app shell with sidebar navigation"
```

---

## Task 2: Vendor Registration Wizard (Step 1 & 2)

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/registration/layout.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/registration/page.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/registration/location/page.tsx`
- Create: `apps/web/src/lib/vendor/hooks/use-registration-draft.ts`
- Create: `apps/web/src/components/vendor/wizard/wizard-header.tsx`
- Create: `apps/web/src/components/vendor/wizard/business-form.tsx`
- Create: `apps/web/src/components/vendor/wizard/location-picker.tsx`
- Create: `packages/shared/src/schemas/vendor.ts` (if not exists)

**Interfaces:**
- Consumes: Google Maps API (already loaded for customer app); Cloudinary upload signing
- Produces: draft persisted in IndexedDB; `POST /vendor/register` payload shape; wizard state machine (step 1 → 2 → 3 → 4 → review → submit)

- [ ] **Step 1: Create vendor registration Zod schema in packages/shared**

```typescript
// packages/shared/src/schemas/vendor.ts
export const vendorRegistrationSchema = z.object({
  businessName: z.string().min(3),
  businessType: z.enum(['LAUNDRY', 'DRY_CLEANER']),
  shopPhoneNumber: z.string().regex(/^03\d{9}$/),
  shopAddress: z.object({
    address: z.string().min(5),
    lat: z.number(),
    lng: z.number(),
    city: z.string(),
  }),
  serviceRadiusKm: z.number().min(1).max(50),
  ownerName: z.string().min(3),
  ownerPhone: z.string().regex(/^03\d{9}$/),
  cnicNumber: z.string().length(13),
  cnicPhotoUrl: z.string().url(), // Cloudinary public ID
  shopPhotoUrls: z.array(z.string().url()).min(1),
});

export type VendorRegistration = z.infer<typeof vendorRegistrationSchema>;
```

- [ ] **Step 2: Create IndexedDB hook for draft persistence**

```typescript
// apps/web/src/lib/vendor/hooks/use-registration-draft.ts
// saveDraft(step: number, data: Partial<VendorRegistration>): Promise<void>
// loadDraft(): Promise<Partial<VendorRegistration> | null>
// clearDraft(): Promise<void>
// Key: 'vendor_registration_draft'
```

- [ ] **Step 3: Create wizard header component showing current step**

```typescript
// apps/web/src/components/vendor/wizard/wizard-header.tsx
// Steps: 1. Business Info | 2. Location | 3. Documents | 4. Review
// Current step highlighted; completed steps show checkmark
// Urdu/English step titles
```

- [ ] **Step 4: Create business info form (Step 1)**

```typescript
// apps/web/src/components/vendor/wizard/business-form.tsx
// Fields: businessName, businessType (LAUNDRY/DRY_CLEANER), ownerName, ownerPhone, shopPhoneNumber, shopAddress (readonly for now)
// Form state from react-hook-form; validation from vendorRegistrationSchema
// Save draft on change; Next button advances to Step 2
// Urdu/English field labels from message catalog
```

- [ ] **Step 5: Create location picker component (Step 2)**

```typescript
// apps/web/src/components/vendor/wizard/location-picker.tsx
// Google Maps embed (full-screen on mobile)
// Draggable marker; reverse-geocode to fill address
// Service radius slider (1–50 km) with circle overlay
// Save draft on change; Previous/Next buttons for Step 1 ↔ 3
```

- [ ] **Step 6: Create wizard layout and Step 1 page**

```typescript
// apps/web/src/app/[locale]/(vendor)/registration/layout.tsx
// Renders wizard-header + children
// Tracks current step from URL query param (step=1&step=2&step=3&step=4&step=review)

// apps/web/src/app/[locale]/(vendor)/registration/page.tsx
// Renders Step 1 (business-form) on load
// handleNext() → advance to Step 2
// handleSkip() → load draft and advance (or show empty Step 2)
```

- [ ] **Step 7: Create location page (Step 2)**

```typescript
// apps/web/src/app/[locale]/(vendor)/registration/location/page.tsx
// Renders location-picker
// handlePrevious() → back to Step 1; handleNext() → Step 3
// Save draft before advancing
```

- [ ] **Step 8: Test Steps 1 & 2 in browser**

Start vendor registration; fill Step 1, advance to Step 2; verify location map loads and marker is draggable. Refresh page; verify draft persists and resumes. Go back and forward; verify state is maintained.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/schemas/vendor.ts apps/web/src/lib/vendor/hooks/use-registration-draft.ts apps/web/src/components/vendor/wizard/ apps/web/src/app/\[locale\]/\(vendor\)/registration/
git commit -m "feat: vendor registration wizard steps 1-2 with draft persistence"
```

---

## Task 3: Vendor Registration Wizard (Step 3 & 4)

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/registration/documents/page.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/registration/review/page.tsx`
- Create: `apps/web/src/components/vendor/wizard/documents-uploader.tsx`
- Create: `apps/web/src/components/vendor/wizard/review-summary.tsx`

**Interfaces:**
- Consumes: Cloudinary upload signing (already available); draft from IndexedDB
- Produces: `POST /vendor/register` request after final submit; status screen redirect

- [ ] **Step 1: Create documents uploader component (Step 3)**

```typescript
// apps/web/src/components/vendor/wizard/documents-uploader.tsx
// CNIC photo upload (JPG/PNG, max 5 MB, compressed to 800x600)
// Shop photos upload (up to 3; same size limits)
// Direct-to-Cloudinary uploader with progress bars and preview thumbnails
// Validation: enforce format, size, and count limits client-side
// Save Cloudinary public IDs to draft
```

- [ ] **Step 2: Create documents page (Step 3)**

```typescript
// apps/web/src/app/[locale]/(vendor)/registration/documents/page.tsx
// Renders documents-uploader
// handlePrevious() → Step 2; handleNext() → Step 4 (Review)
// Enforce: CNIC and ≥1 shop photo uploaded before Next is enabled
```

- [ ] **Step 3: Create review summary component (Step 4)**

```typescript
// apps/web/src/components/vendor/wizard/review-summary.tsx
// Display all draft fields (business info, location, photos, service radius)
// Collapsible sections: Business, Location, Photos
// Edit buttons for each section (navigate back to relevant step)
// Large Submit button at bottom
```

- [ ] **Step 4: Create review page (Step 4)**

```typescript
// apps/web/src/app/[locale]/(vendor)/registration/review/page.tsx
// Renders review-summary
// handleEdit(step) → navigate back to that step with draft loaded
// handleSubmit() → POST /vendor/register with full draft; on success redirect to /vendor/registration/status
// Loading state during POST
```

- [ ] **Step 5: Create status screen (post-registration)**

```typescript
// apps/web/src/app/[locale]/(vendor)/registration/status/page.tsx
// Query GET /vendor/profile to fetch vendor.status (PENDING/APPROVED/REJECTED)
// If PENDING: show "Your registration is being reviewed" with icon
// If APPROVED: show "Approved! Set your hours and catalog." with link to /vendor/hours
// If REJECTED: show rejection reason (if available) and link to re-apply
// Clear IndexedDB draft after successful submit
```

- [ ] **Step 6: Test Steps 3 & 4 in browser**

Upload CNIC and shop photos; verify direct-to-Cloudinary upload works. Review summary page shows all data. Submit registration; verify API POST succeeds and status screen appears. Sign out, sign in again; verify vendor status is persisted.

- [ ] **Step 7: Test draft abandonment**

Start wizard, fill steps 1-2, close tab. Reopen; verify draft is still there. Navigate away without submitting; return to `/vendor/registration`; verify draft is offered to resume or clear.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/vendor/wizard/documents-uploader.tsx apps/web/src/components/vendor/wizard/review-summary.tsx apps/web/src/app/\[locale\]/\(vendor\)/registration/documents/ apps/web/src/app/\[locale\]/\(vendor\)/registration/review/ apps/web/src/app/\[locale\]/\(vendor\)/registration/status/
git commit -m "feat: vendor registration steps 3-4 with document upload and status screen"
```

---

## Task 4: Vendor Catalog Manager (List, Create, Edit, Bulk Import)

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/catalog/page.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/catalog/[id]/page.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/catalog/import/page.tsx`
- Create: `apps/web/src/components/vendor/catalog/catalog-table.tsx`
- Create: `apps/web/src/components/vendor/catalog/item-form.tsx`
- Create: `apps/web/src/components/vendor/catalog/catalog-import-form.tsx`
- Create: `apps/web/src/lib/vendor/hooks/use-vendor-catalog.ts`

**Interfaces:**
- Consumes: TanStack Query; generated API client (GET/POST/PATCH/DELETE /vendor/catalog/items, POST /vendor/catalog/import)
- Produces: catalog list with inline edit; item detail/edit modal; bulk import with CSV/JSON validation

- [ ] **Step 1: Create vendor catalog hook**

```typescript
// apps/web/src/lib/vendor/hooks/use-vendor-catalog.ts
// useCatalogItems(): TanStack Query for GET /vendor/catalog/items
// useCreateCatalogItem(): mutation for POST /vendor/catalog/items
// useUpdateCatalogItem(id): mutation for PATCH /vendor/catalog/items/:id
// useDeleteCatalogItem(id): mutation for DELETE /vendor/catalog/items/:id
// useBulkImport(): mutation for POST /vendor/catalog/import
```

- [ ] **Step 2: Create catalog table component**

```typescript
// apps/web/src/components/vendor/catalog/catalog-table.tsx
// Columns: Item Name (en/ur), Category, Price (Rs), Turnaround (hours), Status (active/inactive), Actions (edit/delete)
// Inline toggle for active/inactive status (PATCH on change)
// Add Item button opens item-form in modal
// Edit button → modal pre-filled with current data
// Delete button → confirmation modal
// Skeleton loading while fetching
// Empty state with link to import
```

- [ ] **Step 3: Create item form component**

```typescript
// apps/web/src/components/vendor/catalog/item-form.tsx
// Fields: item name (en), item name (ur), category dropdown (from GET /service-categories), price, turnaround, active toggle
// React Hook Form + Zod schema validation
// Submit: POST (create) or PATCH (edit)
// Optimistic updates to TanStack Query cache
```

- [ ] **Step 4: Create catalog list page**

```typescript
// apps/web/src/app/[locale]/(vendor)/catalog/page.tsx
// Renders catalog-table
// Add Item button → inline item-form or modal
// Import CSV/JSON button → navigate to /vendor/catalog/import
// Filters: active/all toggle
```

- [ ] **Step 5: Create catalog detail/edit page**

```typescript
// apps/web/src/app/[locale]/(vendor)/catalog/[id]/page.tsx
// Fetch item detail; render item-form pre-filled
// handleSave() → PATCH; on success navigate back to /vendor/catalog
// handleDelete() → DELETE with confirmation; on success navigate back
```

- [ ] **Step 6: Create bulk import form**

```typescript
// apps/web/src/components/vendor/catalog/catalog-import-form.tsx
// File uploader (CSV or JSON; template download link)
// Parse CSV/JSON; validate each row against catalogItemSchema
// Preview table showing parsed items + validation errors
// Submit button → POST /vendor/catalog/import
// Success: show summary (X items imported) and navigate back
// Failure: show error details per item with retry/skip options
```

- [ ] **Step 7: Create import page**

```typescript
// apps/web/src/app/[locale]/(vendor)/catalog/import/page.tsx
// Renders catalog-import-form
// Provide CSV/JSON template download
// Guide text (English + Urdu) on format
```

- [ ] **Step 8: Test catalog operations in browser**

Create item; verify it appears in list. Edit item; verify changes save. Delete item; verify it's removed. Upload CSV with 5 items; verify parse and import. Upload invalid CSV; verify error messaging. Refresh page; verify items persist.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/vendor/hooks/use-vendor-catalog.ts apps/web/src/components/vendor/catalog/ apps/web/src/app/\[locale\]/\(vendor\)/catalog/
git commit -m "feat: vendor catalog manager with inline edit and bulk import"
```

---

## Task 5: Vendor Hours & Availability

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/hours/page.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/availability/page.tsx`
- Create: `apps/web/src/components/vendor/forms/hours-editor.tsx`
- Create: `apps/web/src/components/vendor/forms/availability-toggle.tsx`
- Create: `apps/web/src/lib/vendor/hooks/use-vendor-hours.ts`

**Interfaces:**
- Consumes: TanStack Query; GET/PUT /vendor/hours, PATCH /vendor/availability
- Produces: hours editor page; availability quick-toggle in vendor header

- [ ] **Step 1: Create vendor hours hook**

```typescript
// apps/web/src/lib/vendor/hooks/use-vendor-hours.ts
// useVendorHours(): TanStack Query for GET /vendor/hours
// useUpdateVendorHours(): mutation for PUT /vendor/hours
// useUpdateAvailability(): mutation for PATCH /vendor/availability
```

- [ ] **Step 2: Create hours editor form component**

```typescript
// apps/web/src/components/vendor/forms/hours-editor.tsx
// Days: Monday–Sunday
// Per day: start time, end time, holiday toggle, closed all day toggle
// React Hook Form with time inputs (HH:MM)
// Save button; optimistic update to TanStack Query
// Urdu/English day names
```

- [ ] **Step 3: Create hours page**

```typescript
// apps/web/src/app/[locale]/(vendor)/hours/page.tsx
// Render hours-editor
// Show current hours and allow edit
// Display note about impact on order discovery
```

- [ ] **Step 4: Create availability toggle component**

```typescript
// apps/web/src/components/vendor/forms/availability-toggle.tsx
// Buttons: Open | Closed | Busy (radio group, segmented control style)
// Current status displayed
// On toggle, PATCH /vendor/availability immediately
// Toast confirmation
```

- [ ] **Step 5: Add availability toggle to vendor header**

Update `vendor-shell.tsx` to include availability-toggle next to the user menu (or in a header bar).

- [ ] **Step 6: Test hours and availability in browser**

Edit hours; verify changes save and are reflected. Toggle availability; verify status updates instantly. Sign out and sign back in; verify hours and availability persist.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/vendor/hooks/use-vendor-hours.ts apps/web/src/components/vendor/forms/hours-editor.tsx apps/web/src/components/vendor/forms/availability-toggle.tsx apps/web/src/app/\[locale\]/\(vendor\)/hours/ apps/web/src/app/\[locale\]/\(vendor\)/availability/
git commit -m "feat: vendor hours editor and availability toggle"
```

---

## Task 6: Vendor Order Board (List & Detail)

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/orders/page.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/orders/[id]/page.tsx`
- Create: `apps/web/src/components/vendor/orders/order-board.tsx`
- Create: `apps/web/src/components/vendor/orders/order-card.tsx`
- Create: `apps/web/src/components/vendor/orders/order-detail-sheet.tsx`
- Create: `apps/web/src/components/vendor/orders/status-buttons.tsx`
- Create: `apps/web/src/components/vendor/orders/response-timer.tsx`
- Create: `apps/web/src/lib/vendor/hooks/use-vendor-orders.ts`
- Create: `apps/web/src/lib/vendor/hooks/use-sse-orders.ts`

**Interfaces:**
- Consumes: TanStack Query; SSE endpoint GET /orders/:id/events for live updates; POST actions (accept/reject/status)
- Produces: Kanban-style order board; real-time order updates; response countdown timer

- [ ] **Step 1: Create vendor orders hook**

```typescript
// apps/web/src/lib/vendor/hooks/use-vendor-orders.ts
// useVendorOrders(filters?): TanStack Query for GET /vendor/orders with status filter (NEW/IN_PROCESS/READY)
// useAcceptOrder(orderId): mutation for POST /vendor/orders/:id/accept
// useRejectOrder(orderId): mutation for POST /vendor/orders/:id/reject
// useUpdateOrderStatus(orderId, status): mutation for POST /vendor/orders/:id/status
```

- [ ] **Step 2: Create SSE hook for live order updates**

```typescript
// apps/web/src/lib/vendor/hooks/use-sse-orders.ts
// useOrderSSE(orderId): connect to GET /orders/:id/events; yield status change events
// Auto-reconnect on disconnect with exponential backoff
// Sync updates to TanStack Query cache
// Clean up EventSource on unmount
```

- [ ] **Step 3: Create response timer component**

```typescript
// apps/web/src/components/vendor/orders/response-timer.tsx
// Displays remaining time for vendor to accept/reject (e.g., 15 minutes)
// Timer counts down; color transitions from green → yellow → red
// At zero, timer resets (order auto-rejected by backend; FE reflects this when status updates via SSE)
```

- [ ] **Step 4: Create order card component**

```typescript
// apps/web/src/components/vendor/orders/order-card.tsx
// Displays: order number, customer (name/phone masked), items count, pickup time, status badge, response timer (if NEW)
// Tap to open detail sheet
// Compact design suitable for Kanban board
```

- [ ] **Step 5: Create order detail sheet component**

```typescript
// apps/web/src/components/vendor/orders/order-detail-sheet.tsx
// Full order info: order number, items (name/qty/price), pickup address, delivery address, notes, timeline
// Commission breakdown (if visible)
// Status buttons below (accept, reject, ready, process, etc.)
// Action confirmations (reject requires reason)
// Optimistic UI updates
```

- [ ] **Step 6: Create status buttons component**

```typescript
// apps/web/src/components/vendor/orders/status-buttons.tsx
// Legal actions based on current order status (state machine)
// Accept / Reject (NEW only)
// Mark In Process / Mark Ready (ACCEPTED/IN_PROCESS)
// Each action triggers a mutation with optimistic update
// Disable buttons during loading
```

- [ ] **Step 7: Create order board component (Kanban)**

```typescript
// apps/web/src/components/vendor/orders/order-board.tsx
// Three columns: NEW | IN_PROCESS | READY
// Fetch orders grouped by status from useVendorOrders()
// Render order-card in each column
// Responsive: stack columns on mobile; side-scroll on small screens
// Real-time sync via SSE; cards move between columns as status changes
// Audible + vibrate alert when new order arrives (if supported + enabled)
```

- [ ] **Step 8: Create orders list page**

```typescript
// apps/web/src/app/[locale]/(vendor)/orders/page.tsx
// Render order-board
// Handle SSE connection lifecycle (connect on mount, cleanup on unmount)
// Refresh button for manual sync
// Filter toggles: show all / only new / only in-process
```

- [ ] **Step 9: Create order detail page**

```typescript
// apps/web/src/app/[locale]/(vendor)/orders/[id]/page.tsx
// Fetch order detail; establish SSE connection for live updates
// Render order-detail-sheet (full-screen on mobile, modal on desktop)
// Back button → /vendor/orders
```

- [ ] **Step 10: Test order board in browser**

As admin, create an order for a vendor. Navigate to /vendor/orders; verify order appears in NEW column. Accept order; verify it moves to IN_PROCESS. Update status; verify column changes in real-time. Test on slow network; verify SSE reconnects. Test with two tabs open; verify cross-tab sync.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/lib/vendor/hooks/use-vendor-orders.ts apps/web/src/lib/vendor/hooks/use-sse-orders.ts apps/web/src/components/vendor/orders/ apps/web/src/app/\[locale\]/\(vendor\)/orders/
git commit -m "feat: vendor order board with real-time updates and status management"
```

---

## Task 7: Vendor Earnings & Ledger

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/earnings/page.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/ledger/page.tsx`
- Create: `apps/web/src/components/vendor/earnings/earnings-summary.tsx`
- Create: `apps/web/src/components/vendor/earnings/earnings-chart.tsx`
- Create: `apps/web/src/components/vendor/earnings/commission-breakdown.tsx`
- Create: `apps/web/src/components/vendor/earnings/ledger-table.tsx`
- Create: `apps/web/src/lib/vendor/hooks/use-vendor-earnings.ts`
- Create: `apps/web/src/lib/vendor/hooks/use-vendor-ledger.ts`

**Interfaces:**
- Consumes: TanStack Query; GET /vendor/earnings, GET /vendor/ledger
- Produces: earnings dashboard with period selector and charts; detailed ledger with filters

- [ ] **Step 1: Create vendor earnings hook**

```typescript
// apps/web/src/lib/vendor/hooks/use-vendor-earnings.ts
// useEarnings(range: 'day' | 'week' | 'month'): TanStack Query for GET /vendor/earnings?range=X
// Returns: { total, commission, net, orderCount, bestSellers[], ratingTrend[] }
```

- [ ] **Step 2: Create vendor ledger hook**

```typescript
// apps/web/src/lib/vendor/hooks/use-vendor-ledger.ts
// useLedger(filters?): TanStack Query for GET /vendor/ledger with date range, type filters
// Returns: paginated list of ledger entries { type, amount, orderId, date, notes }
```

- [ ] **Step 3: Create earnings summary component**

```typescript
// apps/web/src/components/vendor/earnings/earnings-summary.tsx
// Period selector buttons (Today | This Week | This Month)
// KPI tiles: Total Earnings | Commission Deducted | Net Earnings | Orders Completed
// Display selected range
// Update data when period changes
```

- [ ] **Step 4: Create earnings chart component**

```typescript
// apps/web/src/components/vendor/earnings/earnings-chart.tsx
// Time-series chart (line or bar) showing daily earnings for selected period
// Hand-rolled SVG or Recharts (reuse dataviz patterns from admin panel)
// X-axis: dates; Y-axis: amount (Rs)
// Hover tooltip showing value and order count
```

- [ ] **Step 5: Create commission breakdown component**

```typescript
// apps/web/src/components/vendor/earnings/commission-breakdown.tsx
// Show commission percentage and total deducted
// Link to /vendor/payouts (where payout details are shown)
// Explanation text: "Commission is deducted before payout"
```

- [ ] **Step 6: Create ledger table component**

```typescript
// apps/web/src/components/vendor/earnings/ledger-table.tsx
// Columns: Date, Type (ORDER_EARNING / COMMISSION / REFUND / PAYOUT), Amount, Order ID (link), Notes
// Filters: date range, type selector
// Pagination / infinite scroll
// Row detail shows full transaction notes
```

- [ ] **Step 7: Create earnings page**

```typescript
// apps/web/src/app/[locale]/(vendor)/earnings/page.tsx
// Render earnings-summary + earnings-chart + commission-breakdown
// Period switcher affects both summary and chart
```

- [ ] **Step 8: Create ledger page**

```typescript
// apps/web/src/app/[locale]/(vendor)/ledger/page.tsx
// Render ledger-table
// Export button (trigger GET /vendor/ledger/export → download CSV)
```

- [ ] **Step 9: Test earnings and ledger in browser**

View earnings; toggle periods; verify data updates. Check that commission is correctly shown as deducted. View ledger; filter by date range; verify entries match API response. Export ledger to CSV; verify file format and data.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/vendor/hooks/use-vendor-earnings.ts apps/web/src/lib/vendor/hooks/use-vendor-ledger.ts apps/web/src/components/vendor/earnings/ apps/web/src/app/\[locale\]/\(vendor\)/earnings/ apps/web/src/app/\[locale\]/\(vendor\)/ledger/
git commit -m "feat: vendor earnings dashboard and detailed ledger"
```

---

## Task 8: Vendor Payouts

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/payouts/page.tsx`
- Create: `apps/web/src/components/vendor/payouts/payout-form.tsx`
- Create: `apps/web/src/components/vendor/payouts/payout-history.tsx`
- Create: `apps/web/src/components/vendor/payouts/payout-status-badge.tsx`
- Create: `apps/web/src/lib/vendor/hooks/use-vendor-payouts.ts`

**Interfaces:**
- Consumes: TanStack Query; GET/POST /vendor/payouts, GET /vendor/earnings (for available balance)
- Produces: payout request form with balance validation; payout history with status tracking

- [ ] **Step 1: Create payout form schema**

Update `packages/shared/src/schemas/vendor.ts` to add:

```typescript
export const payoutRequestSchema = z.object({
  bankIban: z.string().regex(/^PK\d{2}[A-Z]{4}\d{21}$/), // PK IBAN format
  amount: z.number().min(1000), // Min 1000 Rs (or configured limit)
  notes: z.string().max(255).optional(),
});

export type PayoutRequest = z.infer<typeof payoutRequestSchema>;
```

- [ ] **Step 2: Create vendor payouts hook**

```typescript
// apps/web/src/lib/vendor/hooks/use-vendor-payouts.ts
// usePayouts(): TanStack Query for GET /vendor/payouts (history)
// useRequestPayout(): mutation for POST /vendor/payouts
// Fetch available balance from useEarnings() in parallel
```

- [ ] **Step 3: Create payout form component**

```typescript
// apps/web/src/components/vendor/payouts/payout-form.tsx
// Fields: IBAN (with validation and format hints), amount (≤ available balance), optional notes
// Real-time balance display; amount field max = available balance
// Disable submit if amount > balance
// Submit → POST /vendor/payouts
// Success: show confirmation toast; clear form; refresh history
// Urdu/English instructions
```

- [ ] **Step 4: Create payout status badge component**

```typescript
// apps/web/src/components/vendor/payouts/payout-status-badge.tsx
// Status: PENDING (yellow) | APPROVED (blue) | PAID (green) | REJECTED (red)
// Icon + text
```

- [ ] **Step 5: Create payout history table component**

```typescript
// apps/web/src/components/vendor/payouts/payout-history.tsx
// Columns: Date Requested, Amount (Rs), Status, Date Paid (if applicable), Admin Notes (if rejected)
// Show most recent first
// Paginated / infinite scroll
// Tap row to see full details (IBAN, notes, rejection reason)
```

- [ ] **Step 6: Create payouts page**

```typescript
// apps/web/src/app/[locale]/(vendor)/payouts/page.tsx
// Top section: payout-form
// Bottom section: payout-history
// Refresh button
```

- [ ] **Step 7: Test payouts in browser**

View available balance. Submit payout request with valid IBAN and amount ≤ balance. Verify request appears in history with PENDING status. Try submitting amount > balance; verify submit is disabled. As admin, approve payout; verify status updates to APPROVED in vendor view.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/schemas/vendor.ts apps/web/src/lib/vendor/hooks/use-vendor-payouts.ts apps/web/src/components/vendor/payouts/ apps/web/src/app/\[locale\]/\(vendor\)/payouts/
git commit -m "feat: vendor payout request and history"
```

---

## Task 9: Vendor Staff Management

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/staff/page.tsx`
- Create: `apps/web/src/components/vendor/forms/staff-form.tsx`
- Create: `apps/web/src/lib/vendor/hooks/use-vendor-staff.ts`

**Interfaces:**
- Consumes: TanStack Query; GET/POST/DELETE /vendor/staff
- Produces: staff list with add/remove; form for inviting staff by phone

- [ ] **Step 1: Create vendor staff hook**

```typescript
// apps/web/src/lib/vendor/hooks/use-vendor-staff.ts
// useStaff(): TanStack Query for GET /vendor/staff
// useAddStaff(): mutation for POST /vendor/staff (phone number)
// useRemoveStaff(userId): mutation for DELETE /vendor/staff/:userId
```

- [ ] **Step 2: Create staff form component**

```typescript
// apps/web/src/components/vendor/forms/staff-form.tsx
// Input field: staff phone number (Pakistani format)
// Submit button (Add Staff)
// Success: staff is added; form clears; list refreshes
// Error: show error toast (user not found, already added, etc.)
```

- [ ] **Step 3: Create staff page**

```typescript
// apps/web/src/app/[locale]/(vendor)/staff/page.tsx
// Render staff-form
// Render staff list: name, phone, role (VENDOR_STAFF), remove button
// Confirmation modal for remove
// Empty state if no staff
```

- [ ] **Step 4: Test staff management in browser**

Add a staff member by phone number. Verify staff appears in list. Remove staff; verify confirmation and removal. Try adding a phone that doesn't exist; verify error. Try adding same person twice; verify error.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/vendor/hooks/use-vendor-staff.ts apps/web/src/components/vendor/forms/staff-form.tsx apps/web/src/app/\[locale\]/\(vendor\)/staff/
git commit -m "feat: vendor staff management"
```

---

## Task 10: Vendor Profile & Settings

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/profile/page.tsx`
- Create: `apps/web/src/app/[locale]/(vendor)/settings/page.tsx`
- Create: `apps/web/src/lib/vendor/hooks/use-vendor-profile.ts`

**Interfaces:**
- Consumes: TanStack Query; GET/PATCH /me, GET/PATCH /me/notification-preferences
- Produces: profile edit form; notification preferences screen

- [ ] **Step 1: Create vendor profile hook**

```typescript
// apps/web/src/lib/vendor/hooks/use-vendor-profile.ts
// useProfile(): TanStack Query for GET /me (vendor user data)
// useUpdateProfile(): mutation for PATCH /me (name, locale)
// useNotificationPreferences(): TanStack Query for GET /me/notification-preferences
// useUpdateNotificationPreferences(): mutation for PATCH /me/notification-preferences
```

- [ ] **Step 2: Create profile page**

```typescript
// apps/web/src/app/[locale]/(vendor)/profile/page.tsx
// Edit form: vendor name, phone (read-only), email (optional)
// Language preference (EN/UR)
// Save button → PATCH /me
// Current data pre-filled
```

- [ ] **Step 3: Create settings page**

```typescript
// apps/web/src/app/[locale]/(vendor)/settings/page.tsx
// Notification preferences: toggles for SMS, WhatsApp, Push, Email (per-channel opt-out)
// Language preference
// Account section: change password (optional; may not apply if OAuth)
// Logout button
```

- [ ] **Step 4: Test profile and settings in browser**

Update name; verify it saves and persists. Toggle notification channels; verify preferences save. Switch language; verify UI updates.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/vendor/hooks/use-vendor-profile.ts apps/web/src/app/\[locale\]/\(vendor\)/profile/ apps/web/src/app/\[locale\]/\(vendor\)/settings/
git commit -m "feat: vendor profile and notification settings"
```

---

## Task 11: Vendor Dashboard (Overview)

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/dashboard/page.tsx`
- Modify: `apps/web/src/app/[locale]/(vendor)/page.tsx` (redirect to dashboard instead of orders)
- Create: `apps/web/src/components/vendor/dashboard/dashboard-summary.tsx`

**Interfaces:**
- Consumes: TanStack Query; GET /vendor/orders/counts, GET /vendor/earnings, GET /vendor/profile
- Produces: dashboard page with KPI tiles, recent orders, today's earnings snapshot

- [ ] **Step 1: Create dashboard summary component**

```typescript
// apps/web/src/components/vendor/dashboard/dashboard-summary.tsx
// KPI tiles: Pending Orders | In Process | Today's Earnings | Weekly Earnings
// Fetch from useVendorOrders(), useVendorEarnings(), useVendorProfile()
// Load skeleton while fetching
```

- [ ] **Step 2: Create dashboard page**

```typescript
// apps/web/src/app/[locale]/(vendor)/dashboard/page.tsx
// Render dashboard-summary
// Show recent orders (last 5 orders, link to board)
// Show quick actions: View Catalog | Set Hours | Edit Profile
```

- [ ] **Step 3: Update vendor home page**

```typescript
// apps/web/src/app/[locale]/(vendor)/page.tsx
// Instead of redirect, render dashboard
// Or redirect to /vendor/dashboard
```

- [ ] **Step 4: Test dashboard in browser**

View dashboard; verify tiles update as orders/earnings change. Tap quick actions; verify navigation works.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/vendor/dashboard/dashboard-summary.tsx apps/web/src/app/\[locale\]/\(vendor\)/dashboard/
git commit -m "feat: vendor dashboard with overview KPIs"
```

---

## Task 12: Vendor Onboarding Guide & Polish

**Files:**
- Modify: `apps/web/src/app/[locale]/(vendor)/registration/page.tsx` (add guide)
- Modify: vendor shell (add onboarding badge if APPROVED and no catalog)
- Create: `apps/web/src/components/vendor/onboarding-guide.tsx` (optional)

**Interfaces:**
- Consumes: vendor profile status, catalog item count
- Produces: onboarding checklist and contextual guidance

- [ ] **Step 1: Create onboarding guide component**

```typescript
// apps/web/src/components/vendor/onboarding-guide.tsx
// Checklist: Set Hours | Add Catalog | Set Service Radius | Configure Staff (optional)
// Completed items show checkmark; incomplete show "To Do"
// Tap each item to navigate to relevant page
// Show if vendor is APPROVED and catalog is empty
```

- [ ] **Step 2: Add onboarding badge to vendor shell**

Show notification badge on relevant sidebar items if onboarding incomplete.

- [ ] **Step 3: Add contextual help**

First-time vendor hints: "Your hours control when customers can order" next to hours editor; "Customers see items in your catalog" next to catalog manager.

- [ ] **Step 4: Test onboarding experience**

As new vendor, complete registration. View dashboard; verify onboarding guide appears. Complete each onboarding step; verify checklist updates. After all steps, guide disappears.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/vendor/onboarding-guide.tsx
git commit -m "feat: vendor onboarding guide and contextual help"
```

---

## Task 13: Internationalization & RTL Audit

**Files:**
- Modify: `apps/web/src/messages/en.json` (add vendor-specific keys)
- Modify: `apps/web/src/messages/ur.json` (add vendor Urdu translations)

**Interfaces:**
- Consumes: Urdu glossary (`apps/api/src/common/urdu-glossary.spec.ts`)
- Produces: complete en/ur key parity; RTL-safe layouts; Urdu font loads correctly

- [ ] **Step 1: Audit all vendor screens for hard-coded strings**

Search for untranslated copy; ensure all UI text is in message catalogs.

- [ ] **Step 2: Add vendor keys to en.json and ur.json**

Categories: vendor.registration, vendor.orders, vendor.catalog, vendor.earnings, vendor.payouts, vendor.staff, vendor.settings, vendor.profile, vendor.dashboard

Examples:
- `vendor.orders.board.new_orders`
- `vendor.catalog.add_item`
- `vendor.earnings.period.today`

- [ ] **Step 3: RTL audit on vendor screens**

Check in browser with `dir="rtl"`:
- Sidebar navigation text alignment
- Form input labels
- Table columns
- Modals and buttons
- Charts and icons

Fix any LTR-biased layouts (e.g., absolute positioning, `text-left`).

- [ ] **Step 4: Test in Urdu**

Switch app to Urdu; navigate all vendor screens. Verify text reads correctly; no clipping; icons align properly; line-height accommodates Urdu ligatures.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/ur.json
git commit -m "feat: vendor app Urdu translations and RTL audit"
```

---

## Task 14: Mobile Responsiveness & Touch Targets

**Files:**
- Modify: vendor components (ensure touch targets ≥44px)
- Modify: vendor layouts (test on mobile viewports)

**Interfaces:**
- Consumes: vendor UI components
- Produces: mobile-first layouts; tested on Android 8+, iOS 13+

- [ ] **Step 1: Audit touch targets**

All buttons, inputs, and interactive elements must be ≥44x44px on mobile. Fix any buttons < 44px by increasing padding or using flexbox spacing.

- [ ] **Step 2: Test on mobile viewports**

Use DevTools to test on:
- iPhone 12 (390x844)
- Android (375x812, common)
- iPad (768x1024)

Verify no horizontal scrolling; sidebar collapses to burger menu; modals are full-screen on mobile.

- [ ] **Step 3: Test vendor flow on real device**

Use Android phone or iOS device (or simulator). Register vendor; place/accept order; manage catalog. Verify no layout issues; touch targets are easy to tap.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix: vendor app mobile responsiveness and touch targets"
```

---

## Task 15: Accessibility & SEO

**Files:**
- Modify: vendor components (add aria-labels, semantic HTML)

**Interfaces:**
- Consumes: vendor UI components
- Produces: axe audit passing; semantic markup; keyboard navigation

- [ ] **Step 1: Add semantic HTML**

Use `<button>`, `<input>`, `<label>` correctly (not divs). Use `<nav>` for sidebar, `<main>` for content.

- [ ] **Step 2: Add aria-labels and roles**

- Buttons: aria-label if text is not visible (e.g., icon buttons)
- Form inputs: linked `<label>` with `for` attribute
- Modals: `role="dialog"` with aria-labelledby
- Tables: `<th>` for headers, proper scope

- [ ] **Step 3: Test with axe browser extension**

Run axe on each vendor screen; fix any violations (contrast, labels, heading hierarchy).

- [ ] **Step 4: Test keyboard navigation**

Tab through vendor app; verify focus visible; all interactive elements reachable; no focus traps.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix: vendor app accessibility audit (axe passing, keyboard navigation)"
```

---

## Task 16: Testing & Type Safety

**Files:**
- Create: `apps/web/src/app/[locale]/(vendor)/__tests__/` (component tests)
- Modify: `.github/workflows/ci.yml` (add vendor app typecheck/lint)

**Interfaces:**
- Consumes: vendor components, hooks, pages
- Produces: component tests passing; no TS errors; lint warnings resolved

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck -w @dhoblio/web
```

Fix any TS errors (unused vars, type mismatches, missing exports).

- [ ] **Step 2: Run lint**

```bash
npm run lint -w @dhoblio/web
```

Fix ESLint issues; ensure consistent code style.

- [ ] **Step 3: Write component tests (optional but recommended)**

For critical components (order-board, payout-form, wizard):
- Snapshot tests for UI structure
- Integration tests for form submission and error handling
- Hook tests for TanStack Query mutation/query behavior

```bash
npm test -w @dhoblio/web
```

- [ ] **Step 4: End-to-end test (Playwright)**

Write Playwright scenario:

```typescript
// apps/web/playwright/vendor.spec.ts
test('vendor flow: register → set hours → add catalog → accept order', async ({ page }) => {
  // Register
  await page.goto('/en/vendor/registration');
  // Fill steps 1–4; submit
  // Verify status = APPROVED

  // Set hours
  await page.goto('/en/vendor/hours');
  // Set working hours; save

  // Add catalog
  await page.goto('/en/vendor/catalog');
  // Add item; verify appears in list

  // Accept order (requires admin to create one)
  await page.goto('/en/vendor/orders');
  // Verify order appears; accept
});
```

Run: `npm run test:e2e:playwright -w @dhoblio/web` (or similar)

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright/vendor.spec.ts
git commit -m "test: vendor app component and e2e tests; full typecheck passing"
```

---

## Task 17: Final Review & Documentation

**Files:**
- Create: `apps/web/README.md` (update with vendor panel section)
- Modify: `docs/Dhoblio-TRACKER.md` (tick FE-2.1–2.8, FE-4.5–4.6, FE-6.4–6.5, FE-8.5)

**Interfaces:**
- Consumes: completed vendor app
- Produces: documentation; tracker updated; code ready for review

- [ ] **Step 1: Update apps/web/README.md**

Add section: "Vendor Panel" with brief description of screens and how to run.

- [ ] **Step 2: Update Dhoblio-TRACKER.md**

Mark complete:
- FE-2.1–2.8: Vendor registration wizard + catalog + hours/availability + staff
- FE-4.5–4.6: Vendor order board + detail
- FE-6.4–6.5: Vendor earnings + payouts
- FE-8.5: Vendor dashboard

- [ ] **Step 3: Review git log for vendor app commits**

Ensure all commits are descriptive and follow the pattern: `feat: <feature>` or `fix: <issue>`.

- [ ] **Step 4: Final manual testing**

As a vendor:
1. Register (all 4 steps)
2. Set hours + availability
3. Add catalog items + bulk import
4. Invite staff
5. View earnings dashboard
6. Request payout
7. Accept/reject/process an order
8. View ledger
9. Edit profile + settings

All should work end-to-end.

- [ ] **Step 5: Verify en/ur parity**

Switch language to Urdu; navigate all screens. No missing translations; RTL layout correct.

- [ ] **Step 6: Commit final documentation**

```bash
git add docs/Dhoblio-TRACKER.md apps/web/README.md
git commit -m "docs: update tracker and README for completed vendor app phase"
```

---

## Execution Notes

1. **Branch strategy**: Work in feature branch `phase-2-fe-vendor-app` (or similar); create a PR to `dev` when complete.

2. **API dependency**: All backend endpoints (Phase 2, 4, 6 BE) must be merged to `dev` before starting FE. Verify with `npm run openapi` that the generated client includes all vendor endpoints.

3. **Draft persistence**: IndexedDB is used for registration wizard draft; choose key prefix `vendor_` to avoid collisions with other drafts (e.g., customer checkout draft).

4. **Real-time updates**: SSE endpoint for orders requires `Last-Event-ID` support for replay on reconnect. Test reconnect behavior on throttled network.

5. **Urdu glossary**: Maintain `apps/api/src/common/urdu-glossary.spec.ts` for terminology; sync with vendor-specific terms before translating.

6. **Performance**: Vendor dashboard, order board, and earnings charts should load in < 2 s on 3G. Use React.memo, useMemo, useCallback selectively; avoid re-fetching on route change (TanStack Query caching).

7. **State management**: All vendor state is server-sourced via TanStack Query; no global Redux store. Optimistic updates for fast UX; server truth is canonical.

8. **Testing data**: Seed demo vendor in dev mode (`npm run db:seed`). Use seeded vendor +923000000011 to test vendor flows.

9. **Route guards**: Vendor routes (`/vendor/*`) require `role === VENDOR`; admin routes still require `role === ADMIN`. Shared login at `/login` routes to appropriate panel based on role.

10. **Commits before final push**:
    - After all tasks complete
    - Run `npm run lint -w @dhoblio/web` and `npm run typecheck -w @dhoblio/web`
    - Run `npm test -w @dhoblio/web` (if test suite exists)
    - Write comprehensive commit message with all features listed
    - Push to `dev` branch

---

## Plan Review Checklist

- [x] Spec coverage: All FR-V1–V10 tasks assigned
- [x] Step clarity: Each step is unambiguous; implementer knows what to build
- [x] Type consistency: Function names, API endpoints, field names used consistently
- [x] Review Focus: Five input classes and failure modes identified; tests named per task
- [x] Proportion: Plan length reasonable for scope; no code transcripts

---

**Plan complete and saved to `docs/superpowers/plans/2026-11-04-vendor-app-phase-fe.md`.**
