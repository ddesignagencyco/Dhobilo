import { ID, PHONE } from '../samples';
import type { OperationDocs } from '../types';
import { ok, page } from './helpers';

const CUSTOMER = ['CUSTOMER'] as const;
const VENDOR = ['VENDOR_OWNER', 'VENDOR_STAFF'] as const;
const ADMIN = ['ADMIN'] as const;

const SAMPLE_RULE = {
  id: ID.commissionRule,
  scope: 'CATEGORY',
  vendorId: null,
  categoryId: 2,
  ratePct: '15.00',
  effectiveFrom: '2026-10-01T00:00:00.000Z',
  createdById: ID.user,
};

/** How the list shows a vendor's own rule: the vendor's name comes along, the category is empty. */
const LISTED_RULE = { ...SAMPLE_RULE, scope: 'VENDOR', vendorId: ID.vendor, categoryId: null, vendor: { businessName: 'Sparkle Laundry' }, category: null };

const SAMPLE_PAYOUT = {
  id: ID.payout,
  amount: '2500.00',
  method: 'BANK',
  accountRef: '••••4567',
  status: 'REQUESTED',
  requestedAt: '2026-10-25T09:00:00.000Z',
  processedAt: null,
  processedBy: null,
  txnRef: null,
  note: null,
};

const SAMPLE_EARNINGS = {
  range: 'week',
  from: '2026-10-19T19:00:00.000Z',
  to: '2026-10-26T10:00:00.000Z',
  totals: { orders: 12, gross: '14400.00', commission: '2160.00', net: '12240.00' },
  balance: { total: '18240.00', pending: '2500.00', available: '15740.00', awaitingCash: { orders: 2, amount: '612.00' } },
  orders: [
    {
      id: ID.order,
      orderNo: 'DHB-LHR-000123',
      deliveredAt: '2026-10-22T13:32:00.000Z',
      subtotal: '360.00',
      discount: '0.00',
      commissionRatePct: '15.00',
      commission: '54.00',
      net: '306.00',
    },
  ],
};

export const financeDocs: OperationDocs = {
  'POST /payments/initiate': {
    summary: 'Start or resume an online payment',
    tag: 'payments',
    who: [...CUSTOMER],
    description:
      'Creates a hosted-checkout session for one of your orders, or resumes the pending one. Send the customer to `redirectUrl` (or post `formFields` when present). Card, wallet and bank credentials are entered on the provider’s page and never reach this API. COD orders cannot use this endpoint. The order is cancelled automatically if the payment window closes.',
    requests: { default: { summary: 'Pay an order', value: { orderId: ID.order } } },
    response: {
      example: ok({
        paymentId: ID.payment,
        orderId: ID.order,
        gateway: 'jazzcash',
        gatewayRef: 'MOCK-JAZZCASH-7C2E1A9B4D6F8012',
        amount: '510.00',
        redirectUrl: 'https://app.dhoblio.pk/checkout/mock?gateway=jazzcash&ref=MOCK-JAZZCASH-7C2E1A9B4D6F8012&amount=510.00&order=DHB-LHR-000123',
        formFields: {},
        expiresAt: '2026-10-22T13:47:00.000Z',
        status: 'PENDING',
      }),
    },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'The order does not exist or is not yours.' },
      { status: 400, code: 'PAYMENT_METHOD_UNAVAILABLE', when: 'The order is paid in cash on delivery.' },
      { status: 409, code: 'PAYMENT_ALREADY_PAID', when: 'The order has already been paid.' },
      { status: 409, code: 'ORDER_NOT_PAYABLE', when: 'The order is no longer waiting for payment.' },
    ],
  },
  'POST /webhooks/{gateway}': {
    summary: 'Payment gateway callback',
    tag: 'webhooks',
    who: 'public',
    description:
      'Called by JazzCash, Easypaisa, PayFast (also `/webhooks/card`) or Raast. The provider’s signature is checked against the exact raw body before anything is queued. Repeating a notification is safe. A valid signature with an unknown reference is retried by the provider; stale payments are also reconciled by the worker.',
    params: { gateway: { example: 'jazzcash', description: '`jazzcash`, `easypaisa`, `payfast`, `card` or `raast`.' } },
    response: { example: ok({ received: true }) },
    errors: [
      { status: 400, code: 'VALIDATION_FAILED', when: 'The body is missing or malformed.' },
      { status: 401, code: 'UNAUTHENTICATED', when: 'The signature does not match.' },
      { status: 404, code: 'NOT_FOUND', when: 'The gateway name is not recognised.' },
    ],
  },
  'GET /vendor/earnings': {
    summary: 'My earnings and balance',
    tag: 'vendor-finance',
    who: [...VENDOR],
    description:
      'Delivered orders only, counted on the Pakistan business day. `range=day` is today, `week` is the last 7 days including today (default), and `month` is the current calendar month. `balance` comes from the ledger: `awaitingCash` is the share of delivered **cash** orders whose money the rider has not yet handed in (it becomes part of `total` the moment the admin records the deposit); `available` is what you can request after pending payouts.',
    params: { range: { example: 'week', description: '`day`, `week` or `month`.' } },
    response: { example: ok(SAMPLE_EARNINGS) },
    errors: [{ status: 403, code: 'VENDOR_NOT_ACTIVE', when: 'The vendor account is not approved.' }],
  },
  'GET /vendor/ledger': {
    summary: 'My ledger',
    tag: 'vendor-finance',
    who: [...VENDOR],
    description: 'Every signed money movement on your account, newest first: order earnings, commission, refunds and payouts. Debits are negative.',
    response: {
      example: ok([
        { id: ID.codCollection, orderId: ID.order, payoutId: null, type: 'ORDER_EARNING', amount: '306.00', note: 'Order earning', createdAt: '2026-10-22T13:32:00.000Z' },
        { id: ID.request, orderId: ID.order, payoutId: null, type: 'COMMISSION', amount: '-54.00', note: 'Platform commission', createdAt: '2026-10-22T13:32:00.000Z' },
        { id: ID.settlement, orderId: null, payoutId: ID.payout, type: 'PAYOUT', amount: '-2500.00', note: 'Payout', createdAt: '2026-10-25T09:05:00.000Z' },
      ]),
    },
  },
  'GET /vendor/payouts': {
    summary: 'My payout requests',
    tag: 'vendor-finance',
    who: [...VENDOR],
    description: 'Newest first. Only the last four digits of the account reference are returned.',
    response: { example: ok([SAMPLE_PAYOUT, { ...SAMPLE_PAYOUT, id: ID.request, amount: '1500.00', status: 'PAID', processedAt: '2026-10-20T11:00:00.000Z', txnRef: 'BANK-889122' }]) },
  },
  'POST /vendor/payouts': {
    summary: 'Request a payout',
    tag: 'vendor-finance',
    who: ['VENDOR_OWNER'],
    description: 'Owner only. The amount cannot exceed the available ledger balance; the check runs under a lock so simultaneous requests cannot overspend. An admin approves and marks it paid.',
    requests: {
      default: { summary: 'Bank transfer', value: { amount: '2500.00', method: 'BANK', accountRef: 'PK36SCBL0000001123456702', note: 'Weekly withdrawal' } },
    },
    response: { example: ok(SAMPLE_PAYOUT) },
    errors: [
      { status: 409, code: 'PAYOUT_EXCEEDS_BALANCE', when: 'The amount is more than the available balance.' },
      { status: 403, code: 'VENDOR_NOT_ACTIVE', when: 'The vendor account is not approved.' },
    ],
  },
  'GET /admin/commission-rules': {
    summary: 'List commission rules',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Rules are scoped GLOBAL, CATEGORY or VENDOR; the most specific rule in force wins. Filter by scope, vendor or category.',
    params: {
      scope: { example: 'CATEGORY', description: 'GLOBAL, CATEGORY or VENDOR.' },
      vendorId: { example: ID.vendor, description: 'Only rules for this vendor.' },
      categoryId: { example: 2, description: 'Only rules for this category.' },
    },
    response: { example: ok([LISTED_RULE]) },
  },
  'POST /admin/commission-rules': {
    summary: 'Create a commission rule',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'A new rule applies from `effectiveFrom` (default now). Existing orders keep the rate they were priced with. GLOBAL rules take no vendor/category; the other scopes require exactly one.',
    requests: {
      global: { summary: 'Global rate', value: { scope: 'GLOBAL', ratePct: 12 } },
      category: { summary: 'Category rate', value: { scope: 'CATEGORY', categoryId: 2, ratePct: 15, effectiveFrom: '2026-11-01T00:00:00.000Z' } },
      vendor: { summary: 'Vendor rate', value: { scope: 'VENDOR', vendorId: ID.vendor, ratePct: 10 } },
    },
    response: { example: ok(SAMPLE_RULE) },
    errors: [
      { status: 400, code: 'VALIDATION_FAILED', when: 'The scope and references do not match.' },
      { status: 404, code: 'NOT_FOUND', when: 'The vendor or category does not exist.' },
    ],
  },
  'PATCH /admin/commission-rules/{id}': {
    summary: 'Change a commission rule',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Changes the rate or the effective date. Historical orders are unaffected; commission is fixed when an order is placed.',
    params: { id: { example: ID.commissionRule, description: 'Commission rule id' } },
    requests: { default: { summary: 'Lower the rate', value: { ratePct: 12.5 } } },
    response: { example: ok({ ...SAMPLE_RULE, ratePct: '12.50' }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Commission rule not found.' }],
  },
  'DELETE /admin/commission-rules/{id}': {
    summary: 'Delete a commission rule',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Removes the rule. Orders already placed keep their stored commission; remove only rules that should never apply again.',
    params: { id: { example: ID.commissionRule, description: 'Commission rule id' } },
    response: { status: 204 },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Commission rule not found.' }],
  },
  'GET /admin/payouts': {
    summary: 'Payout queue',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Newest first, page with `meta.nextCursor`. Filter by status or vendor.',
    params: {
      status: { example: 'REQUESTED', description: 'REQUESTED, APPROVED, PAID or REJECTED.' },
      vendorId: { example: ID.vendor, description: 'Only this vendor.' },
      limit: { example: 20, description: 'Page size, 1 to 50.' },
      cursor: { description: 'Pass `meta.nextCursor` from the previous page.' },
    },
    response: { example: page([{ ...SAMPLE_PAYOUT, vendor: { businessName: 'Sparkle Laundry' } }]) },
  },
  'POST /admin/payouts/{id}/approve': {
    summary: 'Approve a payout',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'REQUESTED → APPROVED. Approval does not move money; record the actual transfer with `/pay`.',
    params: { id: { example: ID.payout, description: 'Payout id' } },
    response: { example: ok({ ...SAMPLE_PAYOUT, status: 'APPROVED' }) },
    errors: [{ status: 409, code: 'PAYOUT_INVALID_STATE', when: 'The payout has already moved on.' }],
  },
  'POST /admin/payouts/{id}/reject': {
    summary: 'Reject a payout',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'REQUESTED or APPROVED → REJECTED. The reason is stored on the payout; the reserved amount becomes available again.',
    params: { id: { example: ID.payout, description: 'Payout id' } },
    requests: { default: { summary: 'Wrong account', value: { reason: 'The IBAN does not belong to this business.' } } },
    response: { example: ok({ ...SAMPLE_PAYOUT, status: 'REJECTED', processedAt: '2026-10-25T10:00:00.000Z', note: 'The IBAN does not belong to this business.' }) },
    errors: [{ status: 409, code: 'PAYOUT_INVALID_STATE', when: 'The payout has already moved on.' }],
  },
  'POST /admin/payouts/{id}/pay': {
    summary: 'Mark a payout paid',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'APPROVED → PAID. Records the bank/wallet reference and debits the vendor ledger in the same transaction. This does not initiate a transfer by itself.',
    params: { id: { example: ID.payout, description: 'Payout id' } },
    requests: { default: { summary: 'Bank transfer reference', value: { txnRef: 'BANK-889122' } } },
    response: { example: ok({ ...SAMPLE_PAYOUT, status: 'PAID', processedAt: '2026-10-25T11:00:00.000Z', txnRef: 'BANK-889122' }) },
    errors: [{ status: 409, code: 'PAYOUT_INVALID_STATE', when: 'The payout is not approved.' }],
  },
  'GET /admin/cod/balances': {
    summary: 'Rider cash in hand',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Riders with COD collections not yet settled, largest balance first. Search by rider name or phone.',
    params: { q: { example: 'Bilal', description: 'Rider name or phone contains.' } },
    response: {
      example: ok([{ riderId: ID.staff, name: 'Bilal Ahmed', phone: PHONE.e164, orders: 6, amount: '8640.00' }]),
    },
  },
  'GET /admin/cod/collections': {
    summary: 'COD collections',
    tag: 'admin-finance',
    who: [...ADMIN],
    description: 'Every cash collection, newest first. Filter by rider and whether it has been settled.',
    params: {
      riderId: { example: ID.staff, description: 'Only this rider.' },
      settled: { example: false, description: '`true` for settled, `false` for still in hand.' },
      limit: { example: 50, description: 'Page size, 1 to 100.' },
      cursor: { description: 'Pass `meta.nextCursor` from the previous page.' },
    },
    response: {
      example: page([
        {
          id: ID.codCollection,
          orderId: ID.order,
          orderNo: 'DHB-LHR-000123',
          riderId: ID.staff,
          riderName: 'Bilal Ahmed',
          riderPhone: PHONE.e164,
          amount: '510.00',
          collectedAt: '2026-10-22T13:32:00.000Z',
          settlementId: null,
        },
      ]),
    },
  },
  'POST /admin/cod/settlements': {
    summary: 'Settle a rider’s cash',
    tag: 'admin-finance',
    who: [...ADMIN],
    description:
      'The rider hands in cash. Takes every unsettled collection for the rider and links it to one settlement batch. **In the same step each of those orders’ vendors is credited** (earning and commission posted to their ledger) and the order becomes fully PAID: a cash order earns the vendor nothing until its cash reaches us. Fails when there is nothing to settle.',
    requests: { default: { summary: 'Cash handed over', value: { riderId: ID.staff, reference: 'DEP-20261025-04' } } },
    response: {
      example: ok({ id: ID.settlement, riderId: ID.staff, amount: '8640.00', collections: 6, ordersCredited: 6, reference: 'DEP-20261025-04', settledAt: '2026-10-25T12:00:00.000Z' }),
    },
    errors: [{ status: 409, code: 'COD_NOTHING_TO_SETTLE', when: 'The rider has no unsettled cash.' }],
  },
  'GET /rider/cod': {
    summary: 'My COD cash',
    tag: 'rider',
    who: ['RIDER'],
    description: 'Cash you have collected on cash-on-delivery orders. `cashInHand` is what you still have to hand over; settled collections stay in the list for history.',
    response: {
      example: ok({
        cashInHand: '8640.00',
        unsettledOrders: 6,
        collections: [
          {
            id: ID.codCollection,
            orderId: ID.order,
            orderNo: 'DHB-LHR-000123',
            amount: '510.00',
            collectedAt: '2026-10-22T13:32:00.000Z',
            settled: false,
            settlementId: null,
          },
        ],
      }),
    },
  },
};
