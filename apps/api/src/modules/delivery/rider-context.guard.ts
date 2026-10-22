import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RiderStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RIDER_STATUS_KEY, RiderRequest } from './rider-context';

/**
 * Use with @UseGuards on rider-app handlers (after the global auth guards). Finds the rider profile of the signed-in
 * user and enforces @RequireRiderStatus; handlers without one need an APPROVED rider, so pending, rejected and
 * suspended riders can't take work.
 */
@Injectable()
export class RiderContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RiderRequest>();
    const user = req.user;
    if (!user) throw new AppException(ErrorCode.UNAUTHENTICATED, 'Authentication required.', HttpStatus.UNAUTHORIZED);

    const rider = await this.prisma.rider.findUnique({
      where: { userId: user.id },
      select: { id: true, userId: true, cityId: true, status: true, isOnline: true, photoUrl: true, user: { select: { name: true } } },
    });
    if (!rider) throw new AppException('RIDER_NOT_REGISTERED', 'No rider account is linked to this user.', HttpStatus.FORBIDDEN);

    const required = this.reflector.getAllAndOverride<RiderStatus[] | undefined>(RIDER_STATUS_KEY, [context.getHandler(), context.getClass()]) ?? [
      RiderStatus.APPROVED,
    ];
    if (!required.includes(rider.status)) {
      throw new AppException('RIDER_NOT_ACTIVE', `This action needs an ${required.join(' / ').toLowerCase()} rider account.`, HttpStatus.FORBIDDEN, {
        status: rider.status,
      });
    }
    req.rider = { id: rider.id, userId: rider.userId, cityId: rider.cityId, status: rider.status, isOnline: rider.isOnline, name: rider.user.name, photoUrl: rider.photoUrl };
    return true;
  }
}
