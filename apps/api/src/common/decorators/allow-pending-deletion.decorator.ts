import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_DELETION_KEY = 'allowPendingDeletion';

/**
 * An account that asked to be deleted may sign in during the grace period, but only routes marked with this
 * decorator work for it (see where the deletion status and cancel endpoints live). Everything else answers
 * 403 ACCOUNT_PENDING_DELETION.
 */
export const AllowPendingDeletion = () => SetMetadata(ALLOW_PENDING_DELETION_KEY, true);
