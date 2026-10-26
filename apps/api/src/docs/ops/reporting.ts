import { ID } from '../samples';
import type { OperationDocs } from '../types';
import { ok, page } from './helpers';

const ADMIN = ['ADMIN'] as const;
const VENDOR = ['VENDOR_OWNER', 'VENDOR_STAFF'] as const;

const RANGE = { from: '2026-10-20', to: '2026-10-26', cityId: null };

const DAY = {
  day: '2026-10-26',
  ordersPlaced: 42,
  ordersDelivered: 35,
  ordersCancelled: 3,
  gmv: '31250.00',
  revenue: '4687.50',
  vendorEarnings: '26562.50',
  deliveryFees: '1750.00',
  discounts: '600.00',
  averageOrderValue: '892.86',
};

/** The day's numbers without the date: what a total or a city line carries. */
const { day: _day, ...FIGURES } = DAY;

const RANGE_PARAMS = {
  from: { example: '2026-10-20', description: 'First day, Pakistan time, inclusive. Default: 6 days before `to`.' },
  to: { example: '2026-10-26', description: 'Last day, Pakistan time, inclusive. Default: today. The range can cover at most 366 days.' },
  cityId: { example: 1, description: 'Only this city. Leave out for the whole platform.' },
};

const RANGE_ERRORS = [{ status: 400, code: 'INVALID_RANGE', when: '`from` is after `to`, a date is not real, or the range is longer than 366 days.' }];

const SAMPLE_REPORT = {
  id: ID.report,
  type: 'ORDERS',
  format: 'CSV',
  params: { from: '2026-10-01', to: '2026-10-26', cityId: 1 },
  status: 'READY',
  rowCount: 1280,
  byteSize: 214530,
  fileName: 'dhoblio-orders-2026-10-01_to_2026-10-26.csv',
  error: null,
  createdAt: '2026-10-26T09:00:00.000Z',
  completedAt: '2026-10-26T09:00:07.000Z',
  expiresAt: '2026-11-02T09:00:07.000Z',
  download: {
    url: `/api/v1/reports/${ID.report}/download?exp=1793006400&sig=4f9c1e7a2b8d0365f1a4c7e9b2d5083a6c1f4e7b9a2d5c8f0136b9e4a7d2c5f8`,
    expiresAt: '2026-10-26T09:10:00.000Z',
  },
};

const SAMPLE_ANNOUNCEMENT = {
  id: ID.announcement,
  title: 'Eid offer',
  body: 'Get 15% off your next laundry order this week.',
  titleUr: null,
  bodyUr: null,
  segment: { roles: ['CUSTOMER'], cityId: 1, activeWithinDays: 60 },
  channels: ['PUSH'],
  status: 'QUEUED',
  recipientCount: 840,
  messagesQueued: 0,
  error: null,
  sentById: ID.admin,
  createdAt: '2026-10-26T09:00:00.000Z',
  completedAt: null,
};

export const reportingDocs: OperationDocs = {
  'GET /admin/analytics/overview': {
    summary: 'Platform overview',
    tag: 'admin-analytics',
    who: [...ADMIN],
    description:
      'The headline numbers for a date range, with one entry per day. Days are Pakistan business days, and every figure belongs to the day it happened: **orders placed** by the day they were created, **delivered, sales (`gmv`), `revenue` (our commission), vendor earnings, delivery fees and discounts** by the day the order was delivered, and **cancelled** by the day an order was cancelled or rejected. `activeCustomers` is the number of different customers who ordered in the whole range; `newCustomers` counts customers whose first-ever order falls in it. Finished days come from the nightly summary tables, today is always live.',
    params: RANGE_PARAMS,
    response: {
      example: ok({
        range: RANGE,
        totals: { ...FIGURES, ordersPlaced: 282, ordersDelivered: 241, ordersCancelled: 19, gmv: '212400.00', revenue: '31860.00', vendorEarnings: '180540.00', deliveryFees: '12050.00', discounts: '4100.00', averageOrderValue: '881.33', activeCustomers: 190, newCustomers: 47, approvedVendors: 23 },
        series: [{ ...DAY, day: '2026-10-25' }, DAY],
      }),
    },
    errors: RANGE_ERRORS,
  },
  'GET /admin/analytics/orders': {
    summary: 'Order counts',
    tag: 'admin-analytics',
    who: [...ADMIN],
    description:
      'How many orders were placed, delivered and cancelled in the range, per day and per city. `byStatus` and `byPaymentMethod` describe the orders **placed in the range** as they stand right now.',
    params: RANGE_PARAMS,
    response: {
      example: ok({
        range: RANGE,
        totals: { ordersPlaced: 282, ordersDelivered: 241, ordersCancelled: 19 },
        byStatus: [
          { status: 'DELIVERED', orders: 241 },
          { status: 'CANCELLED', orders: 12 },
          { status: 'IN_PROCESS', orders: 20 },
        ],
        byPaymentMethod: [
          { method: 'COD', orders: 180 },
          { method: 'JAZZCASH', orders: 70 },
        ],
        byCity: [{ cityId: 1, city: 'Lahore', ordersPlaced: 150, ordersDelivered: 130, ordersCancelled: 9 }],
        series: [{ day: '2026-10-26', ordersPlaced: 42, ordersDelivered: 35, ordersCancelled: 3 }],
      }),
    },
    errors: RANGE_ERRORS,
  },
  'GET /admin/analytics/revenue': {
    summary: 'Sales and revenue',
    tag: 'admin-analytics',
    who: [...ADMIN],
    description:
      '`gmv` is the value of orders delivered in the range, `revenue` is the commission the platform earned on them. `cashGmv` is the part paid in cash on delivery, which reaches us only when the rider’s deposit is recorded; `prepaidGmv` was paid online. Refunds are not netted off.',
    params: RANGE_PARAMS,
    response: {
      example: ok({
        range: RANGE,
        totals: { ...FIGURES, cashGmv: '150100.00', prepaidGmv: '62300.00' },
        byCity: [{ cityId: 1, city: 'Lahore', ...FIGURES }],
        series: [{ day: '2026-10-26', gmv: '31250.00', revenue: '4687.50', vendorEarnings: '26562.50', deliveryFees: '1750.00', discounts: '600.00' }],
      }),
    },
    errors: RANGE_ERRORS,
  },
  'GET /admin/analytics/vendors': {
    summary: 'Top vendors',
    tag: 'admin-analytics',
    who: [...ADMIN],
    description: 'Vendors ranked by sales (`gmv`) of orders delivered in the range. Vendors with no delivered order are left out.',
    params: { ...RANGE_PARAMS, limit: { example: 10, description: 'How many vendors, 1 to 50 (default 10).' } },
    response: {
      example: ok({
        range: RANGE,
        vendors: [
          { rank: 1, vendorId: ID.vendor, businessName: 'Sparkle Laundry', cityId: 1, city: 'Lahore', ordersDelivered: 64, gmv: '58200.00', revenue: '8730.00', vendorEarnings: '49470.00', ratingAvg: '4.70', ratingCount: 112 },
        ],
      }),
    },
    errors: RANGE_ERRORS,
  },
  'POST /admin/analytics/rollup': {
    summary: 'Recompute daily numbers',
    tag: 'admin-analytics',
    who: [...ADMIN],
    description:
      'Rebuilds the stored daily summary for finished days (never today). The nightly job does yesterday by itself and a dashboard fills any missing day on demand, so this is only for backfills or after fixing data. It runs in the background and is safe to repeat.',
    requests: {
      default: { summary: 'Rebuild a week', value: { from: '2026-10-19', to: '2026-10-25' } },
    },
    response: { status: 202, example: ok({ queued: ['2026-10-19', '2026-10-20', '2026-10-21'] }) },
    errors: RANGE_ERRORS,
  },

  'GET /vendor/analytics': {
    summary: 'My shop’s analytics',
    tag: 'vendor-analytics',
    who: [...VENDOR],
    description:
      'Today and the last 7, 30 or 90 days for your own shop: orders, sales, what you earned after commission, what is in progress now, best-selling services and the weekly rating trend. `acceptanceRate` is the share of orders placed in the range that you did not reject.',
    params: { days: { example: 7, description: '`7` (default), `30` or `90`.' } },
    response: {
      example: ok({
        range: { from: '2026-10-20', to: '2026-10-26', days: 7 },
        today: { ordersPlaced: 6, ordersDelivered: 4, ordersRejected: 0, ordersCancelled: 1, sales: '3600.00', earnings: '3060.00' },
        totals: { ordersPlaced: 40, ordersDelivered: 33, ordersCancelled: 2, ordersRejected: 1, sales: '29700.00', commission: '4455.00', earnings: '25245.00', averageOrderValue: '900.00', acceptanceRate: 97.5 },
        inProgress: [{ status: 'IN_PROCESS', orders: 5 }],
        series: [{ day: '2026-10-26', ordersPlaced: 6, ordersDelivered: 4, sales: '3600.00', earnings: '3060.00' }],
        topServices: [{ name: 'Shalwar Kameez (wash & iron)', quantity: 58, revenue: '17400.00' }],
        ratingTrend: [{ weekStarting: '2026-10-19', average: '4.70', reviews: 9 }],
      }),
    },
    errors: [{ status: 403, code: 'VENDOR_NOT_ACTIVE', when: 'The vendor account is not approved.' }],
  },

  'POST /admin/reports': {
    summary: 'Request a report',
    tag: 'admin-reports',
    who: [...ADMIN],
    description:
      'Starts building a CSV or Excel file in the background (orders, payments, payouts, cash collections or vendors) for a date range. Poll **Get a report** until `status` is `READY`; it then carries a short-lived `download` link. Customer and owner phone numbers are masked, and files are kept for 7 days. A report may not exceed 250,000 rows: narrow the range or pick a city. At most 20 reports per hour.',
    requests: {
      default: { summary: 'Orders for a month, as Excel', value: { type: 'ORDERS', format: 'XLSX', from: '2026-10-01', to: '2026-10-31', cityId: 1 } },
      payouts: { summary: 'Payouts, CSV', value: { type: 'PAYOUTS', from: '2026-10-01', to: '2026-10-31' } },
    },
    response: { status: 202, example: ok({ ...SAMPLE_REPORT, status: 'QUEUED', rowCount: null, byteSize: null, fileName: null, completedAt: null, expiresAt: null, download: null }) },
    errors: [
      ...RANGE_ERRORS,
      { status: 404, code: 'CITY_NOT_FOUND', when: '`cityId` does not exist.' },
      { status: 404, code: 'VENDOR_NOT_FOUND', when: '`vendorId` does not exist.' },
      { status: 429, code: 'RATE_LIMITED', when: 'More than 20 reports were requested in an hour.' },
    ],
  },
  'GET /admin/reports': {
    summary: 'My reports',
    tag: 'admin-reports',
    who: [...ADMIN],
    description: 'The reports you requested, newest first. Ready ones carry a fresh download link.',
    params: {
      type: { example: 'ORDERS', description: '`ORDERS`, `PAYMENTS`, `PAYOUTS`, `COD` or `VENDORS`.' },
      status: { example: 'READY', description: '`QUEUED`, `RUNNING`, `READY`, `FAILED` or `EXPIRED`.' },
      cursor: { description: 'Opaque value from the previous page’s `meta.nextCursor`.' },
      limit: { example: 20, description: 'Page size, 1 to 50 (default 20).' },
    },
    response: { example: page([SAMPLE_REPORT]) },
  },
  'GET /admin/reports/{id}': {
    summary: 'Get a report',
    tag: 'admin-reports',
    who: [...ADMIN],
    description: 'Status and, once `READY`, a download link that works for 10 minutes. Ask again for a new link. After 7 days the file is removed and the status becomes `EXPIRED`.',
    params: { id: { example: ID.report } },
    response: { example: ok(SAMPLE_REPORT) },
    errors: [{ status: 404, code: 'REPORT_NOT_FOUND', when: 'There is no such report among yours.' }],
  },
  'GET /reports/{id}/download': {
    summary: 'Download a report file',
    tag: 'admin-reports',
    who: 'public',
    description:
      'The file itself, as `text/csv` (with a byte-order mark, so Excel reads Urdu names) or an `.xlsx` workbook. Use the exact link from **Get a report**: it is signed and expires after 10 minutes, so no sign-in is needed (it can be opened straight from a browser). Cells that start with `=`, `+`, `-` or `@` are neutralised so a spreadsheet never runs them as formulas.',
    params: {
      id: { example: ID.report },
      exp: { example: 1793006400, description: 'When the link stops working (Unix seconds). Part of the signed link.' },
      sig: { example: '4f9c1e7a2b8d0365f1a4c7e9b2d5083a6c1f4e7b9a2d5c8f0136b9e4a7d2c5f8', description: 'The link’s signature. Part of the signed link.' },
    },
    response: {
      contentType: 'text/csv',
      description: 'The file (CSV shown).',
      example: 'Order no,Placed at (PKT),City,Vendor,Customer phone,Status,Payment method,Payment status,Subtotal,Discount,Delivery fee,Total,Commission,Vendor earning,Delivered at (PKT)\r\nDHB-LHR-000123,2026-10-22 18:05,Lahore,Sparkle Laundry,0300****567,DELIVERED,COD,COD_COLLECTED,360.00,0.00,50.00,410.00,54.00,306.00,2026-10-24 17:30\r\n',
    },
    errors: [
      { status: 403, code: 'LINK_INVALID', when: 'The signature does not match.' },
      { status: 410, code: 'LINK_EXPIRED', when: 'The link is older than 10 minutes. Get the report again for a new one.' },
      { status: 410, code: 'REPORT_EXPIRED', when: 'The file was removed after 7 days.' },
      { status: 404, code: 'REPORT_NOT_READY', when: 'The report has no file (still building, or it failed).' },
    ],
  },

  'POST /admin/announcements/preview': {
    summary: 'Preview an announcement’s audience',
    tag: 'admin-announcements',
    who: [...ADMIN],
    description:
      'Counts who an audience would reach, without sending anything: the total, the split by role and how many can be reached on each channel (people who switched a channel off, or have no registered phone for push, are not counted there). Only active accounts are ever included, never admins. Describe the audience with `roles`, a `cityId`, and **either** `activeWithinDays` (signed in or ordered recently) **or** `inactiveForDays` (win-back).',
    requests: {
      default: { summary: 'Active Lahore customers, by push', value: { segment: { roles: ['CUSTOMER'], cityId: 1, activeWithinDays: 60 }, channels: ['PUSH'] } },
      winback: { summary: 'Customers gone quiet, by SMS', value: { segment: { roles: ['CUSTOMER'], inactiveForDays: 90 }, channels: ['SMS'] } },
    },
    response: {
      status: 200,
      example: ok({ segment: { roles: ['CUSTOMER'], cityId: 1, activeWithinDays: 60 }, recipients: 840, reachable: 790, byRole: { CUSTOMER: 840 }, byChannel: { PUSH: 790, SMS: 0, EMAIL: 0 } }),
    },
    errors: [{ status: 400, code: 'INVALID_SEGMENT', when: 'Both `activeWithinDays` and `inactiveForDays` were given.' }],
  },
  'POST /admin/announcements': {
    summary: 'Send an announcement',
    tag: 'admin-announcements',
    who: [...ADMIN],
    description:
      'Sends a message to everyone in the audience by push, SMS and/or email (default push). Pass the preview’s `recipients` as `confirmRecipients`: if the audience has changed since, nothing is sent (`409 AUDIENCE_CHANGED`). Messages are queued and spread over time (push 200/s, SMS 20/s, email 10/s) so provider limits are respected; people who switched a channel off are skipped on it. Give both Urdu fields to reach Urdu speakers in their language. At most 5 announcements per hour. Follow progress with **Get an announcement**.',
    requests: {
      default: {
        summary: 'Push to active Lahore customers',
        value: { title: 'Eid offer', body: 'Get 15% off your next laundry order this week.', segment: { roles: ['CUSTOMER'], cityId: 1, activeWithinDays: 60 }, channels: ['PUSH'], confirmRecipients: 840 },
      },
    },
    response: { status: 202, example: ok(SAMPLE_ANNOUNCEMENT) },
    errors: [
      { status: 400, code: 'INVALID_SEGMENT', when: 'Both `activeWithinDays` and `inactiveForDays` were given.' },
      { status: 400, code: 'INVALID_ANNOUNCEMENT', when: 'Only one of the Urdu title and text was given.' },
      { status: 409, code: 'AUDIENCE_CHANGED', when: '`confirmRecipients` no longer matches the audience.' },
      { status: 422, code: 'NO_RECIPIENTS', when: 'Nobody matches the audience.' },
      { status: 429, code: 'RATE_LIMITED', when: 'More than 5 announcements were sent in an hour.' },
    ],
  },
  'GET /admin/announcements': {
    summary: 'Announcement history',
    tag: 'admin-announcements',
    who: [...ADMIN],
    description: 'Every announcement, newest first.',
    params: {
      cursor: { description: 'Opaque value from the previous page’s `meta.nextCursor`.' },
      limit: { example: 20, description: 'Page size, 1 to 50 (default 20).' },
    },
    response: { example: page([{ ...SAMPLE_ANNOUNCEMENT, status: 'SENT', messagesQueued: 790, completedAt: '2026-10-26T09:00:12.000Z' }]) },
  },
  'GET /admin/announcements/{id}': {
    summary: 'Get an announcement',
    tag: 'admin-announcements',
    who: [...ADMIN],
    description: 'The announcement and how delivery is going, per channel: still `queued`, `sent` or `failed`.',
    params: { id: { example: ID.announcement } },
    response: {
      example: ok({
        ...SAMPLE_ANNOUNCEMENT,
        status: 'SENT',
        messagesQueued: 790,
        completedAt: '2026-10-26T09:00:12.000Z',
        delivery: { PUSH: { queued: 40, sent: 742, failed: 8 } },
      }),
    },
    errors: [{ status: 404, code: 'ANNOUNCEMENT_NOT_FOUND', when: 'There is no such announcement.' }],
  },

  'GET /admin/audit-logs': {
    summary: 'Audit log',
    tag: 'admin-audit',
    who: [...ADMIN],
    description:
      'Who did what to which record, newest first: approvals, payouts, commission changes, cancellations, announcements and more. Combine filters, for example `entity=Payout&entityId=…` for one payout’s history or `actorId=…` for everything one person did. `before` / `after` hold the values where they were recorded. The log cannot be edited or deleted.',
    params: {
      entity: { example: 'Payout', description: 'Kind of record: `Vendor`, `Rider`, `Payout`, `CommissionRule`, `Order`, `Announcement`, …' },
      entityId: { example: ID.payout, description: 'One record’s id.' },
      action: { example: 'PAYOUT_APPROVED', description: 'What happened, e.g. `VENDOR_APPROVED`.' },
      actorId: { example: ID.admin, description: 'The user who did it.' },
      actorRole: { example: 'ADMIN', description: 'Filter by the actor’s role.' },
      from: { example: '2026-10-20T00:00:00+05:00', description: 'Earliest moment, inclusive (ISO 8601).' },
      to: { example: '2026-10-26T23:59:59+05:00', description: 'Latest moment, inclusive (ISO 8601).' },
      cursor: { description: 'Opaque value from the previous page’s `meta.nextCursor`.' },
      limit: { example: 20, description: 'Page size, 1 to 50 (default 20).' },
    },
    response: {
      example: page([
        {
          id: ID.request,
          createdAt: '2026-10-25T09:05:00.000Z',
          action: 'PAYOUT_APPROVED',
          entity: 'Payout',
          entityId: ID.payout,
          actor: { id: ID.admin, name: 'Operations Admin', role: 'ADMIN' },
          actorRole: 'ADMIN',
          before: null,
          after: { status: 'APPROVED' },
          ip: '203.0.113.7',
          requestId: ID.settlement,
        },
      ]),
    },
    errors: [{ status: 400, code: 'INVALID_RANGE', when: '`from` is after `to`.' }],
  },
};
