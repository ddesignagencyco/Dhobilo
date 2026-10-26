import { ID } from '../samples';
import type { OperationDocs } from '../types';
import { PAGING_PARAMS, ok, page } from './helpers';

const SAMPLE_REVIEW = {
  id: ID.review,
  orderId: ID.order,
  targetType: 'VENDOR',
  rating: 5,
  comment: 'Clothes came back spotless and folded neatly.',
  createdAt: '2026-10-23T16:10:00.000Z',
  vendor: { id: ID.vendor, businessName: 'Sparkle Laundry' },
  riderId: null,
};

export const reviewDocs: OperationDocs = {
  'POST /orders/{orderId}/reviews': {
    summary: 'Review the vendor and/or rider',
    tag: 'reviews',
    who: ['CUSTOMER'],
    description:
      'Rate a delivered order from 1 to 5 stars with an optional comment. Send `vendor`, `rider`, or both. A rider review is only possible when the order was delivered by a Dhobilo rider. One review per target per order; sending it twice returns `REVIEW_EXISTS`. Vendor and rider averages update in the same transaction.',
    params: { orderId: { example: ID.order } },
    requests: {
      default: {
        summary: 'Five stars for both',
        value: {
          vendor: { rating: 5, comment: 'Clothes came back spotless and folded neatly.' },
          rider: { rating: 5, comment: 'On time and very polite.' },
        },
      },
      vendorOnly: {
        summary: 'Vendor only, no comment',
        value: { vendor: { rating: 4 } },
      },
    },
    response: { example: ok([SAMPLE_REVIEW]) },
    errors: [
      { status: 400, code: 'REVIEW_TARGET_REQUIRED', when: 'Neither `vendor` nor `rider` was sent.' },
      { status: 404, code: 'ORDER_NOT_FOUND', when: 'The order does not exist or is not yours.' },
      { status: 409, code: 'ORDER_NOT_DELIVERED', when: 'The order has not been delivered yet.' },
      { status: 409, code: 'REVIEW_EXISTS', when: 'You already reviewed this target for this order.' },
      { status: 422, code: 'RIDER_REVIEW_UNAVAILABLE', when: 'This order was not delivered by a Dhobilo rider.' },
    ],
  },
  'GET /vendors/{vendorId}/reviews': {
    summary: 'Read a vendor’s reviews',
    tag: 'reviews',
    who: 'public',
    description:
      'Newest first. Vendor reviews only (rider ratings stay private to the rider). `meta.summary` includes the live average, count and star distribution. Customer names are shortened to the first name.',
    params: {
      vendorId: { example: ID.vendor },
      ...PAGING_PARAMS,
    },
    response: {
      example: {
        ...page(
          [
            {
              id: ID.review,
              rating: 5,
              comment: 'Clothes came back spotless and folded neatly.',
              createdAt: '2026-10-23T16:10:00.000Z',
              customerName: 'Ayesha',
            },
          ],
          null,
        ),
        meta: {
          nextCursor: null,
          summary: { vendorName: 'Sparkle Laundry', ratingAvg: '4.60', ratingCount: 128, distribution: { 5: 98, 4: 21, 3: 6, 2: 2, 1: 1 } },
        },
      },
    },
    errors: [{ status: 404, code: 'VENDOR_NOT_FOUND', when: 'The vendor does not exist, is not approved, or is in an inactive city.' }],
  },
};
