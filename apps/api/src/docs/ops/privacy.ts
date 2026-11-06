import { ID } from '../samples';
import type { OperationDocs } from '../types';
import { PAGING_PARAMS, ok, page } from './helpers';

const DELETION = {
  id: ID.request,
  status: 'PENDING',
  requestedAt: '2026-11-06T09:00:00.000Z',
  scheduledFor: '2026-12-06T09:00:00.000Z',
  cancelledAt: null,
  completedAt: null,
  daysLeft: 30,
  canCancel: true,
};

export const privacyDocs: OperationDocs = {
  'POST /me/delete-request': {
    summary: 'Delete my account',
    who: 'signed-in',
    description:
      'Asks for the account to be deleted. **Needs a fresh phone code** (`POST /auth/otp/request`, then send the 6-digit code here).\n\n' +
      '- Everything that is still open has to be finished first (open orders, an unpaid shop balance or payout in progress, ' +
      'cash a rider has not handed in, deliveries in progress, open complaints). If something blocks the deletion the answer ' +
      '`DELETION_BLOCKED` lists exactly what.\n' +
      '- The account is signed out everywhere and **scheduled** for deletion after the grace period (30 days by default). ' +
      'During that time the person can still sign in, but only to see the status or cancel.\n' +
      '- After the grace period the account is **anonymised**: name, phone, email, addresses, devices, documents and CNIC are removed. ' +
      'Orders, payments and the ledger stay without any personal details, because the law requires them to be kept.\n' +
      '- Shop staff cannot do this themselves (the shop owner removes them) and admin accounts are removed by a super admin.\n\n' +
      '**Limit:** 5 requests per hour.',
    requests: { default: { summary: 'Confirm with the phone code', value: { code: '123456', reasonCode: 'NOT_USING' } } },
    response: { status: 202, description: 'Scheduled', example: ok(DELETION) },
    errors: [
      { status: 400, code: 'INVALID_OTP', when: 'The code is invalid or has expired.' },
      { status: 403, code: 'STAFF_REMOVED_BY_OWNER', when: 'Shop staff accounts are removed by the shop owner.' },
      { status: 403, code: 'DELETION_NOT_AVAILABLE', when: 'Admin accounts are removed by a super admin, not here.' },
      { status: 409, code: 'DELETION_BLOCKED', when: 'Finish these before deleting your account.' },
      { status: 409, code: 'DELETION_ALREADY_REQUESTED', when: 'A deletion request is already open for this account.' },
      { status: 429, code: 'RATE_LIMITED', when: 'Too many attempts. Please try again later.' },
    ],
  },
  'GET /me/delete-request': {
    summary: 'Where my deletion request stands',
    who: 'signed-in',
    description: 'Works for an account that is scheduled for deletion (every other endpoint answers `ACCOUNT_PENDING_DELETION` for it). `status` is `NONE` when nothing was ever requested.',
    response: { example: ok(DELETION) },
  },
  'DELETE /me/delete-request': {
    summary: 'Cancel my deletion request',
    who: 'signed-in',
    description: 'Keeps the account and makes it fully usable again. Works until the data has actually been anonymised. A shop stays **closed** and has to be reopened by its owner.',
    response: { example: ok({ ...DELETION, status: 'CANCELLED', cancelledAt: '2026-11-07T10:00:00.000Z', daysLeft: 0, canCancel: false }) },
    errors: [{ status: 404, code: 'DELETION_NOT_REQUESTED', when: 'There is no open deletion request.' }],
  },
  'GET /me/export': {
    summary: 'Download my data',
    who: 'signed-in',
    description:
      'Everything the platform holds about the signed-in person as JSON: profile, addresses, orders, reviews, complaints, notification log, devices and (for shops and riders) their business or rider profile with a **masked** CNIC. ' +
      'Passwords, token hashes and other people\'s data are never included. Long lists are cut and `truncated` says which.\n\n**Limit:** 3 per hour.',
    response: {
      example: ok({
        generatedAt: '2026-11-06T09:00:00.000Z',
        account: { id: ID.user, phone: '+923001234567', email: null, name: 'Ayesha Khan', role: 'CUSTOMER', locale: 'EN' },
        addresses: [],
        orders: [],
        reviews: [],
        complaints: [],
        notificationLog: [],
        devices: [],
        truncated: { orders: false, reviews: false, complaints: false, notificationLog: false },
      }),
    },
    errors: [{ status: 429, code: 'RATE_LIMITED', when: 'Too many attempts. Please try again later.' }],
  },
  'GET /admin/deletion-requests': {
    summary: 'Account deletion requests',
    who: ['ADMIN'],
    params: { ...PAGING_PARAMS, status: { example: 'PENDING', description: 'Only requests in this state: PENDING, COMPLETED, CANCELLED or FAILED.' }, limit: { example: 20 } },
    description: 'Newest first; filter by `status`. Shows role, masked phone and where each request stands (`lastError` says why one is waiting: `LEGAL_HOLD`, `BLOCKED:<reasons>`). Never shows names or addresses. Page with `meta.nextCursor`.',
    response: {
      example: page([
        { id: ID.request, userId: ID.user, role: 'CUSTOMER', status: 'PENDING', phone: '+92300*****67', reasonCode: 'NOT_USING', requestedAt: '2026-11-06T09:00:00.000Z', scheduledFor: '2026-12-06T09:00:00.000Z', completedAt: null, attempts: 0, lastError: null, legalHold: false, legalHoldReason: null },
      ]),
    },
  },
  'PUT /admin/users/{id}/legal-hold': {
    summary: 'Freeze a person\'s data (legal hold)',
    who: ['ADMIN'],
    params: { id: { example: ID.user, description: 'User id' } },
    description: 'Deletion and the clean-up job skip this person until the hold is released. Use for a dispute, an investigation or a legal request. Put the case reference in `reason`, not personal details. Audited.',
    requests: { default: { summary: 'Open dispute', value: { reason: 'Payment dispute case PD-1042' } } },
    response: { example: ok({ userId: ID.user, legalHold: true, reason: 'Payment dispute case PD-1042' }) },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'User not found.' },
      { status: 409, code: 'ALREADY_DELETED', when: 'This account has already been anonymised; there is nothing left to hold.' },
    ],
  },
  'DELETE /admin/users/{id}/legal-hold': {
    summary: 'Release a legal hold',
    who: ['ADMIN'],
    params: { id: { example: ID.user, description: 'User id' } },
    description: 'Deletion and clean-up resume. A request that was waiting is processed on the next nightly run.',
    response: { example: ok({ userId: ID.user, legalHold: false }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'User not found.' }],
  },
};
