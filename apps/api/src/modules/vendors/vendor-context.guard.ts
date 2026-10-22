import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VendorStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { VENDOR_STATUS_KEY, VendorRequest } from './vendor-context';

/**
 * Use with @UseGuards on vendor-panel handlers (after the global auth guards). Finds the vendor the user owns
 * or works for and enforces @RequireVendorStatus, so a vendor can only ever touch its own data and
 * PENDING / REJECTED / SUSPENDED vendors can't act as live ones.
 */
@Injectable()
export class VendorContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<VendorRequest>();
    const user = req.user;
    if (!user) throw new AppException(ErrorCode.UNAUTHENTICATED, 'Authentication required.', HttpStatus.UNAUTHORIZED);

    const vendor = await this.prisma.vendor.findFirst({
      where: { OR: [{ ownerId: user.id }, { staff: { some: { userId: user.id } } }] },
      select: { id: true, status: true, ownerId: true },
    });
    if (!vendor) {
      throw new AppException('VENDOR_NOT_REGISTERED', 'No vendor account is linked to this user.', HttpStatus.FORBIDDEN);
    }

    const required = this.reflector.getAllAndOverride<VendorStatus[] | undefined>(VENDOR_STATUS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !required.includes(vendor.status)) {
      throw new AppException('VENDOR_NOT_ACTIVE', `This action needs an ${required.join(' / ').toLowerCase()} vendor account.`, HttpStatus.FORBIDDEN, {
        status: vendor.status,
      });
    }

    req.vendor = { ...vendor, memberRole: vendor.ownerId === user.id ? 'OWNER' : 'STAFF' };
    return true;
  }
}
