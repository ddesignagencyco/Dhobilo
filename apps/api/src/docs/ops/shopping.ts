import { ID, SAMPLE_CART, SAMPLE_ORDER, SAMPLE_ORDER_SUMMARY, SAMPLE_QUOTE, SAMPLE_TIMELINE, SAMPLE_VENDOR_CARD, SLOT } from '../samples';
import type { OperationDocs } from '../types';
import { ok, page, PAGING_PARAMS } from './helpers';

const LAT_LNG = {
  lat: { example: 31.5204, description: 'Your latitude (rounded to ~110 m for privacy and caching).' },
  lng: { example: 74.3587, description: 'Your longitude.' },
};

export const discoveryDocs: OperationDocs = {
  'GET /vendors': {
    summary: 'Find vendors near me',
    who: 'public',
    description:
      'No login needed. Only vendors you can **order from right now** are listed: approved, set to Open, inside today’s opening hours (city timezone), ' +
      'with at least one active item, and whose own service radius reaches your location.\n\n' +
      '- `sort`: `distance` (default, nearest first), `rating` (best first) or `price` (cheapest first).\n' +
      '- Page through results with `meta.nextCursor` → `?cursor=…`. The cursor only works with the same filters and sort.\n' +
      '- `maxPrice` means "has at least one item priced at or below this".\n' +
      '- Money values are strings with two decimals (PKR).',
    tag: 'discovery',
    params: {
      ...LAT_LNG,
      cityId: { example: 1, description: 'Only this city (from `GET /cities`).' },
      q: { example: 'sparkle', description: 'Business name contains (case-insensitive).' },
      serviceType: { example: 'DRY_CLEAN', description: 'WASH_FOLD, WASH_IRON, DRY_CLEAN, IRON_ONLY or OTHER.' },
      minRating: { example: 4, description: 'Average rating from 0 to 5.' },
      maxPrice: { example: 500, description: 'PKR.' },
      sort: { example: 'distance' },
      limit: { example: 20, description: '1 to 50 (default 20).' },
      cursor: { description: 'Opaque value from the previous page’s `meta.nextCursor`.' },
    },
    response: { example: page([SAMPLE_VENDOR_CARD], null) },
    errors: [{ status: 400, code: 'INVALID_CURSOR', when: 'The pagination cursor is invalid for this search.' }],
  },
  'GET /vendors/{id}': {
    summary: 'Vendor page',
    who: 'public',
    description: 'Details for the vendor screen: opening hours, delivery fee in their city, cheapest item and whether you can order **right now** (`openNow`). Non-approved vendors are not visible (404).',
    params: { id: { example: ID.vendor, description: 'Vendor id' } },
    response: {
      example: ok({
        id: ID.vendor,
        businessName: 'Sparkle Laundry',
        description: 'Wash, iron and dry clean. Free fold.',
        addressLine: 'Main Market, Model Town',
        cityId: 1,
        lat: 31.523,
        lng: 74.361,
        availability: 'OPEN',
        serviceRadiusKm: '10',
        respondWithinMin: 15,
        ratingAvg: '4.60',
        ratingCount: 128,
        city: { id: 1, name: 'Lahore', nameUr: 'لاہور', timezone: 'Asia/Karachi', deliveryFee: '150.00' },
        hours: [{ dayOfWeek: 1, opensAt: 540, closesAt: 1260 }],
        minPrice: '50.00',
        minTurnaroundHours: 24,
        serviceTypes: ['WASH_IRON', 'DRY_CLEAN'],
        openNow: true,
      }),
    },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Vendor not found (or not live).' }],
  },
  'GET /vendors/{id}/catalog': {
    summary: 'Vendor price list',
    who: 'public',
    description: 'Active items grouped by category, with English and Urdu names and current prices. Use the item `id` values when building a cart or placing an order.',
    params: { id: { example: ID.vendor, description: 'Vendor id' } },
    response: {
      example: ok({
        vendorId: ID.vendor,
        currency: 'PKR',
        categories: [
          { id: 2, name: 'Wash & Iron', nameUr: 'دھلائی اور استری', items: [{ id: ID.item, itemName: 'Shirt', itemNameUr: 'قمیض', serviceType: 'WASH_IRON', price: '120.00', turnaroundHours: 48 }] },
          { id: 3, name: 'Dry Cleaning', nameUr: 'ڈرائی کلیننگ', items: [{ id: ID.item2, itemName: 'Suit (2 piece)', itemNameUr: 'سوٹ (دو پیس)', serviceType: 'DRY_CLEAN', price: '1100.00', turnaroundHours: 72 }] },
        ],
      }),
    },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Vendor not found (or not live).' }],
  },
  'GET /vendors/{id}/slots': {
    summary: 'Available pickup / delivery windows',
    who: 'public',
    description:
      'Hourly windows inside the vendor’s opening hours for one day, with how many places are left. Rules: at least 1 hour from now; up to 7 days ahead; ' +
      'default capacity 10 orders per window.\n\n' +
      '**Delivery windows** depend on the pickup you chose: pass `pickupEnd` (the pickup slot’s `end`) and `turnaroundHours` (from the cart estimate’s `maxTurnaroundHours`). ' +
      'Delivery starts no earlier than pickup end + turnaround.\n\n' +
      'Send the chosen slot’s **`start`** exactly as returned when placing the order.',
    params: {
      id: { example: ID.vendor, description: 'Vendor id' },
      date: { example: '2026-10-24', description: 'Local date (YYYY-MM-DD).' },
      type: { example: 'pickup', description: '`pickup` or `delivery`.' },
      turnaroundHours: { example: 48, description: 'Delivery only: longest turnaround of the items.' },
      pickupEnd: { example: SLOT.pickupEnd, description: 'Delivery only: end of the chosen pickup window (ISO 8601).' },
    },
    response: {
      example: ok({
        date: '2026-10-24',
        timezone: 'Asia/Karachi',
        type: 'pickup',
        slotMinutes: 60,
        capacity: 10,
        slots: [
          { start: SLOT.pickupStart, end: SLOT.pickupEnd, available: true, remaining: 10 },
          { start: '2026-10-24T06:00:00.000Z', end: '2026-10-24T07:00:00.000Z', available: false, remaining: 0 },
        ],
      }),
    },
    errors: [
      { status: 400, code: 'DATE_OUT_OF_RANGE', when: 'Pick a date from today up to 7 days ahead.' },
      { status: 404, code: 'NOT_FOUND', when: 'Vendor not found (or not live).' },
    ],
  },
};

export const cartDocs: OperationDocs = {
  'GET /cart': {
    summary: 'My carts',
    who: ['CUSTOMER'],
    description: 'One cart per vendor. Items that were removed or deactivated since you added them show `available: false` and are left out of the subtotal.',
    params: { vendorId: { example: ID.vendor, description: 'Only this vendor’s cart.' } },
    response: { example: ok([SAMPLE_CART]) },
  },
  'PUT /cart': {
    summary: 'Set the cart for a vendor',
    who: ['CUSTOMER'],
    description: 'Replaces the whole cart for that vendor, so it is safe to retry. Repeated items are merged. An empty `items` list removes the cart. Up to 30 different items, 50 of each, 10 open carts.',
    requests: { default: { summary: '3 shirts', value: { vendorId: ID.vendor, items: [{ serviceItemId: ID.item, qty: 3 }] } }, clear: { summary: 'Empty the cart', value: { vendorId: ID.vendor, items: [] } } },
    response: { example: ok(SAMPLE_CART) },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'Vendor not found (or not live).' },
      { status: 422, code: 'ITEM_UNAVAILABLE', when: 'Some items are no longer available from this vendor.' },
      { status: 422, code: 'CART_LIMIT_REACHED', when: 'You can keep up to 10 open carts.' },
    ],
  },
  'DELETE /cart': {
    summary: 'Empty a cart (or all of them)',
    who: ['CUSTOMER'],
    params: { vendorId: { example: ID.vendor, description: 'Leave out to remove every cart.' } },
    response: { status: 204, description: 'Removed (no body)' },
  },
  'POST /cart/estimate': {
    summary: 'Price estimate',
    who: ['CUSTOMER'],
    description:
      'Instant total from **current** prices: items + the city’s flat delivery fee. Send `items`, or leave them out to price your saved cart. ' +
      'Use `total` as `expectedTotal` when placing the order, and `maxTurnaroundHours` to ask for delivery slots.\n\n' +
      'A `VENDOR_NOT_ACCEPTING_ORDERS` warning means the vendor is closed or busy right now.',
    requests: { items: { summary: 'Price these items', value: { vendorId: ID.vendor, items: [{ serviceItemId: ID.item, qty: 3 }] } }, cart: { summary: 'Price my saved cart', value: { vendorId: ID.vendor } } },
    response: { example: ok(SAMPLE_QUOTE) },
    errors: [
      { status: 400, code: 'CART_EMPTY', when: 'Add at least one item.' },
      { status: 422, code: 'PROMO_NOT_FOUND', when: 'The code does not exist.' },
      { status: 422, code: 'PROMO_UNAVAILABLE', when: 'The code is inactive, expired, for another city, or belongs to another account.' },
      { status: 422, code: 'PROMO_MIN_ORDER', when: 'The cart subtotal is below the code\'s minimum order.' },
      { status: 422, code: 'PROMO_USAGE_LIMIT', when: 'The code has reached its usage limit or you already used it.' },
      { status: 404, code: 'NOT_FOUND', when: 'Vendor not found (or not live).' },
      { status: 422, code: 'ITEM_UNAVAILABLE', when: 'Some items are no longer available from this vendor.' },
    ],
  },
};

export const orderDocs: OperationDocs = {
  'POST /orders': {
    summary: 'Place an order',
    who: ['CUSTOMER'],
    description:
      'Creates an order (cash on delivery for now). **Required header:** `Idempotency-Key` — generate a fresh UUID per checkout and **reuse it if you retry** after a network failure: ' +
      'you get the original order back (`200`, header `Idempotent-Replay: true`) instead of a duplicate. `201` means newly created.\n\n' +
      'Before placing: pick an address (inside the vendor’s radius), get an estimate, and choose slots from `GET /vendors/{id}/slots`.\n\n' +
      '**Price protection:** send the `expectedTotal` you showed the customer. If prices changed meanwhile you get `409 PRICE_CHANGED` with the new total; nothing is charged.',
    params: { 'Idempotency-Key': { example: '5d6f1c3a-7b2e-4f8a-9c10-2e4a6b8c0d12', description: '8-100 characters; a UUID is ideal.' } },
    requests: {
      default: {
        summary: '3 shirts, cash on delivery',
        value: { vendorId: ID.vendor, addressId: ID.address, items: [{ serviceItemId: ID.item, qty: 3 }], pickupSlotStart: SLOT.pickupStart, deliverySlotStart: SLOT.deliveryStart, paymentMethod: 'COD', expectedTotal: '510.00', customerNote: 'Please fold gently' },
      },
    },
    response: { status: 201, description: 'Order created (200 when it is a retry of an earlier request)', example: ok(SAMPLE_ORDER) },
    errors: [
      { status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED', when: 'The Idempotency-Key header is required to place an order.' },
      { status: 400, code: 'PAYMENT_METHOD_UNAVAILABLE', when: 'Only cash on delivery is available right now.' },
      { status: 409, code: 'PRICE_CHANGED', when: 'Prices changed since your estimate. Please review the new total.' },
      { status: 409, code: 'VENDOR_UNAVAILABLE', when: 'This vendor is not taking orders right now.' },
      { status: 409, code: 'SLOT_FULL', when: 'That time slot is full. Please pick another.' },
      { status: 422, code: 'SLOT_UNAVAILABLE', when: 'That pickup time is not available.' },
      { status: 422, code: 'OUT_OF_SERVICE_AREA', when: 'This vendor does not serve your address.' },
      { status: 422, code: 'ITEM_UNAVAILABLE', when: 'Some items are no longer available from this vendor.' },
      { status: 422, code: 'IDEMPOTENCY_KEY_REUSED', when: 'This Idempotency-Key was already used for a different order.' },
      { status: 422, code: 'PROMO_NOT_FOUND', when: 'The promo code does not exist.' },
      { status: 422, code: 'PROMO_UNAVAILABLE', when: 'The promo code is inactive, expired, for another city, or belongs to another account.' },
      { status: 422, code: 'PROMO_MIN_ORDER', when: 'The order subtotal is below the promo code\'s minimum order.' },
      { status: 422, code: 'PROMO_USAGE_LIMIT', when: 'The promo code has reached its usage limit or you already used it.' },
      { status: 409, code: 'PROMO_CHANGED', when: 'The promo discount changed since your estimate. Review the new total and try again.' },
    ],
  },
  'GET /orders': {
    summary: 'My order history',
    who: ['CUSTOMER'],
    description: 'Newest first. Page with `meta.nextCursor`. Filter by `status`, `vendorId` and a placed-between date range.',
    params: { ...PAGING_PARAMS, status: { example: 'DELIVERED', description: 'PLACED, ACCEPTED, REJECTED, PICKED_UP, IN_PROCESS, READY, OUT_FOR_DELIVERY, DELIVERED or CANCELLED.' },
      vendorId: { example: ID.vendor },
      from: { example: '2026-10-01T00:00:00Z', description: 'Placed on or after (ISO 8601).' },
      to: { example: '2026-11-01T00:00:00Z', description: 'Placed before (ISO 8601).' },
      limit: { example: 20 },
    },
    response: { example: page([SAMPLE_ORDER_SUMMARY], null) },
  },
  'GET /orders/{id}': {
    summary: 'Order details',
    who: ['CUSTOMER'],
    description: 'Everything about one of your orders. Other people’s orders answer 404.',
    params: { id: { example: ID.order, description: 'Order id' } },
    response: { example: ok(SAMPLE_ORDER) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Order not found.' }],
  },
  'POST /orders/{id}/cancel': {
    summary: 'Cancel my order',
    who: ['CUSTOMER'],
    description: 'Allowed while the order is `PLACED` or `ACCEPTED` (before pickup). After pickup it can no longer be cancelled. Cancelling frees the time slot.',
    params: { id: { example: ID.order, description: 'Order id' } },
    requests: { default: { summary: 'With a reason (optional)', value: { reason: 'Plans changed' } } },
    response: { example: ok({ ...SAMPLE_ORDER, status: 'CANCELLED', cancelReason: 'Plans changed' }) },
    errors: [{ status: 409, code: 'ORDER_INVALID_TRANSITION', when: 'An order that is picked_up cannot become cancelled.' }],
  },
  'POST /orders/{id}/reorder': {
    summary: 'Order the same again',
    who: ['CUSTOMER'],
    description:
      'Refills your cart for that vendor from this order using **today’s** items and prices. The answer lists items that no longer exist (`unavailable`) and prices that changed (`priceChanges`). ' +
      'Then check out as usual with `POST /cart/estimate` and `POST /orders`.',
    params: { id: { example: ID.order, description: 'Order id' } },
    response: {
      example: ok({
        cart: SAMPLE_CART,
        unavailable: [{ name: 'Suit (2 piece)' }],
        priceChanges: [{ name: 'Shirt', oldUnitPrice: '100.00', newUnitPrice: '120.00' }],
      }),
    },
    errors: [{ status: 422, code: 'NOTHING_TO_REORDER', when: 'None of the items from this order are available any more.' }],
  },
  'GET /orders/{id}/timeline': {
    summary: 'Order status history',
    who: ['CUSTOMER', 'VENDOR_OWNER', 'VENDOR_STAFF', 'ADMIN'],
    description: 'Every status change with who made it (`CUSTOMER`, `VENDOR`, `RIDER`, `ADMIN` or `SYSTEM` for automatic ones such as a timeout). Also the polling fallback if live updates are unavailable.',
    params: { id: { example: ID.order, description: 'Order id' } },
    response: { example: ok(SAMPLE_TIMELINE) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Order not found.' }],
  },
  'GET /orders/{id}/events': {
    summary: 'Live order updates (server-sent events)',
    who: ['CUSTOMER', 'VENDOR_OWNER', 'VENDOR_STAFF', 'ADMIN'],
    description:
      'A `text/event-stream` that pushes every status change as it happens. **Swagger UI cannot display a live stream** — use a real client:\n\n' +
      '```js\n' +
      "import { fetchEventSource } from '@microsoft/fetch-event-source';\n" +
      "fetchEventSource(`/api/v1/orders/${id}/events`, {\n" +
      "  headers: { Authorization: `Bearer ${accessToken}` },\n" +
      '  onmessage(e) { if (e.event === "status") show(JSON.parse(e.data)); },\n' +
      '});\n' +
      '```\n\n' +
      '- Each `status` event has an `id`. After a dropped connection, reconnect with the `Last-Event-ID` header to receive what you missed.\n' +
      '- A fresh connection starts with the current status.\n' +
      '- A `ping` event arrives every 25 seconds to keep the connection open.\n' +
      '- The native `EventSource` cannot send an Authorization header; use a fetch-based client.\n' +
      '- If you cannot keep a stream open, poll `GET /orders/{id}` every 15–30 seconds.',
    params: { id: { example: ID.order, description: 'Order id' }, 'last-event-id': { example: '1042', description: 'The `id` of the last event you received.' } },
    response: {
      contentType: 'text/event-stream',
      description: 'Event stream',
      example: 'id: 1042\nevent: status\ndata: {"seq":1042,"orderId":"' + ID.order + '","from":"PLACED","to":"ACCEPTED","at":"2026-10-22T13:35:12.000Z","actor":"VENDOR"}\n\n',
    },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Order not found.' }],
  },
};
