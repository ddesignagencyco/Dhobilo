import { ID, SAMPLE_ADDRESS } from '../samples';
import type { OperationDocs } from '../types';
import { ok, page, PAGING_PARAMS } from './helpers';

const RIDER = ['RIDER'] as const;
const ADMIN = ['ADMIN'] as const;

const RIDER_ID = '1d7e3b5a-6c2f-4a8e-9b10-4e5f6a7b8c91';
const JOB_ID = '2e8f4c6b-7d30-4b9f-8c21-5f6a7b8c9da2';
const PARTNER_ID = '3f905d7c-8e41-4ca0-9d32-6a7b8c9daeb3';

const SHOP = { role: 'VENDOR', name: 'Sparkle Laundry', phone: '+92300***0011', address: 'Main Market, Model Town', lat: 31.523, lng: 74.361 };
const HOME = { role: 'CUSTOMER', name: 'Ayesha Khan', phone: '+92300***4567', address: '14 Model Town, Model Town', lat: SAMPLE_ADDRESS.lat, lng: SAMPLE_ADDRESS.lng };

/** What the rider app shows for a job. */
const RIDER_JOB = {
  id: JOB_ID,
  jobType: 'PICKUP',
  status: 'ACCEPTED',
  order: { id: ID.order, orderNo: 'DHB-LHR-000123', status: 'ACCEPTED' },
  scheduledStart: '2026-10-24T05:00:00.000Z',
  scheduledEnd: '2026-10-24T06:00:00.000Z',
  riderFee: '80.00',
  currency: 'PKR',
  from: HOME,
  to: SHOP,
  offerExpiresAt: null,
  proof: { required: false, types: ['PHOTO'], used: null },
  failureReason: null,
  startedAt: null,
  completedAt: null,
  nextActions: ['IN_TRANSIT', 'UNASSIGNED', 'FAILED'],
};

const JOB_PARAM = { id: { example: JOB_ID, description: 'Delivery job id (from `GET /rider/jobs` or `/rider/jobs/available`)' } };
const NOT_YOURS = { status: 404, code: 'NOT_FOUND', when: 'Delivery job not found (jobs held by other riders are never visible).' };
const WRONG_STATE = (when: string) => ({ status: 409, code: 'JOB_INVALID_TRANSITION', when });

/** What support sees on the dispatch board. */
const ADMIN_JOB = {
  id: JOB_ID,
  jobType: 'PICKUP',
  status: 'UNASSIGNED',
  order: { id: ID.order, orderNo: 'DHB-LHR-000123', status: 'ACCEPTED', cityId: 1 },
  rider: null,
  partnerId: null,
  partnerRef: null,
  scheduledStart: '2026-10-24T05:00:00.000Z',
  scheduledEnd: '2026-10-24T06:00:00.000Z',
  riderFee: '80.00',
  from: HOME,
  to: SHOP,
  dispatchAttempts: 2,
  declinedBy: 1,
  unassignedAlertedAt: null,
  failureReason: null,
  proofType: null,
  assignedAt: null,
  startedAt: null,
  completedAt: null,
  createdAt: '2026-10-23T10:00:00.000Z',
  nextActions: ['ASSIGNED', 'ACCEPTED', 'FAILED', 'CANCELLED'],
};

const ADMIN_DECISION = { id: RIDER_ID, status: 'APPROVED', isOnline: false, rejectionReason: null, approvedAt: '2026-10-23T09:00:00.000Z' };

export const riderDocs: OperationDocs = {
  'POST /rider/register': {
    summary: 'Apply to ride',
    tag: 'rider',
    who: [...RIDER],
    description:
      'Sign in with role `RIDER`, upload a profile photo (`POST /media/sign` with `kind: "rider-photo"`), then send its `public_id` here. ' +
      'The CNIC is stored encrypted. The account stays **PENDING** until an admin approves it; a **rejected** rider fixes the details and calls this again.',
    requests: {
      default: { summary: 'New rider', value: { name: 'Bilal Ahmed', cnic: '35202-1234567-1', cityId: 1, photoPublicId: 'dhoblio/development/riders/3f6c1f0e-8c1a-4a53-9f55-6a1c1c0b2a01/face' } },
    },
    response: { status: 201, description: 'Application received', example: ok({ id: RIDER_ID, status: 'PENDING', cityId: 1, createdAt: '2026-10-23T08:00:00.000Z' }) },
    errors: [
      { status: 400, code: 'INVALID_CNIC', when: 'Enter a valid 13-digit CNIC.' },
      { status: 400, code: 'CITY_NOT_AVAILABLE', when: 'We do not serve this city yet.' },
      { status: 400, code: 'MEDIA_INVALID_ASSET', when: 'The photo was not found, or is not in your own upload folder.' },
      { status: 409, code: 'RIDER_ALREADY_REGISTERED', when: 'This account already has a rider registration.' },
      { status: 409, code: 'DUPLICATE_CNIC', when: 'A rider with this CNIC is already registered.' },
    ],
  },
  'GET /rider/status': {
    summary: 'My application status',
    tag: 'rider',
    who: [...RIDER],
    description: 'Works for every rider, including those still waiting for review, rejected or suspended. Shows the rejection or suspension reason.',
    response: { example: ok({ id: RIDER_ID, status: 'PENDING', rejectionReason: null, createdAt: '2026-10-23T08:00:00.000Z', approvedAt: null }) },
    errors: [{ status: 404, code: 'RIDER_NOT_REGISTERED', when: 'No rider account is linked to this user (call register first).' }],
  },
  'GET /rider/me': {
    summary: 'My rider profile',
    tag: 'rider',
    who: [...RIDER],
    description: 'Status, whether you are online, how many jobs you hold (and the limit) and today’s earnings.',
    response: {
      example: ok({
        id: RIDER_ID,
        status: 'APPROVED',
        cityId: 1,
        isOnline: true,
        photoUrl: 'https://res.cloudinary.com/demo/image/upload/rider.jpg',
        rejectionReason: null,
        approvedAt: '2026-10-23T09:00:00.000Z',
        lastSeenAt: '2026-10-23T10:00:00.000Z',
        name: 'Bilal Ahmed',
        phone: '+923001112233',
        activeJobs: 1,
        maxActiveJobs: 3,
        today: { day: '2026-10-23', jobs: 2, earned: '200.00' },
      }),
    },
    errors: [
      { status: 403, code: 'RIDER_NOT_REGISTERED', when: 'No rider account is linked to this user.' },
      { status: 403, code: 'RIDER_NOT_ACTIVE', when: 'The account is pending, rejected or suspended.' },
    ],
  },
  'POST /rider/online': {
    summary: 'Go online',
    tag: 'rider',
    who: [...RIDER],
    description: 'Start taking work. Send your current position so you can be found straight away. Then keep sending it with **Update my location**.',
    requests: { default: { summary: 'Outside Model Town, Lahore', value: { lat: 31.521, lng: 74.359 } } },
    response: { example: ok({ isOnline: true }) },
    errors: [
      { status: 400, code: 'LOCATION_OUT_OF_RANGE', when: 'The location must be inside Pakistan.' },
      { status: 403, code: 'RIDER_NOT_ACTIVE', when: 'Only approved riders can go online.' },
    ],
  },
  'POST /rider/offline': {
    summary: 'Go offline',
    tag: 'rider',
    who: [...RIDER],
    description: 'Stop being offered jobs. Jobs you already hold stay yours.',
    response: { example: ok({ isOnline: false }) },
    errors: [{ status: 403, code: 'RIDER_NOT_ACTIVE', when: 'Only approved riders can change availability.' }],
  },
  'POST /rider/location': {
    summary: 'Update my location',
    tag: 'rider',
    who: [...RIDER],
    description: 'Send every 20–30 seconds while online. If the pings stop for about 2 minutes you stop being offered new jobs, even if you forgot to go offline. Customers see this position while you are on your way to them.',
    requests: { default: { summary: 'Moving', value: { lat: 31.5225, lng: 74.3601 } } },
    response: { example: ok({ ok: true }) },
    errors: [
      { status: 400, code: 'LOCATION_OUT_OF_RANGE', when: 'The location must be inside Pakistan.' },
      { status: 409, code: 'RIDER_OFFLINE', when: 'Go online first.' },
    ],
  },
  'GET /rider/jobs/available': {
    summary: 'Jobs I can take',
    tag: 'rider',
    who: [...RIDER],
    description:
      'Manual mode: jobs in your city that nobody holds yet and whose time window is near (within an hour or so), nearest first. Take one with **Claim a job**. ' +
      'Customer and shop phone numbers are partly hidden. Jobs you turned down are not shown.',
    params: { limit: { example: 20, description: 'How many to return, 1 to 50 (default 20).' } },
    response: { example: ok([{ ...RIDER_JOB, status: 'UNASSIGNED', distanceKm: 1.4, nextActions: ['ASSIGNED', 'ACCEPTED'] }]) },
    errors: [{ status: 403, code: 'RIDER_NOT_ACTIVE', when: 'Only approved riders can see jobs.' }],
  },
  'GET /rider/jobs': {
    summary: 'My jobs',
    tag: 'rider',
    who: [...RIDER],
    description: '`view=active` (default): jobs offered to you, accepted or in progress, soonest first. `view=history`: finished, failed and cancelled jobs, newest first, paged with `meta.nextCursor`.',
    params: { ...PAGING_PARAMS, view: { example: 'active', description: '`active` (default) or `history`.' } },
    response: { example: page([RIDER_JOB], null) },
    errors: [{ status: 403, code: 'RIDER_NOT_ACTIVE', when: 'Only approved riders can see their jobs.' }],
  },
  'GET /rider/jobs/{id}': {
    summary: 'One job',
    tag: 'rider',
    who: [...RIDER],
    description: 'Where to collect and where to take it, the time window, your fee, what proof is needed and the steps you can take next (`nextActions`).',
    params: JOB_PARAM,
    response: { example: ok(RIDER_JOB) },
    errors: [NOT_YOURS],
  },
  'POST /rider/jobs/{id}/claim': {
    summary: 'Claim a job',
    tag: 'rider',
    who: [...RIDER],
    description: 'Take an unassigned job from **Jobs I can take**. If several riders claim at once, exactly one gets it and the rest receive `JOB_ALREADY_TAKEN`. You must be online and below your job limit.',
    params: JOB_PARAM,
    response: { example: ok(RIDER_JOB) },
    errors: [
      NOT_YOURS,
      { status: 409, code: 'JOB_ALREADY_TAKEN', when: 'Another rider took this job first.' },
      { status: 409, code: 'JOB_NOT_AVAILABLE', when: 'You gave this job back, so it is not available to you.' },
      { status: 409, code: 'RIDER_OFFLINE', when: 'Go online to take jobs.' },
      { status: 409, code: 'RIDER_BUSY', when: 'You already have the maximum number of active jobs.' },
    ],
  },
  'POST /rider/jobs/{id}/accept': {
    summary: 'Accept an offered job',
    tag: 'rider',
    who: [...RIDER],
    description: 'When dispatch offers you a job (you get a notification) you have about 90 seconds to accept. After that it goes to the next rider. The customer is told who is coming.',
    params: JOB_PARAM,
    response: { example: ok(RIDER_JOB) },
    errors: [NOT_YOURS, WRONG_STATE('This job is unassigned now, so it cannot become accepted (the offer lapsed).')],
  },
  'POST /rider/jobs/{id}/decline': {
    summary: 'Turn down an offered job',
    tag: 'rider',
    who: [...RIDER],
    description: 'The job goes to the next rider and is never offered to you again. Declining has no penalty.',
    params: JOB_PARAM,
    requests: { default: { summary: 'Too far', value: { reason: 'Too far from where I am' } } },
    response: { example: ok({ id: JOB_ID, status: 'UNASSIGNED' }) },
    errors: [NOT_YOURS, WRONG_STATE('A accepted job cannot become unassigned (use release).')],
  },
  'POST /rider/jobs/{id}/release': {
    summary: 'Give back an accepted job',
    tag: 'rider',
    who: [...RIDER],
    description: 'Only before you set out. A reason is required and ops is told, so use it only when you really cannot do the job.',
    params: JOB_PARAM,
    requests: { default: { summary: 'Breakdown', value: { reason: 'My bike broke down' } } },
    response: { example: ok({ id: JOB_ID, status: 'UNASSIGNED' }) },
    errors: [NOT_YOURS, WRONG_STATE('A in_transit job cannot become unassigned. Report a failure instead.')],
  },
  'POST /rider/jobs/{id}/start': {
    summary: 'Set out',
    tag: 'rider',
    who: [...RIDER],
    description:
      'Tap when you leave. For a **delivery**, this tells the customer the order is on its way (`OUT_FOR_DELIVERY`) and sends them a 4-digit delivery code — you will need it to finish.',
    params: JOB_PARAM,
    response: { example: ok({ ...RIDER_JOB, status: 'IN_TRANSIT', startedAt: '2026-10-24T04:45:00.000Z', nextActions: ['COMPLETED', 'FAILED'] }) },
    errors: [NOT_YOURS, WRONG_STATE('This job is unassigned now, so it cannot become in_transit.')],
  },
  'POST /rider/jobs/{id}/complete': {
    summary: 'Finish the job',
    tag: 'rider',
    who: [...RIDER],
    description:
      '**Pickup**: send nothing. The order becomes `PICKED_UP`.\n\n' +
      '**Delivery**: send the customer’s 4-digit `otp`, **or** a `proofPhotoPublicId` (upload with `POST /media/sign`, `kind: "delivery-proof"`) if the code cannot be used. The order becomes `DELIVERED`.\n\n' +
      'Five wrong codes lock the code for that job (use the photo, or ask support).',
    params: JOB_PARAM,
    requests: {
      otp: { summary: 'Delivery with the customer’s code', value: { otp: '4821' } },
      photo: { summary: 'Delivery with a proof photo', value: { proofPhotoPublicId: 'dhoblio/development/proof/3f6c1f0e-8c1a-4a53-9f55-6a1c1c0b2a01/doorstep' } },
      pickup: { summary: 'Pickup (nothing needed)', value: {} },
    },
    response: { example: ok({ ...RIDER_JOB, jobType: 'DROP', status: 'COMPLETED', startedAt: '2026-10-26T05:30:00.000Z', completedAt: '2026-10-26T06:10:00.000Z', nextActions: [], proof: { required: true, types: ['OTP', 'PHOTO'], used: 'OTP' } }) },
    errors: [
      NOT_YOURS,
      WRONG_STATE('A accepted job cannot be completed (set out first).'),
      { status: 400, code: 'PROOF_REQUIRED', when: 'Enter the customer’s delivery code or upload a photo as proof.' },
      { status: 400, code: 'PROOF_NOT_NEEDED', when: 'A delivery code is only used when delivering to the customer.' },
      { status: 400, code: 'INVALID_DELIVERY_OTP', when: 'That code is not right. (`details.attemptsLeft` tells how many tries remain.)' },
      { status: 400, code: 'DELIVERY_OTP_EXPIRED', when: 'This delivery code has expired. Ask the customer to request a new one.' },
      { status: 400, code: 'MEDIA_INVALID_ASSET', when: 'The photo was not found, or is not in your own proof folder.' },
      { status: 409, code: 'DELIVERY_OTP_NOT_ISSUED', when: 'No delivery code has been sent for this job yet.' },
      { status: 429, code: 'DELIVERY_OTP_LOCKED', when: 'Too many wrong codes. Use a proof photo, or ask support.' },
    ],
  },
  'POST /rider/jobs/{id}/fail': {
    summary: 'Report that I could not do it',
    tag: 'rider',
    who: [...RIDER],
    description: 'Customer unreachable, wrong address, shop closed… A reason is required. Support is alerted and decides what happens next; the order is left as it is.',
    params: JOB_PARAM,
    requests: { default: { summary: 'Customer unreachable', value: { reason: 'Customer did not answer after 3 calls' } } },
    response: { example: ok({ ...RIDER_JOB, status: 'FAILED', failureReason: 'Customer did not answer after 3 calls', nextActions: [] }) },
    errors: [NOT_YOURS, WRONG_STATE('A unassigned job cannot become failed.')],
  },
  'GET /rider/earnings': {
    summary: 'My earnings',
    tag: 'rider',
    who: [...RIDER],
    description: 'Completed jobs and what they paid, per day on the city’s calendar. Defaults to the last 7 days; at most 92 days at a time. Suspended riders can still read their earnings.',
    params: { from: { example: '2026-10-17', description: 'First day, YYYY-MM-DD.' }, to: { example: '2026-10-23', description: 'Last day, YYYY-MM-DD.' } },
    response: { example: ok({ from: '2026-10-17', to: '2026-10-23', currency: 'PKR', days: [{ day: '2026-10-23', jobs: 2, earned: '200.00' }], totals: { jobs: 2, earned: '200.00' } }) },
    errors: [{ status: 400, code: 'INVALID_RANGE', when: '`from` must not be after `to`, and the range at most 92 days.' }],
  },
};

export const customerDeliveryDocs: OperationDocs = {
  'GET /orders/{id}/delivery': {
    summary: 'Who is picking up / delivering my order',
    tag: 'orders',
    who: ['CUSTOMER'],
    description: 'The pickup and delivery legs with status, window and — once someone has taken the job — the rider’s **name and photo** (never a phone number). `handledBy` is `RIDER` or `COURIER_PARTNER`.',
    params: { id: { example: ID.order, description: 'Order id' } },
    response: {
      example: ok([
        { id: JOB_ID, jobType: 'PICKUP', status: 'COMPLETED', scheduledStart: '2026-10-24T05:00:00.000Z', scheduledEnd: '2026-10-24T06:00:00.000Z', startedAt: '2026-10-24T04:50:00.000Z', completedAt: '2026-10-24T05:20:00.000Z', handledBy: 'RIDER', rider: { name: 'Bilal Ahmed', photoUrl: 'https://res.cloudinary.com/demo/image/upload/rider.jpg' } },
        { id: ID.request, jobType: 'DROP', status: 'UNASSIGNED', scheduledStart: '2026-10-26T06:00:00.000Z', scheduledEnd: '2026-10-26T07:00:00.000Z', startedAt: null, completedAt: null, handledBy: null, rider: null },
      ]),
    },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Order not found (other customers’ orders are never visible).' }],
  },
  'GET /orders/{id}/rider-location': {
    summary: 'Where is my rider?',
    tag: 'orders',
    who: ['CUSTOMER'],
    description: 'The rider’s latest position, **only while they are on the way** to you or with your clothes. Refresh every 15–30 seconds. `404` at any other time.',
    params: { id: { example: ID.order, description: 'Order id' } },
    response: { example: ok({ jobType: 'DROP', lat: 31.5225, lng: 74.3601, updatedAt: '2026-10-26T05:40:12.000Z' }) },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'The rider is not on the way right now (or the order is not yours).' },
      { status: 404, code: 'TRACKING_DISABLED', when: 'Live rider tracking is turned off.' },
    ],
  },
  'POST /orders/{id}/delivery-code/resend': {
    summary: 'Send me a new delivery code',
    tag: 'orders',
    who: ['CUSTOMER'],
    description: 'While your order is out for delivery. The new code is sent by WhatsApp/SMS and the old one stops working. Limited to 3 per hour per order.',
    params: { id: { example: ID.order, description: 'Order id' } },
    response: { example: ok({ sent: true }) },
    errors: [
      { status: 409, code: 'NO_DELIVERY_IN_PROGRESS', when: 'Your order is not out for delivery right now.' },
      { status: 429, code: 'RATE_LIMITED', when: 'Too many requests. Try again later.' },
    ],
  },
};

export const adminDeliveryDocs: OperationDocs = {
  'GET /admin/riders': {
    summary: 'Rider applications and roster',
    tag: 'admin-riders',
    who: [...ADMIN],
    description: 'Oldest first, so applicants are served in the order they applied. Filter by status, city, or name / phone. Page with `meta.nextCursor`.',
    params: { ...PAGING_PARAMS, status: { example: 'PENDING' }, cityId: { example: 1 }, q: { example: 'bilal' } },
    response: { example: page([{ id: RIDER_ID, status: 'PENDING', cityId: 1, isOnline: false, createdAt: '2026-10-23T08:00:00.000Z', user: { name: 'Bilal Ahmed', phone: '+923001112233' } }], null) },
  },
  'GET /admin/riders/{id}': {
    summary: 'Review one rider',
    tag: 'admin-riders',
    who: [...ADMIN],
    description: 'Profile with a **masked** CNIC and job counts. The full CNIC is a separate, audited call.',
    params: { id: { example: RIDER_ID, description: 'Rider id' } },
    response: {
      example: ok({
        id: RIDER_ID,
        userId: ID.user,
        cityId: 1,
        status: 'PENDING',
        photoUrl: 'https://res.cloudinary.com/demo/image/upload/rider.jpg',
        isOnline: false,
        lastLat: null,
        lastLng: null,
        lastSeenAt: null,
        approvedAt: null,
        approvedById: null,
        rejectionReason: null,
        createdAt: '2026-10-23T08:00:00.000Z',
        updatedAt: '2026-10-23T08:00:00.000Z',
        user: { id: ID.user, name: 'Bilal Ahmed', phone: '+923001112233', email: null },
        cnicMasked: '*********4567',
        completedJobs: 0,
        activeJobs: 0,
      }),
    },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Rider not found.' }],
  },
  'GET /admin/riders/{id}/cnic': {
    summary: 'Reveal a rider’s full CNIC',
    tag: 'admin-riders',
    who: [...ADMIN],
    description: '**Every call is written to the audit log.** Use only when verifying an application.',
    params: { id: { example: RIDER_ID, description: 'Rider id' } },
    response: { example: ok({ cnic: '35202-1234567-1' }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Rider not found.' }],
  },
  'POST /admin/riders/{id}/approve': {
    summary: 'Approve a rider',
    tag: 'admin-riders',
    who: [...ADMIN],
    description: 'The rider can then go online and take jobs. They are told by SMS.',
    params: { id: { example: RIDER_ID, description: 'Rider id' } },
    response: { example: ok(ADMIN_DECISION) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Rider not found.' }, { status: 409, code: 'RIDER_INVALID_TRANSITION', when: 'A approved rider cannot be moved to approved.' }],
  },
  'POST /admin/riders/{id}/reject': {
    summary: 'Reject an application',
    tag: 'admin-riders',
    who: [...ADMIN],
    description: 'A reason is required and is sent to the rider, who can fix the details and apply again.',
    params: { id: { example: RIDER_ID, description: 'Rider id' } },
    requests: { default: { summary: 'Blurry photo', value: { reason: 'Photo is blurry — please upload a clear one' } } },
    response: { example: ok({ ...ADMIN_DECISION, status: 'REJECTED', rejectionReason: 'Photo is blurry — please upload a clear one', approvedAt: null }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Rider not found.' }, { status: 409, code: 'RIDER_INVALID_TRANSITION', when: 'A approved rider cannot be moved to rejected.' }],
  },
  'POST /admin/riders/{id}/suspend': {
    summary: 'Suspend a rider',
    tag: 'admin-riders',
    who: [...ADMIN],
    description: 'The rider goes offline immediately and their jobs that have not started go back to dispatch. A delivery already in progress is flagged to ops instead.',
    params: { id: { example: RIDER_ID, description: 'Rider id' } },
    requests: { default: { summary: 'Complaints', value: { reason: 'Repeated customer complaints' } } },
    response: { example: ok({ ...ADMIN_DECISION, status: 'SUSPENDED', rejectionReason: 'Repeated customer complaints' }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Rider not found.' }, { status: 409, code: 'RIDER_INVALID_TRANSITION', when: 'A pending rider cannot be moved to suspended.' }],
  },
  'POST /admin/riders/{id}/reactivate': {
    summary: 'Reactivate a rider',
    tag: 'admin-riders',
    who: [...ADMIN],
    description: 'Back to approved but **offline**: the rider chooses when to start again.',
    params: { id: { example: RIDER_ID, description: 'Rider id' } },
    response: { example: ok(ADMIN_DECISION) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Rider not found.' }, { status: 409, code: 'RIDER_INVALID_TRANSITION', when: 'A approved rider cannot be moved to approved.' }],
  },
  'GET /admin/delivery/summary': {
    summary: 'Dispatch board numbers',
    tag: 'admin-delivery',
    who: [...ADMIN],
    description: 'Job counts by status, how many need attention (failed jobs and jobs nobody could take) and how many riders are online. Optionally for one city.',
    params: { cityId: { example: 1, description: 'Only this city.' } },
    response: { example: ok({ jobs: { UNASSIGNED: 2, ASSIGNED: 1, ACCEPTED: 3, IN_TRANSIT: 1, COMPLETED: 40, FAILED: 0, CANCELLED: 4 }, needAttention: 0, onlineRiders: 6 }) },
  },
  'GET /admin/delivery/jobs': {
    summary: 'Delivery jobs',
    tag: 'admin-delivery',
    who: [...ADMIN],
    description: 'Oldest first. For what needs a human, try `status=UNASSIGNED,FAILED`. Each job lists the actions an admin can take next.',
    params: {
      ...PAGING_PARAMS,
      status: { example: 'UNASSIGNED,FAILED', description: 'Comma separated.' },
      jobType: { example: 'PICKUP', description: '`PICKUP` or `DROP`.' },
      cityId: { example: 1 },
      riderId: { example: RIDER_ID },
      orderNo: { example: 'LHR-000123' },
      scheduledBefore: { example: '2026-10-24T12:00:00.000Z', description: 'Only jobs whose window starts before this time.' },
    },
    response: { example: page([{ ...ADMIN_JOB, status: 'ACCEPTED', rider: { id: RIDER_ID, name: 'Bilal Ahmed', phone: '+923001112233' }, assignedAt: '2026-10-24T03:00:00.000Z', nextActions: ['UNASSIGNED', 'IN_TRANSIT', 'FAILED', 'CANCELLED'] }], null) },
  },
  'GET /admin/delivery/jobs/{id}': {
    summary: 'One delivery job',
    tag: 'admin-delivery',
    who: [...ADMIN],
    description: 'Everything about the job, including how often dispatch tried, who declined, the courier partner and the proof photo link if there is one.',
    params: { id: { example: JOB_ID, description: 'Delivery job id' } },
    response: { example: ok({ ...ADMIN_JOB, partner: null, proofPhotoUrl: null, declinedRiderIds: [RIDER_ID] }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Delivery job not found.' }],
  },
  'POST /admin/delivery/jobs/{id}/assign': {
    summary: 'Give a job to a rider',
    tag: 'admin-delivery',
    who: [...ADMIN],
    description: 'Force-assign: no offer, the rider simply holds the job (and is told). Whoever had it loses it and is told. The rider must be approved and work in the order’s city. Audited.',
    params: { id: { example: JOB_ID, description: 'Delivery job id' } },
    requests: { default: { summary: 'Assign to Bilal', value: { riderId: RIDER_ID } } },
    response: { example: ok({ ...ADMIN_JOB, status: 'ACCEPTED', rider: { id: RIDER_ID, name: 'Bilal Ahmed', phone: '+923001112233' }, partner: null, proofPhotoUrl: null, declinedRiderIds: [], nextActions: ['UNASSIGNED', 'IN_TRANSIT', 'FAILED', 'CANCELLED'] }) },
    errors: [
      { status: 404, code: 'NOT_FOUND', when: 'Delivery job not found.' },
      { status: 409, code: 'JOB_INVALID_TRANSITION', when: 'A completed job cannot be reassigned.' },
      { status: 409, code: 'RIDER_NOT_ACTIVE', when: 'That rider is not an approved rider.' },
      { status: 409, code: 'RIDER_WRONG_CITY', when: 'That rider works in a different city.' },
    ],
  },
  'POST /admin/delivery/jobs/{id}/unassign': {
    summary: 'Take a job back',
    tag: 'admin-delivery',
    who: [...ADMIN],
    description: 'Removes the job from its rider and puts it back in the pool for dispatch. That rider is not offered it again.',
    params: { id: { example: JOB_ID, description: 'Delivery job id' } },
    response: { example: ok({ ...ADMIN_JOB, partner: null, proofPhotoUrl: null, declinedRiderIds: [RIDER_ID] }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Delivery job not found.' }, { status: 409, code: 'JOB_INVALID_TRANSITION', when: 'A completed job cannot be reassigned.' }],
  },
  'POST /admin/delivery/jobs/{id}/fail': {
    summary: 'Mark a job as failed',
    tag: 'admin-delivery',
    who: [...ADMIN],
    description: 'When the job cannot be done at all. A reason is required. Use **Send it out again** afterwards to try once more.',
    params: { id: { example: JOB_ID, description: 'Delivery job id' } },
    requests: { default: { summary: 'Customer moved', value: { reason: 'Customer moved away' } } },
    response: { example: ok({ ...ADMIN_JOB, status: 'FAILED', failureReason: 'Customer moved away', partner: null, proofPhotoUrl: null, declinedRiderIds: [], nextActions: ['UNASSIGNED', 'CANCELLED'] }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Delivery job not found.' }, { status: 409, code: 'JOB_INVALID_TRANSITION', when: 'A completed job cannot become failed.' }],
  },
  'POST /admin/delivery/jobs/{id}/redispatch': {
    summary: 'Send a job out again',
    tag: 'admin-delivery',
    who: [...ADMIN],
    description: 'Resets the search (attempt count, ops alert) and starts looking for a rider again — also for a failed job. Does not clear the list of riders who declined.',
    params: { id: { example: JOB_ID, description: 'Delivery job id' } },
    response: { example: ok({ ...ADMIN_JOB, dispatchAttempts: 0, partner: null, proofPhotoUrl: null, declinedRiderIds: [RIDER_ID] }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Delivery job not found.' }, { status: 409, code: 'JOB_INVALID_TRANSITION', when: 'A completed job cannot be sent out again.' }],
  },
  'GET /admin/courier-partners': {
    summary: 'Courier partners',
    tag: 'admin-delivery',
    who: [...ADMIN],
    description: 'Companies that can do pickups and deliveries instead of our own riders, and the cities currently using each. Choose a city’s partner with **City settings** (`courierPartnerId`).',
    response: { example: ok([{ id: PARTNER_ID, code: 'mock', name: 'Mock courier (testing)', isActive: false, cities: [] }]) },
  },
  'PATCH /admin/courier-partners/{id}': {
    summary: 'Switch a courier partner on or off',
    tag: 'admin-delivery',
    who: [...ADMIN],
    description: 'A partner only receives jobs while it is **on** and assigned to the order’s city. Switching it off sends new jobs to our own riders. Audited.',
    params: { id: { example: PARTNER_ID, description: 'Courier partner id' } },
    requests: { default: { summary: 'Turn on', value: { isActive: true } } },
    response: { example: ok({ id: PARTNER_ID, code: 'mock', name: 'Mock courier (testing)', isActive: true }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Courier partner not found.' }],
  },
};

export const webhookDocs: OperationDocs = {
  'POST /webhooks/courier/{code}': {
    summary: 'Courier partner status update',
    tag: 'webhooks',
    who: 'public',
    description:
      'Called **by the courier company**, not by an app. No login: each call carries a signature in the `x-courier-signature` header (for the mock partner: HMAC-SHA256 of `eventId.trackingRef.status` with the shared secret).\n\n' +
      '`status` is `IN_TRANSIT`, `COMPLETED` or `FAILED`. Every call needs a unique `eventId`; **sending the same `eventId` again is safe** and changes nothing (`duplicate: true`), so partners can retry freely. ' +
      'If we cannot apply an update, it is refused and not remembered, so the same call can be retried later.',
    params: { code: { example: 'mock', description: 'The partner’s code (see `GET /admin/courier-partners`).' } },
    requests: { default: { summary: 'Picked up and on the way', value: { eventId: 'evt-20261024-0001', trackingRef: 'MOCK-2E8F4C6B', status: 'IN_TRANSIT' } }, failed: { summary: 'Could not deliver', value: { eventId: 'evt-20261024-0002', trackingRef: 'MOCK-2E8F4C6B', status: 'FAILED', reason: 'Nobody home' } } },
    response: { description: 'Accepted', example: ok({ duplicate: false }) },
    errors: [
      { status: 401, code: 'UNAUTHENTICATED', when: 'Invalid webhook signature.' },
      { status: 404, code: 'NOT_FOUND', when: 'Unknown courier partner, or no job with that tracking reference.' },
      { status: 409, code: 'JOB_INVALID_TRANSITION', when: 'The job is in a state where this update makes no sense (for example it already completed).' },
    ],
  },
};
