import { ID, SAMPLE_QUOTE } from '../samples';
import type { OperationDocs } from '../types';
import { PAGING_PARAMS, ok, page } from './helpers';

const CUSTOMER = ['CUSTOMER'] as const;
const ADMIN = ['ADMIN'] as const;

const SAMPLE_PROMO = {
  id: ID.promo,
  code: 'EID25',
  discountType: 'PERCENT',
  value: '25.00',
  maxDiscount: '200.00',
  minOrderAmount: '500.00',
  maxUses: 1000,
  perUserLimit: 1,
  validFrom: '2026-10-01T00:00:00.000Z',
  validTo: '2026-10-31T18:59:59.999Z',
  cityId: 1,
  owner: null,
  isActive: true,
  redemptions: 42,
  createdAt: '2026-09-25T09:00:00.000Z',
};

const SAMPLE_REFERRAL = {
  code: 'Q35M9QBH',
  rewardAmount: '100.00',
  pending: 1,
  rewarded: 1,
  referrals: [
    {
      id: 'd8f0b2c4-6e8a-4b1d-9f3e-5a7c9e1b3d42',
      status: 'REWARDED',
      refereeName: 'Bilal',
      createdAt: '2026-10-10T10:15:00.000Z',
      rewardedAt: '2026-10-18T13:40:00.000Z',
      rewardCode: 'REF-A2C4E6F8',
      rewardValidTo: '2027-01-16T13:40:00.000Z',
    },
  ],
};

export const promoDocs: OperationDocs = {
  'POST /promos/validate': {
    summary: 'Validate a promo code against a cart',
    tag: 'promos',
    who: [...CUSTOMER],
    description:
      'Prices the items with the code exactly as checkout will. A valid code returns the normal quote plus `promo`. Codes are checked again inside the order transaction, so the discount here is a preview and the last use cannot be claimed twice.',
    requests: {
      default: {
        summary: 'Check EID25 on a 3-shirt cart',
        value: {
          vendorId: ID.vendor,
          code: 'EID25',
          items: [{ serviceItemId: ID.item, qty: 3 }],
        },
      },
    },
    response: {
      example: ok({
        ...SAMPLE_QUOTE,
        discountTotal: '90.00',
        total: '420.00',
        promo: { code: 'EID25', discountTotal: '90.00' },
      }),
    },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'The vendor does not exist or is not available.' },
      { status: 422, code: 'PROMO_NOT_FOUND', when: 'The code does not exist.' },
      { status: 422, code: 'PROMO_UNAVAILABLE', when: 'The code is inactive, expired, for another city, or belongs to another account.' },
      { status: 422, code: 'PROMO_MIN_ORDER', when: 'The cart subtotal is below the code’s minimum order.' },
      { status: 422, code: 'PROMO_USAGE_LIMIT', when: 'The code has reached its total number of uses.' },
    ],
  },
  'GET /me/referral': {
    summary: 'Your referral code and rewards',
    tag: 'promos',
    who: [...CUSTOMER],
    description:
      'Share `code` with a friend. They can enter it when signing in for the first time as a customer. When their first order is delivered, a personal one-time promo worth `rewardAmount` is created and its code appears here.',
    response: { example: ok(SAMPLE_REFERRAL) },
  },
  'GET /admin/promos': {
    summary: 'List promo codes',
    tag: 'admin-promos',
    who: [...ADMIN],
    description: 'Newest first. Soft-deleted codes are hidden. Use the detail endpoint to see redemption totals.',
    params: {
      q: { example: 'EID', description: 'Search code or owner name.' },
      isActive: { example: true, description: 'Filter by the active switch.' },
      cityId: { example: 1, description: 'Only codes whose city restriction is this city.' },
      ...PAGING_PARAMS,
    },
    response: { example: page([SAMPLE_PROMO]) },
  },
  'POST /admin/promos': {
    summary: 'Create a promo code',
    tag: 'admin-promos',
    who: [...ADMIN],
    description:
      'Create a percentage or flat discount with an optional total-use cap, a per-customer cap, a minimum order, a city and a validity window. The code is stored uppercase and audited.',
    requests: {
      default: {
        summary: '25% off up to Rs 200',
        value: {
          code: 'EID25',
          discountType: 'PERCENT',
          value: '25',
          maxDiscount: '200',
          minOrderAmount: '500',
          maxUses: 1000,
          perUserLimit: 1,
          validFrom: '2026-10-01T00:00:00.000Z',
          validTo: '2026-10-31T18:59:59.999Z',
          cityId: 1,
          isActive: true,
        },
      },
    },
    response: { example: ok(SAMPLE_PROMO) },
    errors: [
      { status: 409, code: 'PROMO_CODE_EXISTS', when: 'Another code with the same name already exists.' },
      { status: 422, code: 'PROMO_INVALID_VALUE', when: 'The discount is zero, over 100%, or the cap is zero.' },
      { status: 422, code: 'PROMO_INVALID_WINDOW', when: 'The end of the validity window is not after its start.' },
    ],
  },
  'GET /admin/promos/{id}': {
    summary: 'Promo details and usage',
    tag: 'admin-promos',
    who: [...ADMIN],
    description: 'The code plus redemption count, unique customers and total discount given.',
    params: { id: { example: ID.promo } },
    response: {
      example: ok({
        ...SAMPLE_PROMO,
        stats: { redemptions: 42, uniqueCustomers: 39, discountTotal: '3780.00' },
      }),
    },
    errors: [{ status: 404, code: 'PROMO_NOT_FOUND', when: 'The code does not exist or was deleted.' }],
  },
  'PATCH /admin/promos/{id}': {
    summary: 'Update a promo code',
    tag: 'admin-promos',
    who: [...ADMIN],
    description:
      'Change any editable field except the code itself. Past orders and redemptions keep the discount they received. Audited.',
    params: { id: { example: ID.promo } },
    requests: {
      default: { summary: 'Pause the code', value: { isActive: false } },
    },
    response: { example: ok({ ...SAMPLE_PROMO, isActive: false }) },
    errors: [
      { status: 404, code: 'PROMO_NOT_FOUND', when: 'The code does not exist or was deleted.' },
      { status: 422, code: 'PROMO_INVALID_VALUE', when: 'The new discount or cap is not valid.' },
      { status: 422, code: 'PROMO_INVALID_WINDOW', when: 'The resulting validity window is invalid.' },
    ],
  },
  'DELETE /admin/promos/{id}': {
    summary: 'Delete a promo code',
    tag: 'admin-promos',
    who: [...ADMIN],
    description:
      'Soft-deletes the code and turns it off. Redemption history and the code shown on past orders are preserved. Audited.',
    params: { id: { example: ID.promo } },
    response: { status: 204 },
    errors: [{ status: 404, code: 'PROMO_NOT_FOUND', when: 'The code does not exist or was already deleted.' }],
  },
};
