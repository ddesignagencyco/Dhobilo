import { ID } from '../samples';
import type { OperationDocs } from '../types';
import { ok, page, PAGING_PARAMS } from './helpers';

const ADMIN = ['ADMIN'] as const;
const OWNER = ['VENDOR_OWNER'] as const;

const PAYMENT_ID = '4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const PAYOUT_ID = '5b2c3d4e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const RULE_ID = '6c3d4e5f-7a8b-4c9d-8e1f-2a3b4c5d6e7f';
const SETTLEMENT_ID = '7d4e5f6a-8b9c-4d0e-9f2a-3b4c5d6e7f80';
const COLLECTION_ID = '8e5f6a7b-9c0d-4e1f-8a3b-4c5d6e7f8091';
const RIDER_ID = '1d7e3b5a-6c2f-4a8e-9b10-4e5f6a7b8c91';
const REF = 'MOCKPAY-3F9A1C2B7D';

const CHECKOUT = { redirectUrl: `http://localhost:4000/api/v1/dev/mock-gateway/${REF}`, method: 'GET' };

/** One payment attempt, as the customer's app sees it. */
export const PAYMENT_VIEW = {
  id: PAYMENT_ID,
  method: 'CARD',
  status: 'PENDING',
  attempt: 1,
  amount: '510.00',
  currency: 'PKR',
  expiresAt: '2026-10-23T05:15:00.000Z',
  failureReason: null,
  checkout: CHECKOUT,
};

const ADMIN_PAYMENT = {
  id: PAYMENT_ID,
  method: 'CARD',
  gateway: 'mock',
  gatewayRef: REF,
  status: 'PAID',
  amount: '510.00',
  attempt: 1,
  failureReason: null,
  paidAt: '2026-10-23T05:03:10.000Z',
  refundedAmount: '0.00',
  refundRef: null,
  refundedAt: null,
  expiresAt: '2026-10-23T05:15:00.000Z',
  createdAt: '2026-10-23T05:00:00.000Z',
  order: { id: ID.order, orderNo: 'DHB-LHR-000123', status: 'PLACED', paymentStatus: 'PAID', customer: { id: ID.user, name: 'Ayesha Khan', phone: '+923001234567' } },
  currency: 'PKR',
};

const PAYOUT = {
  id: PAYOUT_ID,
  vendorId: ID.vendor,
  amount: '2000.00',
  method: 'BANK',
  accountMask: 'PK36****************1234',
  status: 'REQUESTED',
  requestedAt: '2026-10-23T09:00:00.000Z',
  processedAt: null,
  processedBy: null,
  txnRef: null,
  note: null,
  currency: 'PKR',
};

const BALANCE = { currency: 'PKR', balance: '3400.00', available: '2400.00', reservedForPayouts: '1000.00', paidOut: '5000.00', pendingCod: '340.00', pendingCodOrders: 2 };
const RULE = { id: RULE_ID, scope: 'VENDOR', vendorId: ID.vendor, categoryId: null, ratePct: '12.50', effectiveFrom: '2026-11-01T00:00:00.000Z', createdById: ID.user };

export const paymentDocs: OperationDocs = {
  'GET /payments/methods': {
    summary: 'Ways to pay',
    tag: 'payments',
    who: 'public',
    description: 'The payment methods that can be used right now, with a short explanation for each. `fee` is always `0.00`: we do not charge for paying. Cash on delivery is always there; online methods appear when their gateway is switched on.',
    response: {
      example: ok([
        { method: 'COD', label: 'Cash on delivery', instructions: 'Pay the rider in cash when your clothes are delivered. Keep the exact amount ready.', online: false, fee: '0.00', currency: 'PKR' },
        { method: 'CARD', label: 'Debit / credit card', instructions: 'You will be taken to a secure page to enter your card. We never see your card number.', online: true, fee: '0.00', currency: 'PKR' },
      ]),
    },
  },
  'POST /payments/webhooks/{gateway}': {
    summary: 'Payment result from a gateway',
    tag: 'payments',
    who: 'public',
    description:
      'Called **by the payment gateway**, not by an app. No login: each call is checked against its signature on the **raw request body**. The call is stored and answered at once; the result is applied by the worker a moment later.\n\n' +
      'Sending the same notification again is safe (`duplicate: true`, nothing changes). A late "failed" never undoes a payment that succeeded. A payment for the wrong amount is not believed and ops is told. A payment that arrives for an order that was already cancelled is refunded automatically.',
    params: { gateway: { example: 'mock', description: 'The gateway’s code: `mock` (development) or `jazzcash`.' } },
    requests: {
      default: { summary: 'Fake gateway: payment succeeded', value: { eventId: 'evt-20261023-0001', gatewayRef: REF, status: 'PAID', amount: '510.00' } },
      failed: { summary: 'Fake gateway: payment declined', value: { eventId: 'evt-20261023-0002', gatewayRef: REF, status: 'FAILED', reason: 'Declined' } },
    },
    response: { description: 'Received', example: ok({ duplicate: false }) },
    errors: [
      { status: 401, code: 'UNAUTHENTICATED', when: 'Invalid notification signature.' },
      { status: 404, code: 'NOT_FOUND', when: 'Unknown payment gateway.' },
    ],
  },
  'GET /payments/return/{gateway}': {
    summary: 'Back from the gateway (browser)',
    tag: 'payments',
    who: 'public',
    description: 'Where the gateway sends the customer’s browser after paying. It only **forwards to the order page** (a small page that moves the browser on). Whether the payment worked is decided by the signed notification, never by this visit.',
    params: { gateway: { example: 'mock', description: 'The gateway’s code.' }, order: { example: ID.order, description: 'The order the customer was paying for.' } },
    response: { description: 'A page that forwards the browser to the order page', contentType: 'text/html', example: '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=http://localhost:3000/orders/9c4e6a52-1b7d-4e3a-8f2c-5d9a0b3e7c21?payment=returned"></head><body>Returning to Dhoblio…</body></html>' },
  },
  'POST /payments/return/{gateway}': {
    summary: 'Back from the gateway (form post)',
    tag: 'payments',
    who: 'public',
    description: 'The same as the GET version, for gateways that post a form back to the customer’s browser.',
    params: { gateway: { example: 'jazzcash', description: 'The gateway’s code.' }, order: { example: ID.order, description: 'The order the customer was paying for.' } },
    response: { description: 'A page that forwards the browser to the order page', contentType: 'text/html', example: '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=http://localhost:3000/orders/9c4e6a52-1b7d-4e3a-8f2c-5d9a0b3e7c21?payment=returned"></head><body>Returning to Dhoblio…</body></html>' },
  },
  'GET /dev/mock-gateway/{ref}': {
    summary: 'Fake payment page',
    tag: 'payments',
    who: 'public',
    description: '**Development only** (404 unless the fake gateway is switched on). What the fake hosted page would show for a pending payment, with links to pay or decline. Use it to try the whole payment flow from this page.',
    params: { ref: { example: REF, description: 'The `gatewayRef` from the order’s payment.' } },
    response: { example: ok({ gatewayRef: REF, orderNo: 'DHB-LHR-000123', amount: '510.00', currency: 'PKR', status: 'PENDING', payUrl: `http://localhost:4000/api/v1/dev/mock-gateway/${REF}/pay`, declineUrl: `http://localhost:4000/api/v1/dev/mock-gateway/${REF}/decline` }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'No such payment, or the fake gateway is off.' }],
  },
  'POST /dev/mock-gateway/{ref}/pay': {
    summary: 'Fake payment: pay',
    tag: 'payments',
    who: 'public',
    description: '**Development only.** Plays the customer paying on the hosted page: the fake gateway signs a notification and sends it to us, exactly like a real one. A few seconds later the order is paid and the vendor sees it.',
    params: { ref: { example: REF, description: 'The `gatewayRef` from the order’s payment.' } },
    response: { example: ok({ gatewayRef: REF, outcome: 'PAID', notified: true }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'No such payment, or the fake gateway is off.' }],
  },
  'POST /dev/mock-gateway/{ref}/decline': {
    summary: 'Fake payment: decline',
    tag: 'payments',
    who: 'public',
    description: '**Development only.** Plays the customer’s card being declined. The attempt fails and the customer can try again with **Pay now / try again**.',
    params: { ref: { example: REF, description: 'The `gatewayRef` from the order’s payment.' } },
    response: { example: ok({ gatewayRef: REF, outcome: 'FAILED', notified: true }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'No such payment, or the fake gateway is off.' }],
  },
  'GET /orders/{id}/payment': {
    summary: 'How my order is being paid',
    tag: 'orders',
    who: ['CUSTOMER'],
    description: 'Every payment attempt for the order, newest first. A **pending** online payment includes its `checkout` (where to send the customer); finished attempts do not. A payment succeeds only when the gateway’s signed notification says so.',
    params: { id: { example: ID.order, description: 'Order id' } },
    response: { example: ok([PAYMENT_VIEW]) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Order not found (other customers’ orders are never visible).' }],
  },
  'POST /orders/{id}/pay': {
    summary: 'Pay now / try again',
    tag: 'orders',
    who: ['CUSTOMER'],
    description: 'For an **online order that is still unpaid** (placed but not paid, or the last attempt failed). Starts a fresh attempt with a new checkout and a new payment window; unfinished earlier attempts are dropped. Optionally pay with a different online method. At most 5 attempts per order; an order unpaid when the window ends is cancelled.',
    params: { id: { example: ID.order, description: 'Order id' } },
    requests: { default: { summary: 'Try again, same method', value: {} }, other: { summary: 'Switch to Raast', value: { method: 'RAAST' } } },
    response: { example: ok({ ...PAYMENT_VIEW, attempt: 2 }) },
    errors: [
      { status: 400, code: 'PAYMENT_METHOD_UNAVAILABLE', when: 'Choose an online payment method.' },
      { status: 404, code: 'NOT_FOUND', when: 'Order not found.' },
      { status: 409, code: 'PAYMENT_NOT_NEEDED', when: 'This order does not need a payment right now (already paid, cash, or no longer open).' },
      { status: 409, code: 'PAYMENT_ATTEMPTS_EXHAUSTED', when: 'Too many payment attempts. Please place the order again.' },
      { status: 502, code: 'PAYMENT_GATEWAY_ERROR', when: 'We could not start the payment. Please try again.' },
    ],
  },
  'GET /admin/payments': {
    summary: 'Payments',
    tag: 'admin-payments',
    who: [...ADMIN],
    description: 'Newest first. Filter by status, method or (part of) the order number. Page with `meta.nextCursor`.',
    params: { ...PAGING_PARAMS, status: { example: 'PAID' }, method: { example: 'CARD' }, orderNo: { example: 'LHR-000123' } },
    response: { example: page([ADMIN_PAYMENT], null) },
  },
  'GET /admin/payments/{id}': {
    summary: 'One payment',
    tag: 'admin-payments',
    who: [...ADMIN],
    description: 'The payment with every notification the gateway sent about it (stored without signatures or secrets), and whether each was applied.',
    params: { id: { example: PAYMENT_ID, description: 'Payment id' } },
    response: { example: ok({ ...ADMIN_PAYMENT, events: [{ id: ID.request, eventId: 'evt-20261023-0001', status: 'PAID', amount: '510.00', note: null, processedAt: '2026-10-23T05:03:11.000Z', createdAt: '2026-10-23T05:03:10.000Z' }] }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Payment not found.' }],
  },
  'POST /admin/payments/{id}/refund': {
    summary: 'Refund a payment',
    tag: 'admin-payments',
    who: [...ADMIN],
    description: 'Refunds a **paid** online payment in full. If the vendor was already credited for the order, their share is taken back in the ledger. Safe to repeat: a refunded payment is not refunded twice. Audited.',
    params: { id: { example: PAYMENT_ID, description: 'Payment id' } },
    requests: { default: { summary: 'Upheld complaint', value: { reason: 'Clothes were damaged' } } },
    response: { example: ok({ ...ADMIN_PAYMENT, status: 'REFUNDED', refundedAmount: '510.00', refundRef: 'MOCKREF-8A2C1F90D3', refundedAt: '2026-10-24T09:00:00.000Z', events: [{ id: ID.request, eventId: 'evt-20261023-0001', status: 'PAID', amount: '510.00', note: null, processedAt: '2026-10-23T05:03:11.000Z', createdAt: '2026-10-23T05:03:10.000Z' }] }) },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'Payment not found.' },
      { status: 409, code: 'PAYMENT_NOT_REFUNDABLE', when: 'A pending payment cannot be refunded (only paid online payments can).' },
      { status: 501, code: 'GATEWAY_UNSUPPORTED', when: 'This gateway cannot refund automatically (JazzCash: use the JazzCash portal).' },
    ],
  },
};

export const financeDocs: OperationDocs = {
  'GET /vendor/earnings': {
    summary: 'My earnings for a period',
    tag: 'vendor-finance',
    who: [...OWNER],
    description:
      'Totals for a day, week (Monday–Sunday) or month in your shop’s city time, counted on the day the money became **payable** (online orders: when delivered; cash orders: when the rider’s cash reached us).\n\n' +
      '`gross` is the order value before commission, `commission` is our cut, `refunds` is money taken back, `net` = gross − commission − refunds + adjustments. `days` has a row per day, ready for a chart.',
    params: { period: { example: 'week', description: '`day`, `week` or `month`.' }, date: { example: '2026-10-23', description: 'Any day inside the period (YYYY-MM-DD). Defaults to today.' } },
    response: {
      example: ok({
        period: 'week',
        from: '2026-10-19',
        to: '2026-10-25',
        currency: 'PKR',
        gross: '2000.00',
        commission: '300.00',
        refunds: '0.00',
        adjustments: '0.00',
        net: '1700.00',
        orders: 10,
        days: [{ date: '2026-10-23', gross: '400.00', commission: '60.00', refunds: '0.00', adjustments: '0.00', net: '340.00', orders: 2 }],
      }),
    },
  },
  'GET /vendor/earnings/orders': {
    summary: 'Earnings, order by order',
    tag: 'vendor-finance',
    who: [...OWNER],
    description: 'One line per order that earned money in the range (default: the last 30 days), newest first. `refunded` is true when the customer got their money back and your share was taken back. Page with `meta.nextCursor`.',
    params: { ...PAGING_PARAMS, from: { example: '2026-10-01', description: 'First day, YYYY-MM-DD.' }, to: { example: '2026-10-31', description: 'Last day, YYYY-MM-DD.' } },
    response: { example: page([{ orderId: ID.order, orderNo: 'DHB-LHR-000123', earnedAt: '2026-10-23T11:00:00.000Z', deliveredAt: '2026-10-23T10:40:00.000Z', paymentMethod: 'CARD', gross: '360.00', commissionRatePct: '15.00', commission: '54.00', net: '306.00', refunded: false }], null) },
    errors: [{ status: 400, code: 'INVALID_RANGE', when: '`from` must not be after `to`.' }],
  },
  'GET /vendor/balance': {
    summary: 'My balance',
    tag: 'vendor-finance',
    who: [...OWNER],
    description: '`balance` is everything earned minus everything taken or paid out. `available` is what you can still ask for (balance minus requests already open). `pendingCod` is the share of delivered **cash** orders still waiting for the rider’s cash to reach us; it becomes payable when it does.',
    response: { example: ok(BALANCE) },
  },
  'POST /vendor/payouts': {
    summary: 'Ask for a payout',
    tag: 'vendor-finance',
    who: [...OWNER],
    description:
      'Withdraw part of your available balance to a bank account (IBAN) or mobile wallet. The amount is **set aside straight away**; an admin approves it and sends the money, and only then does your balance go down. Shop must be approved (not suspended).\n\n' +
      'Smallest payout is Rs 500. The account is stored encrypted and always shown masked.',
    requests: {
      default: { summary: 'Bank transfer', value: { amount: '2000.00', method: 'BANK', account: 'PK36HABB0012345678901234' } },
      wallet: { summary: 'JazzCash / Easypaisa wallet', value: { amount: '1000', method: 'WALLET', account: '03001234567' } },
    },
    response: { status: 201, description: 'Request received', example: ok(PAYOUT) },
    errors: [
      { status: 400, code: 'PAYOUT_BELOW_MINIMUM', when: 'The smallest payout is Rs 500.' },
      { status: 400, code: 'INVALID_ACCOUNT', when: 'Enter a valid Pakistani IBAN, or the mobile number of your wallet.' },
      { status: 403, code: 'VENDOR_NOT_ACTIVE', when: 'A suspended vendor cannot ask for payouts.' },
      { status: 409, code: 'INSUFFICIENT_BALANCE', when: 'You cannot withdraw more than your available balance.' },
    ],
  },
  'GET /vendor/payouts': {
    summary: 'My payout requests',
    tag: 'vendor-finance',
    who: [...OWNER],
    description: 'Newest first. `status` moves REQUESTED → APPROVED → PAID, or → REJECTED (with the reason in `note`).',
    params: { ...PAGING_PARAMS },
    response: { example: page([PAYOUT], null) },
  },
  'GET /rider/cod': {
    summary: 'Cash I am holding',
    tag: 'rider',
    who: ['RIDER'],
    description: 'Cash collected from customers on cash-on-delivery orders that has not been handed in yet, and your most recent hand-ins. Completing a cash delivery counts as collecting the money.',
    response: {
      example: ok({
        currency: 'PKR',
        outstanding: '700.00',
        outstandingCount: 2,
        collections: [{ id: COLLECTION_ID, orderNo: 'DHB-LHR-000123', amount: '350.00', collectedAt: '2026-10-26T06:10:00.000Z' }],
        recentSettlements: [{ id: SETTLEMENT_ID, amount: '1050.00', reference: 'DEP-0042', settledAt: '2026-10-25T17:00:00.000Z' }],
      }),
    },
  },
  'GET /admin/commission-rules': {
    summary: 'Commission rules',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Every rule, grouped by scope with the newest start first. `current` marks the rule in force right now for its target; `startsInFuture` marks one not yet started. The rate for an order is chosen when it is placed: **vendor** rule, else **category** rule, else **global**, newest started rule first.',
    params: { scope: { example: 'VENDOR', description: '`GLOBAL`, `CATEGORY` or `VENDOR`.' }, vendorId: { example: ID.vendor, description: 'Only this vendor’s rules.' } },
    response: { example: ok([{ ...RULE, current: false, startsInFuture: true }]) },
  },
  'POST /admin/commission-rules': {
    summary: 'Add a commission rule',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Rules are never edited: a change is a **new rule with a start time**. Orders placed from then on use it; orders already placed keep the rate they were placed with. A `VENDOR` rule needs `vendorId`, a `CATEGORY` rule needs `categoryId`, a `GLOBAL` rule neither. The rate is 0–50 %. The start cannot be in the past. Audited.',
    requests: {
      default: { summary: 'Vendor rate from 1 November', value: { scope: 'VENDOR', vendorId: ID.vendor, ratePct: 12.5, effectiveFrom: '2026-11-01T00:00:00.000Z' } },
      global: { summary: 'New global rate, from now', value: { scope: 'GLOBAL', ratePct: 15 } },
    },
    response: { status: 201, description: 'Rule added', example: ok({ ...RULE, startsInFuture: true }) },
    errors: [
      { status: 400, code: 'INVALID_COMMISSION_RULE', when: 'A vendor rule needs a vendorId (and no category).' },
      { status: 400, code: 'EFFECTIVE_DATE_IN_PAST', when: 'The start time cannot be in the past: orders already placed keep their rate.' },
      { status: 404, code: 'NOT_FOUND', when: 'Vendor not found.' },
      { status: 409, code: 'COMMISSION_RULE_EXISTS', when: 'There is already a rule for this target starting at that time.' },
    ],
  },
  'DELETE /admin/commission-rules/{id}': {
    summary: 'Remove a future rule',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Only a rule that has **not started yet** can be removed. A rule that has started is history; add a newer rule instead. Audited.',
    params: { id: { example: RULE_ID, description: 'Commission rule id' } },
    response: { status: 204, description: 'Removed' },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'Commission rule not found.' },
      { status: 409, code: 'COMMISSION_RULE_ACTIVE', when: 'A rule that has already started cannot be removed. Add a newer rule instead.' },
    ],
  },
  'GET /admin/cod/riders': {
    summary: 'Riders holding cash',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Riders who have collected customers’ cash and not handed it in, biggest amount first.',
    response: { example: ok([{ riderId: RIDER_ID, name: 'Bilal Ahmed', phone: '+923001112233', cityId: 1, outstanding: '1050.00', collections: 3, oldestCollectedAt: '2026-10-24T08:00:00.000Z' }]) },
  },
  'GET /admin/cod/riders/{id}/collections': {
    summary: 'A rider’s unsettled cash',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'The collections that make up what the rider owes, oldest first. Use their ids to settle only some of them when a rider hands in less than everything.',
    params: { id: { example: RIDER_ID, description: 'Rider id' } },
    response: { example: ok([{ id: COLLECTION_ID, amount: '350.00', collectedAt: '2026-10-26T06:10:00.000Z', order: { id: ID.order, orderNo: 'DHB-LHR-000123', vendor: 'Sparkle Laundry' } }]) },
  },
  'POST /admin/cod/settlements': {
    summary: 'Record a rider’s cash deposit',
    tag: 'admin-finance',
    who: [...ADMIN],
    description:
      'The rider hands in cash. `amount` must equal the collections being settled **to the rupee** (all of the rider’s unsettled cash, or only the `collectionIds` you list). ' +
      'In the same step each order’s vendor is credited (earning and commission posted to their ledger) and the order becomes fully **PAID**. Two admins settling the same cash at once cannot both succeed. Audited.',
    requests: {
      default: { summary: 'Everything the rider owes', value: { riderId: RIDER_ID, amount: '1050.00', reference: 'DEP-0042' } },
      some: { summary: 'Only some collections', value: { riderId: RIDER_ID, amount: '350.00', collectionIds: [COLLECTION_ID] } },
    },
    response: { status: 201, description: 'Settled', example: ok({ id: SETTLEMENT_ID, riderId: RIDER_ID, amount: '1050.00', reference: 'DEP-0042', settledAt: '2026-10-25T17:00:00.000Z', collections: 3, vendorsCredited: 3 }) },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'Rider not found.' },
      { status: 409, code: 'COD_AMOUNT_MISMATCH', when: 'The amount does not match the collections being settled. (`details.expected` has the right amount.)' },
      { status: 409, code: 'COD_COLLECTION_UNAVAILABLE', when: 'Some of those collections are unknown, belong to another rider, or are already settled.' },
      { status: 409, code: 'COD_NOTHING_TO_SETTLE', when: 'This rider has no cash waiting to be settled.' },
    ],
  },
  'GET /admin/cod/settlements': {
    summary: 'Cash deposits',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Recorded deposits, newest first. Page with `meta.nextCursor`.',
    params: { ...PAGING_PARAMS, riderId: { example: RIDER_ID, description: 'Only this rider’s deposits.' } },
    response: { example: page([{ id: SETTLEMENT_ID, riderId: RIDER_ID, amount: '1050.00', reference: 'DEP-0042', settledAt: '2026-10-25T17:00:00.000Z', settledBy: ID.user, riderName: 'Bilal Ahmed', collections: 3 }], null) },
  },
  'GET /admin/payouts': {
    summary: 'Payout requests',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Newest first; try `status=REQUESTED` for the queue. The account is masked here; the full number is on the detail.',
    params: { ...PAGING_PARAMS, status: { example: 'REQUESTED' }, vendorId: { example: ID.vendor } },
    response: { example: page([{ ...PAYOUT, vendorName: 'Sparkle Laundry' }], null) },
  },
  'GET /admin/payouts/{id}': {
    summary: 'One payout, with the account to pay',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Includes the vendor’s **real account number**, decrypted for you to send the money. **Every view is written to the audit log.**',
    params: { id: { example: PAYOUT_ID, description: 'Payout id' } },
    response: { example: ok({ ...PAYOUT, vendorName: 'Sparkle Laundry', account: 'PK36HABB0012345678901234' }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Payout not found.' }],
  },
  'POST /admin/payouts/{id}/approve': {
    summary: 'Approve a payout',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Agree to pay it. The amount stays set aside. Next: send the money, then **Mark a payout as paid**.',
    params: { id: { example: PAYOUT_ID, description: 'Payout id' } },
    response: { example: ok({ ...PAYOUT, status: 'APPROVED', processedBy: ID.user }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Payout not found.' }, { status: 409, code: 'PAYOUT_INVALID_TRANSITION', when: 'A approved payout cannot become approved.' }],
  },
  'POST /admin/payouts/{id}/pay': {
    summary: 'Mark a payout as paid',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'You have sent the money. Records the transfer reference and **debits the vendor’s ledger**; the vendor is told by SMS. The balance is checked again first. Cannot be done twice.',
    params: { id: { example: PAYOUT_ID, description: 'Payout id' } },
    requests: { default: { summary: 'Bank transfer sent', value: { txnRef: 'TXN-20261023-77', note: 'Sent via 1LINK' } } },
    response: { example: ok({ ...PAYOUT, status: 'PAID', processedAt: '2026-10-23T12:00:00.000Z', processedBy: ID.user, txnRef: 'TXN-20261023-77', note: 'Sent via 1LINK' }) },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'Payout not found.' },
      { status: 409, code: 'PAYOUT_INVALID_TRANSITION', when: 'A requested payout cannot be paid (it must be approved first).' },
      { status: 409, code: 'INSUFFICIENT_BALANCE', when: 'The vendor’s balance no longer covers this payout.' },
    ],
  },
  'POST /admin/payouts/{id}/reject': {
    summary: 'Reject a payout',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Releases the set-aside amount back to the vendor’s available balance. A reason is required and is sent to the vendor.',
    params: { id: { example: PAYOUT_ID, description: 'Payout id' } },
    requests: { default: { summary: 'Details do not match', value: { reason: 'Account details do not match your registration' } } },
    response: { example: ok({ ...PAYOUT, status: 'REJECTED', processedAt: '2026-10-23T12:00:00.000Z', processedBy: ID.user, note: 'Account details do not match your registration' }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Payout not found.' }, { status: 409, code: 'PAYOUT_INVALID_TRANSITION', when: 'A paid payout cannot become rejected.' }],
  },
  'GET /admin/vendors/{id}/ledger': {
    summary: 'A vendor’s ledger',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Every entry, newest first, with the vendor’s balance in `meta.balance`. Entries are never edited: a correction is a new `ADJUSTMENT`.',
    params: { ...PAGING_PARAMS, id: { example: ID.vendor, description: 'Vendor id' } },
    response: {
      example: {
        data: [{ id: ID.request, type: 'PAYOUT', amount: '-2000.00', note: 'Payout TXN-20261023-77', orderId: null, payoutId: PAYOUT_ID, createdAt: '2026-10-23T12:00:00.000Z' }],
        meta: { nextCursor: null, balance: BALANCE },
      },
    },
  },
  'POST /admin/ledger/adjustments': {
    summary: 'Correct a vendor’s ledger',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Adds a signed, explained entry: positive credits the vendor, negative debits them. Use it for things the system cannot know (a courier delivered a cash order, a chargeback). Audited.',
    requests: { default: { summary: 'Courier cash reconciled', value: { vendorId: ID.vendor, amount: 306, note: 'Cash order DHB-LHR-000123 delivered by courier, cash received' } }, debit: { summary: 'Deduction', value: { vendorId: ID.vendor, amount: -400, note: 'Chargeback on order DHB-LHR-000120' } } },
    response: { status: 201, description: 'Entry added', example: ok({ id: ID.request, vendorId: ID.vendor, type: 'ADJUSTMENT', amount: '306.00', note: 'Cash order DHB-LHR-000123 delivered by courier, cash received', createdAt: '2026-10-23T12:00:00.000Z' }) },
    errors: [{ status: 400, code: 'INVALID_ADJUSTMENT', when: 'An adjustment cannot be zero.' }, { status: 404, code: 'NOT_FOUND', when: 'Vendor not found.' }],
  },
};
