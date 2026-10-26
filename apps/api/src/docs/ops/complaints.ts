import { ID } from '../samples';
import type { OperationDocs } from '../types';
import { PAGING_PARAMS, ok, page } from './helpers';

const CUSTOMER = ['CUSTOMER'] as const;
const VENDOR = ['VENDOR_OWNER', 'VENDOR_STAFF'] as const;
const ADMIN = ['ADMIN'] as const;

const SAMPLE_COMPLAINT = {
  id: ID.complaint,
  orderId: ID.order,
  customerId: ID.user,
  vendorId: ID.vendor,
  type: 'COMPLAINT',
  status: 'OPEN',
  subject: 'Shirt came back with a mark',
  description: 'The white shirt still has a dark mark on the collar.',
  attachments: [
    {
      publicId: 'dhoblio/development/complaints/3f6c1f0e-8c1a-4a53-9f55-6a1c1c0b2a01/collar-mark',
      url: 'https://res.cloudinary.com/demo/image/authenticated/collar-mark.jpg',
      format: 'jpg',
      signedUrl: 'https://api.cloudinary.com/v1_1/demo/image/download?expires_at=1792676400&format=jpg&public_id=...&signature=...',
    },
  ],
  resolution: null,
  assignedToId: null,
  resolvedAt: null,
  createdAt: '2026-10-23T16:20:00.000Z',
  updatedAt: '2026-10-23T16:20:00.000Z',
  order: { orderNo: 'DHB-LHR-000123' },
  vendor: { businessName: 'Sparkle Laundry' },
};

const THREAD = {
  ...SAMPLE_COMPLAINT,
  customer: { name: 'Ayesha Khan', phone: '+923001234567' },
  assignedTo: null,
  messages: [
    {
      id: 'e2a4c6f8-0b3d-4e5a-9c7f-1d3b5e7a9c43',
      authorId: ID.user,
      authorRole: 'CUSTOMER',
      body: 'Could someone check the collar?',
      createdAt: '2026-10-23T16:25:00.000Z',
      authorName: 'Ayesha Khan',
    },
  ],
};

const LIST_QUERY = {
  status: { example: 'OPEN', description: 'Filter by complaint status.' },
  type: { example: 'COMPLAINT', description: '`COMPLAINT` for a quality issue, `REDO` for a cleaning redo request.' },
  vendorId: { example: ID.vendor, description: 'Admin only: restrict to one vendor.' },
  ...PAGING_PARAMS,
};

const NOT_FOUND = { status: 404, code: 'NOT_FOUND', when: 'The complaint does not exist or is not visible to you.' };
const CLOSED = { status: 409, code: 'COMPLAINT_CLOSED', when: 'The complaint is already resolved or rejected.' };

export const complaintDocs: OperationDocs = {
  'POST /orders/{orderId}/complaints': {
    summary: 'File a complaint or redo request',
    tag: 'complaints',
    who: [...CUSTOMER],
    description:
      'Only for your own delivered order. Upload photos first with `POST /media/sign` using kind `complaint`, then send their public IDs. Each photo is verified against your private Cloudinary folder. A delivered order can have one live complaint at a time; after it is closed you may open another. The vendor is notified by SMS.',
    params: { orderId: { example: ID.order } },
    requests: {
      default: {
        summary: 'Quality complaint with one photo',
        value: {
          type: 'COMPLAINT',
          subject: 'Shirt came back with a mark',
          description: 'The white shirt still has a dark mark on the collar.',
          attachments: [
            {
              publicId: 'dhoblio/development/complaints/3f6c1f0e-8c1a-4a53-9f55-6a1c1c0b2a01/collar-mark',
            },
          ],
        },
      },
      redo: {
        summary: 'Ask for the order to be cleaned again',
        value: {
          type: 'REDO',
          subject: 'Please wash again',
          description: 'The clothes still smell of detergent, so I would like them cleaned again.',
        },
      },
    },
    response: { example: ok(SAMPLE_COMPLAINT) },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'The order does not exist or is not yours.' },
      { status: 409, code: 'COMPLAINT_NOT_ALLOWED', when: 'The order has not been delivered yet.' },
      { status: 409, code: 'COMPLAINT_OPEN', when: 'This order already has a live complaint.' },
      { status: 400, code: 'INVALID_ATTACHMENTS', when: 'The same photo is listed twice.' },
      { status: 400, code: 'MEDIA_INVALID_ASSET', when: 'A photo was not found in your complaint folder.' },
    ],
  },
  'GET /orders/{orderId}/complaints': {
    summary: 'Your complaints for an order',
    tag: 'complaints',
    who: [...CUSTOMER],
    description: 'Newest first. Includes a short status so the app can show open and past issues separately.',
    params: { orderId: { example: ID.order }, ...LIST_QUERY },
    response: { example: page([SAMPLE_COMPLAINT]) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'The order does not exist or is not yours.' }],
  },
  'GET /orders/{orderId}/complaints/{id}': {
    summary: 'Read one complaint',
    tag: 'complaints',
    who: [...CUSTOMER],
    description: 'The complaint, its signed photo links (valid for 10 minutes) and the full reply thread.',
    params: { orderId: { example: ID.order }, id: { example: ID.complaint } },
    response: { example: ok(THREAD) },
    errors: [NOT_FOUND],
  },
  'POST /orders/{orderId}/complaints/{id}/messages': {
    summary: 'Add to the complaint thread',
    tag: 'complaints',
    who: [...CUSTOMER],
    description: 'Add a message while the complaint is open. The vendor is notified. Closed complaints cannot be reopened with a message.',
    params: { orderId: { example: ID.order }, id: { example: ID.complaint } },
    requests: { default: { summary: 'Send a follow-up', value: { body: 'Could someone check the collar?' } } },
    response: { example: ok(THREAD) },
    errors: [NOT_FOUND, CLOSED],
  },
  'GET /vendor/complaints': {
    summary: 'The shop’s complaint inbox',
    tag: 'vendor-complaints',
    who: [...VENDOR],
    description: 'Newest first, scoped to the signed-in vendor. Suspended vendors can still read and reply to past orders.',
    params: LIST_QUERY,
    response: { example: page([SAMPLE_COMPLAINT]) },
  },
  'GET /vendor/complaints/{id}': {
    summary: 'Read a complaint as the vendor',
    tag: 'vendor-complaints',
    who: [...VENDOR],
    description: 'Full description, signed photos and the customer/vendor/admin thread.',
    params: { id: { example: ID.complaint } },
    response: { example: ok(THREAD) },
    errors: [NOT_FOUND],
  },
  'POST /vendor/complaints/{id}/reply': {
    summary: 'Reply to a complaint',
    tag: 'vendor-complaints',
    who: [...VENDOR],
    description: 'The first vendor reply moves an `OPEN` complaint to `VENDOR_RESPONDED`; the customer is notified. Further replies are allowed until it is resolved.',
    params: { id: { example: ID.complaint } },
    requests: { default: { summary: 'Reply with an offer to redo', value: { body: 'Sorry about that. We can clean the shirt again at no charge.' } } },
    response: { example: ok({ ...THREAD, status: 'VENDOR_RESPONDED' }) },
    errors: [NOT_FOUND, CLOSED],
  },
  'GET /admin/complaints': {
    summary: 'List all complaints',
    tag: 'admin-complaints',
    who: [...ADMIN],
    description: 'Newest first across every vendor. Filter by status, type or vendor to triage the queue.',
    params: LIST_QUERY,
    response: { example: page([SAMPLE_COMPLAINT]) },
  },
  'GET /admin/complaints/{id}': {
    summary: 'Read a complaint as admin',
    tag: 'admin-complaints',
    who: [...ADMIN],
    description: 'Everything the customer and vendor see, plus the assigned admin and customer phone number.',
    params: { id: { example: ID.complaint } },
    response: { example: ok(THREAD) },
    errors: [NOT_FOUND],
  },
  'POST /admin/complaints/{id}/assign': {
    summary: 'Assign a complaint',
    tag: 'admin-complaints',
    who: [...ADMIN],
    description: 'Assigns the complaint to an admin (defaults to you) and moves it to `IN_REVIEW`. Audited.',
    params: { id: { example: ID.complaint } },
    requests: {
      default: { summary: 'Assign to myself', value: {} },
      anotherAdmin: { summary: 'Assign to another admin', value: { adminId: ID.admin } },
    },
    response: { example: ok({ ...THREAD, status: 'IN_REVIEW', assignedToId: ID.admin }) },
    errors: [NOT_FOUND, CLOSED, { status: 400, code: 'ADMIN_NOT_FOUND', when: 'The requested admin does not exist.' }],
  },
  'POST /admin/complaints/{id}/messages': {
    summary: 'Add an admin note to the thread',
    tag: 'admin-complaints',
    who: [...ADMIN],
    description: 'Visible to the customer and vendor. Use it to ask for more information before resolving.',
    params: { id: { example: ID.complaint } },
    requests: { default: { summary: 'Ask for a photo of the tag', value: { body: 'Could you add a photo of the care label?' } } },
    response: { example: ok(THREAD) },
    errors: [NOT_FOUND, CLOSED],
  },
  'POST /admin/complaints/{id}/resolve': {
    summary: 'Resolve a complaint',
    tag: 'admin-complaints',
    who: [...ADMIN],
    description:
      'Close the complaint with one outcome. `REFUND` refunds every successful online payment for the order (COD refunds are handled manually and only recorded); `REDO` adds a fresh pickup and delivery attempt to the delivered order and dispatches them; `REJECT` closes it without further work. The customer is notified by SMS. Audited.',
    params: { id: { example: ID.complaint } },
    requests: {
      refund: { summary: 'Refund the online payment', value: { outcome: 'REFUND', note: 'Mark was from our press.' } },
      redo: { summary: 'Schedule a redo', value: { outcome: 'REDO', note: 'We will collect and clean it again.' } },
      reject: { summary: 'Reject the complaint', value: { outcome: 'REJECT', note: 'The mark is covered by the care label.' } },
    },
    response: {
      example: ok({
        ...THREAD,
        status: 'RESOLVED',
        resolution: 'REFUND: Mark was from our press.',
        resolvedAt: '2026-10-24T09:00:00.000Z',
        refunded: 1,
        redoJobIds: [],
      }),
    },
    errors: [
      NOT_FOUND,
      CLOSED,
      { status: 409, code: 'COMPLAINT_NOT_REFUNDABLE', when: 'No refundable online payment exists for this order.' },
      { status: 409, code: 'REDO_NOT_ALLOWED', when: 'The order is not in a delivered state, so a redo cannot be created.' },
      { status: 409, code: 'PAYMENT_NOT_REFUNDABLE', when: 'The payment cannot be refunded by its gateway.' },
    ],
  },
};
