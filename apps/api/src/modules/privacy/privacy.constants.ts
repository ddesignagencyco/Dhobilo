import { ComplaintStatus, JobStatus, OrderStatus, PayoutStatus } from '@prisma/client';

/** Nightly (Pakistan time), just before the retention purge: anonymises accounts whose grace period is over. */
export const PROCESS_ACCOUNT_DELETIONS_JOB = 'process-account-deletions';
export const PROCESS_ACCOUNT_DELETIONS_CRON = '15 3 * * *';

/** MEDIA queue: removes one Cloudinary asset (CNIC, shop photos, rider photo, complaint photos) of a deleted account. */
export const DELETE_MEDIA_ASSET_JOB = 'delete-media-asset';

/** Shown in place of a deleted person's name (orders, reviews and complaints keep pointing at the anonymised row). */
export const DELETED_USER_NAME = 'Deleted user';

/** Fixed reason codes the app may send with a deletion request. Free text is not accepted: it would be personal data. */
export const DELETION_REASON_CODES = ['NOT_USING', 'PRIVACY', 'SWITCHING_SERVICE', 'BAD_EXPERIENCE', 'OTHER'] as const;

export const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.ACCEPTED,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_PROCESS,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
];
export const OPEN_COMPLAINT_STATUSES: ComplaintStatus[] = [ComplaintStatus.OPEN, ComplaintStatus.IN_REVIEW, ComplaintStatus.VENDOR_RESPONDED];
export const ACTIVE_JOB_STATUSES: JobStatus[] = [JobStatus.ASSIGNED, JobStatus.ACCEPTED, JobStatus.IN_TRANSIT];
export const PAYOUTS_IN_PROGRESS: PayoutStatus[] = [PayoutStatus.REQUESTED, PayoutStatus.APPROVED];
