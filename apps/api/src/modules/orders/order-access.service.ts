import { HttpStatus, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Who may look at one order: its customer, people who work for its vendor, and admins. Everyone else (and any
 * unknown id) gets the same 404, so order ids cannot be probed.
 */
@Injectable()
export class OrderAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanView(user: AuthUser, orderId: string): Promise<{ customerId: string; vendorId: string }> {
    const order = UUID.test(orderId)
      ? await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true, vendorId: true } })
      : null;
    if (order && (await this.allowed(user, order))) return order;
    throw new AppException(ErrorCode.NOT_FOUND, 'Order not found.', HttpStatus.NOT_FOUND);
  }

  private async allowed(user: AuthUser, order: { customerId: string; vendorId: string }): Promise<boolean> {
    switch (user.role) {
      case Role.ADMIN:
        return true;
      case Role.CUSTOMER:
        return order.customerId === user.id;
      case Role.VENDOR_OWNER:
      case Role.VENDOR_STAFF:
        return (
          (await this.prisma.vendor.count({
            where: { id: order.vendorId, OR: [{ ownerId: user.id }, { staff: { some: { userId: user.id } } }] },
          })) > 0
        );
      default:
        return false;
    }
  }
}
