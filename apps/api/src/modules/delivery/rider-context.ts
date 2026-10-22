import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { RiderStatus } from '@prisma/client';
import type { AuthedRequest } from '../../common/auth/auth-user';

/** The rider profile of the signed-in user, resolved by RiderContextGuard. */
export interface RiderContext {
  id: string;
  userId: string;
  cityId: number;
  status: RiderStatus;
  isOnline: boolean;
  /** Shown to customers. */
  name: string | null;
  photoUrl: string | null;
}

export type RiderRequest = AuthedRequest & { rider?: RiderContext };

export const RIDER_STATUS_KEY = 'riderStatuses';

/** Handler only runs while the rider is in one of these statuses (APPROVED for anything "live"). */
export const RequireRiderStatus = (...statuses: RiderStatus[]) => SetMetadata(RIDER_STATUS_KEY, statuses);

export const CurrentRider = createParamDecorator((_data: unknown, ctx: ExecutionContext): RiderContext => {
  return ctx.switchToHttp().getRequest<RiderRequest>().rider as RiderContext;
});
