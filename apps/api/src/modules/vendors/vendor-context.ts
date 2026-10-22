import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { VendorStatus } from '@prisma/client';
import type { AuthedRequest } from '../../common/auth/auth-user';

/** The vendor the signed-in user works for, resolved by VendorContextGuard. */
export interface VendorContext {
  id: string;
  status: VendorStatus;
  ownerId: string;
  /** OWNER = the account that registered the vendor; STAFF = invited by the owner. */
  memberRole: 'OWNER' | 'STAFF';
}

export type VendorRequest = AuthedRequest & { vendor?: VendorContext };

export const VENDOR_STATUS_KEY = 'vendorStatuses';

/** Handler only runs while the vendor is in one of these statuses (e.g. APPROVED for anything "live"). */
export const RequireVendorStatus = (...statuses: VendorStatus[]) => SetMetadata(VENDOR_STATUS_KEY, statuses);

export const CurrentVendor = createParamDecorator((_data: unknown, ctx: ExecutionContext): VendorContext => {
  return ctx.switchToHttp().getRequest<VendorRequest>().vendor as VendorContext;
});
