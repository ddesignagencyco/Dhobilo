import { ID, PHONE, SAMPLE_BOARD_ROW, SAMPLE_ITEM, SAMPLE_VENDOR_ORDER, SAMPLE_VENDOR_PROFILE } from '../samples';
import type { OperationDocs } from '../types';
import { ok, page, PAGING_PARAMS } from './helpers';

const VENDOR_FOLDER = `dhoblio/development/vendors/${ID.user}/docs`;
const OWNER = ['VENDOR_OWNER'] as const;
const OWNER_OR_STAFF = ['VENDOR_OWNER', 'VENDOR_STAFF'] as const;

export const vendorDocs: OperationDocs = {
  'POST /media/sign': {
    summary: 'Get permission to upload a file',
    who: ['VENDOR_OWNER', 'RIDER'],
    description:
      'Returns a signed form for **direct upload to Cloudinary** (the file never passes through our server). Each kind of upload belongs to one account type:\n\n' +
      '| `kind` | For | Stored |\n|---|---|---|\n| `vendor-docs` | vendor owners (CNIC, shop photos) | privately, never a public URL |\n| `rider-photo` | riders (profile photo customers see) | publicly |\n| `delivery-proof` | riders (proof-of-delivery photo) | privately |\n\n' +
      '1. Call this endpoint.\n2. Upload each file to `https://api.cloudinary.com/v1_1/{cloud_name}/image/upload` as `multipart/form-data` with the returned fields (`api_key`, `timestamp`, `signature`, `folder`, `upload_preset`, `type`) plus `file`.\n' +
      '3. Send the returned `public_id` values to `POST /vendor/register` (vendors), `POST /rider/register` (rider photo) or `POST /rider/jobs/{id}/complete` (delivery proof).\n\n' +
      'Allowed: JPG, PNG or WebP up to 5 MB (checked again on the server). 30 signatures per hour.',
    requests: {
      default: { summary: 'Vendor verification documents', value: { kind: 'vendor-docs' } },
      riderPhoto: { summary: 'Rider profile photo', value: { kind: 'rider-photo' } },
      proof: { summary: 'Proof-of-delivery photo', value: { kind: 'delivery-proof' } },
    },
    response: {
      example: ok({
        timestamp: 1792675000,
        signature: 'a3f1c9e5d7b2486f0c1e9a7d5b3f2c4e8a6d1b09',
        folder: VENDOR_FOLDER,
        upload_preset: 'dhoblio_upload',
        api_key: '481854998333248',
        cloud_name: 'snmipuuw',
        type: 'authenticated',
        limits: { maxBytes: 5242880, formats: ['jpg', 'png', 'webp'] },
      }),
    },
    errors: [
      { status: 403, code: 'FORBIDDEN', when: 'This kind of upload belongs to a different account type (for example a rider asking for `vendor-docs`).' },
      { status: 429, code: 'RATE_LIMITED', when: 'Too many attempts. Please try again later.' },
      { status: 503, code: 'MEDIA_NOT_CONFIGURED', when: 'Media uploads are not configured.' },
    ],
  },
  'POST /vendor/register': {
    summary: 'Apply to become a vendor',
    who: [...OWNER],
    description:
      'Sign in as a vendor owner first (`POST /auth/otp/verify` with `role: VENDOR_OWNER`), upload the documents (`POST /media/sign`), then send the details here. ' +
      'The vendor starts **PENDING** until an admin approves it. You must include one `CNIC_FRONT`, one `CNIC_BACK` and 1–4 `SHOP_PHOTO` documents.\n\n' +
      'The CNIC is stored encrypted and the same CNIC cannot register twice. A **rejected** vendor fixes the details and calls this endpoint again to re-apply.',
    requests: {
      default: {
        summary: 'Laundry in Lahore',
        value: {
          businessName: 'Sparkle Laundry',
          description: 'Wash, iron and dry clean. Free fold.',
          email: 'owner@sparklelaundry.pk',
          addressLine: 'Main Market, Model Town, Lahore',
          cityId: 1,
          lat: 31.523,
          lng: 74.361,
          cnic: '35202-1234567-1',
          documents: [
            { type: 'CNIC_FRONT', publicId: `${VENDOR_FOLDER}/abc123front` },
            { type: 'CNIC_BACK', publicId: `${VENDOR_FOLDER}/abc123back` },
            { type: 'SHOP_PHOTO', publicId: `${VENDOR_FOLDER}/abc123shop` },
          ],
        },
      },
    },
    response: { status: 201, description: 'Application received', example: ok({ id: ID.vendor, businessName: 'Sparkle Laundry', status: 'PENDING', cityId: 1, createdAt: '2026-10-22T10:00:00.000Z' }) },
    errors: [
      { status: 400, code: 'INVALID_CNIC', when: 'Enter a valid 13-digit CNIC.' },
      { status: 400, code: 'INVALID_DOCUMENTS', when: 'Exactly one CNIC front photo is required.' },
      { status: 400, code: 'MEDIA_INVALID_ASSET', when: 'Asset is outside the expected folder.' },
      { status: 409, code: 'VENDOR_ALREADY_REGISTERED', when: 'This account already has a vendor registration.' },
      { status: 409, code: 'DUPLICATE_CNIC', when: 'A vendor with this CNIC is already registered.' },
      { status: 409, code: 'EMAIL_IN_USE', when: 'This email is already used by another account.' },
    ],
  },
  'GET /vendor/profile': {
    summary: 'My shop and its review status',
    who: [...OWNER_OR_STAFF],
    description: 'Works in every status, so the app can show "pending", "rejected (with the reason)" or "suspended". Never returns the CNIC or document links.',
    response: { example: ok(SAMPLE_VENDOR_PROFILE) },
    errors: [{ status: 403, code: 'VENDOR_NOT_REGISTERED', when: 'No vendor account is linked to this user.' }],
  },
  'PATCH /vendor/profile': {
    summary: 'Edit shop settings',
    who: [...OWNER],
    description: 'Approved vendors only. `serviceRadiusKm` (0.5–50) is how far from the shop you deliver; `respondWithinMin` (5–60) is how long you have to answer a new order before it is auto-rejected; `slotCapacity` is orders per hourly window.',
    requests: { default: { summary: 'Wider radius, 20 minutes to respond', value: { description: 'Same-day ironing available.', serviceRadiusKm: 12, respondWithinMin: 20, slotCapacity: 8 } } },
    response: { example: ok({ ...SAMPLE_VENDOR_PROFILE, serviceRadiusKm: '12', respondWithinMin: 20, slotCapacity: 8 }) },
    errors: [{ status: 403, code: 'VENDOR_NOT_ACTIVE', when: 'This action needs an approved vendor account.' }],
  },
  'GET /vendor/hours': {
    summary: 'Weekly opening hours',
    who: [...OWNER_OR_STAFF],
    description: 'Times are minutes after midnight (9:00 = 540). Days not listed are closed.',
    response: { example: ok([{ dayOfWeek: 1, opensAt: 540, closesAt: 1260 }, { dayOfWeek: 2, opensAt: 540, closesAt: 1260 }]) },
  },
  'PUT /vendor/hours': {
    summary: 'Set opening hours',
    who: [...OWNER],
    description: 'Replaces the whole schedule at once. `dayOfWeek` is 0 (Sunday) to 6 (Saturday). Opening must be before closing; use `1440` for midnight. Send `[]` to close every day.',
    requests: { default: { summary: 'Monday–Saturday, 9:00 to 21:00', value: { hours: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, opensAt: 540, closesAt: 1260 })) } } },
    response: { example: ok([1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, opensAt: 540, closesAt: 1260 }))) },
    errors: [{ status: 400, code: 'INVALID_HOURS', when: 'Opening time must be before closing time.' }],
  },
  'PATCH /vendor/availability': {
    summary: 'Open / Busy / Closed switch',
    who: [...OWNER_OR_STAFF],
    description: 'Only `OPEN` shops appear in search and can take new orders. Staff can use this switch too.',
    requests: { open: { summary: 'Start taking orders', value: { availability: 'OPEN' } }, busy: { summary: 'Pause new orders', value: { availability: 'BUSY' } } },
    response: { example: ok({ id: ID.vendor, availability: 'OPEN' }) },
  },
  'GET /vendor/staff': {
    summary: 'My staff',
    who: [...OWNER],
    response: { example: ok([{ userId: ID.staff, phone: PHONE.vendor, name: 'Bilal', status: 'ACTIVE', hasSignedIn: true }]) },
  },
  'POST /vendor/staff': {
    summary: 'Invite a staff member by phone',
    who: [...OWNER],
    description: 'They sign in with an SMS code like everyone else and can then work the order board and switch availability. A number that already belongs to another kind of account cannot be added. Up to 10 staff, each working for one vendor.',
    requests: { default: { summary: 'New staff member', value: { phone: '03001112233', name: 'Bilal' } } },
    response: { status: 201, description: 'Added', example: ok({ userId: ID.staff, phone: '+923001112233', name: 'Bilal', status: 'ACTIVE', hasSignedIn: false }) },
    errors: [
      { status: 409, code: 'PHONE_IN_USE', when: 'This number already belongs to another kind of account.' },
      { status: 409, code: 'STAFF_ALREADY_ADDED', when: 'This person is already on your staff.' },
      { status: 409, code: 'STAFF_LINKED_ELSEWHERE', when: 'This person already works for another vendor.' },
      { status: 422, code: 'STAFF_LIMIT_REACHED', when: 'A vendor can have up to 10 staff accounts.' },
    ],
  },
  'DELETE /vendor/staff/{userId}': {
    summary: 'Remove a staff member',
    who: [...OWNER],
    description: 'Unlinks them and signs them out everywhere straight away.',
    params: { userId: { example: ID.staff, description: 'The staff member’s user id (`userId` from the staff list).' } },
    response: { status: 204, description: 'Removed (no body)' },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Staff member not found.' }],
  },
};

export const catalogDocs: OperationDocs = {
  'GET /service-categories': {
    summary: 'Service categories',
    who: 'public',
    description: 'The groups items are filed under. Use `id` as `categoryId` when adding an item; the import accepts the `name`.',
    response: { example: ok([{ id: 1, name: 'Wash & Fold', nameUr: 'دھلائی اور تہہ' }, { id: 2, name: 'Wash & Iron', nameUr: 'دھلائی اور استری' }, { id: 3, name: 'Dry Cleaning', nameUr: 'ڈرائی کلیننگ' }]) },
  },
  'GET /vendor/catalog/items': {
    summary: 'My price list',
    who: [...OWNER_OR_STAFF],
    description: 'All your items including inactive ones (customers only see active ones). Deleted items are not listed.',
    response: { example: ok([SAMPLE_ITEM]) },
  },
  'POST /vendor/catalog/items': {
    summary: 'Add an item',
    who: [...OWNER],
    description: 'Price is in PKR with at most 2 decimals (1 to 500,000). If you delete an item and add the same name + service again, the old one is simply brought back.',
    requests: { default: { summary: 'Shirt, wash & iron', value: { categoryId: 2, itemName: 'Shirt', itemNameUr: 'قمیض', serviceType: 'WASH_IRON', price: 120, turnaroundHours: 48 } } },
    response: { status: 201, description: 'Added', example: ok(SAMPLE_ITEM) },
    errors: [
      { status: 400, code: 'CATEGORY_NOT_FOUND', when: 'Unknown service category.' },
      { status: 409, code: 'ITEM_EXISTS', when: 'You already have this item for this service.' },
    ],
  },
  'PATCH /vendor/catalog/items/{id}': {
    summary: 'Edit an item',
    who: [...OWNER],
    description: 'Send only what changes. Prices changed here never alter orders already placed. Set `isActive: false` to hide an item without deleting it.',
    params: { id: { example: ID.item, description: 'Item id' } },
    requests: { default: { summary: 'New price', value: { price: 135 } }, hide: { summary: 'Hide from customers', value: { isActive: false } } },
    response: { example: ok({ ...SAMPLE_ITEM, price: '135.00' }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Item not found.' }],
  },
  'DELETE /vendor/catalog/items/{id}': {
    summary: 'Delete an item',
    who: [...OWNER],
    description: 'Soft delete: it disappears from your list and from customers, but past orders keep their own copy.',
    params: { id: { example: ID.item, description: 'Item id' } },
    response: { status: 204, description: 'Deleted (no body)' },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Item not found.' }],
  },
  'POST /vendor/catalog/import': {
    summary: 'Bulk add / update items (JSON or CSV)',
    who: [...OWNER],
    description:
      'Up to 500 rows in one go. **All or nothing**: if any row is wrong nothing is imported and *every* problem is listed with its row number. ' +
      'Existing items (same name + service) are updated; new ones are created.\n\n' +
      '**JSON:** `Content-Type: application/json` with `{ "items": [ … ] }`.\n\n' +
      '**CSV:** `Content-Type: text/csv` with the header `itemName,itemNameUr,category,serviceType,price,turnaroundHours,isActive` ' +
      '(`isActive` and `itemNameUr` can be empty; `category` is the category *name*).',
    requests: {
      default: {
        summary: 'Two items as JSON',
        value: {
          items: [
            { itemName: 'Shirt', itemNameUr: 'قمیض', category: 'Wash & Iron', serviceType: 'WASH_IRON', price: 120, turnaroundHours: 48 },
            { itemName: 'Suit (2 piece)', category: 'Dry Cleaning', serviceType: 'DRY_CLEAN', price: 1100, turnaroundHours: 72, isActive: true },
          ],
        },
      },
      csv: {
        summary: 'The same as a CSV file (Content-Type: text/csv)',
        value: 'itemName,itemNameUr,category,serviceType,price,turnaroundHours,isActive\nShirt,قمیض,Wash & Iron,WASH_IRON,120,48,\nSuit (2 piece),,Dry Cleaning,DRY_CLEAN,1100,72,true\n',
      },
    },
    response: { example: ok({ created: 1, updated: 1, total: 2 }) },
    errors: [{ status: 422, code: 'CATALOG_IMPORT_INVALID', when: 'Some rows are invalid. Nothing was imported.' }],
  },
};

export const vendorOrderDocs: OperationDocs = {
  'GET /vendor/orders': {
    summary: 'Order board',
    who: [...OWNER_OR_STAFF],
    description:
      '`?status=PLACED` is the **"needs a response"** tab: most urgent first, with `respondBy` (the deadline after which the order is rejected automatically). ' +
      'Everything else is newest first with `meta.nextCursor` paging. Combine statuses with commas: `?status=ACCEPTED,PICKED_UP`.\n\n' +
      'A suspended vendor can still see and finish orders already in progress.',
    params: { ...PAGING_PARAMS, status: { example: 'PLACED', description: 'One or more statuses, comma separated.' }, limit: { example: 20 } },
    response: { example: page([SAMPLE_BOARD_ROW], null) },
  },
  'GET /vendor/orders/counts': {
    summary: 'Order counts per status',
    who: [...OWNER_OR_STAFF],
    description: 'For the badges on the board’s tabs. Every status is present, zero or not.',
    response: { example: ok({ PLACED: 2, ACCEPTED: 1, REJECTED: 0, PICKED_UP: 1, IN_PROCESS: 3, READY: 0, OUT_FOR_DELIVERY: 1, DELIVERED: 18, CANCELLED: 1 }) },
  },
  'GET /vendor/orders/{id}': {
    summary: 'Order details for the vendor',
    who: [...OWNER_OR_STAFF],
    description: 'Items, slots, address, a **masked** customer phone, your commission and earning, and `nextActions` — what you can do right now (drives the buttons).',
    params: { id: { example: ID.order, description: 'Order id' } },
    response: { example: ok(SAMPLE_VENDOR_ORDER) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Order not found (other vendors’ orders are never visible).' }],
  },
  'POST /vendor/orders/{id}/accept': {
    summary: 'Accept a new order',
    who: [...OWNER_OR_STAFF],
    description: 'Must be answered before `respondBy`, or the order is rejected automatically. The customer is notified.',
    params: { id: { example: ID.order, description: 'Order id' } },
    response: { example: ok({ ...SAMPLE_VENDOR_ORDER, status: 'ACCEPTED', acceptedAt: '2026-10-22T13:35:12.000Z', nextActions: ['PICKED_UP'] }) },
    errors: [
      { status: 403, code: 'VENDOR_NOT_ACTIVE', when: 'A suspended vendor cannot take new orders.' },
      { status: 409, code: 'ORDER_INVALID_TRANSITION', when: 'An order that is accepted cannot become accepted.' },
    ],
  },
  'POST /vendor/orders/{id}/reject': {
    summary: 'Reject a new order',
    who: [...OWNER_OR_STAFF],
    description: 'A reason (5–300 characters) is required and is shown to the customer. Frees the time slot.',
    params: { id: { example: ID.order, description: 'Order id' } },
    requests: { default: { summary: 'Fully booked', value: { reason: 'We are fully booked this week.' } } },
    response: { example: ok({ ...SAMPLE_VENDOR_ORDER, status: 'REJECTED', rejectionReason: 'We are fully booked this week.', nextActions: [] }) },
    errors: [{ status: 409, code: 'ORDER_INVALID_TRANSITION', when: 'An order that is accepted cannot become rejected.' }],
  },
  'POST /vendor/orders/{id}/status': {
    summary: 'Move an accepted order forward',
    who: [...OWNER_OR_STAFF],
    description:
      'One step at a time, in this order:\n\n' +
      '1. `PICKED_UP` — laundry received\n2. `IN_PROCESS` — work started\n3. `READY` — finished\n4. `OUT_FOR_DELIVERY` — handed to the rider\n\n' +
      'Skipping a step, going backwards or marking it delivered is refused (delivery is confirmed by the rider). The customer is notified at every step.',
    params: { id: { example: ID.order, description: 'Order id' } },
    requests: {
      received: { summary: 'Laundry received', value: { status: 'PICKED_UP' } },
      started: { summary: 'Work started', value: { status: 'IN_PROCESS' } },
      ready: { summary: 'Finished', value: { status: 'READY' } },
      handoff: { summary: 'Handed to the rider', value: { status: 'OUT_FOR_DELIVERY' } },
    },
    response: { example: ok({ ...SAMPLE_VENDOR_ORDER, status: 'PICKED_UP', pickedUpAt: '2026-10-24T05:20:00.000Z', nextActions: ['IN_PROCESS'] }) },
    errors: [{ status: 409, code: 'ORDER_INVALID_TRANSITION', when: 'An order that is accepted cannot become ready.' }],
  },
};
