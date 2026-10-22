import { Injectable } from '@nestjs/common';
import type { OwnershipResolver } from '../../common/decorators/owned-by.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Who may open an order: its customer. Vendor and rider access are added with the order lifecycle (Phase 4/5).
 * Runs before the route's ParseUUIDPipe, so it must tolerate junk ids itself.
 */
@Injectable()
export class OrderOwnership implements OwnershipResolver {
  constructor(private readonly prisma: PrismaService) {}

  async allowedUserIds(orderId: string): Promise<string[] | null> {
    if (!UUID.test(orderId)) return null;
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    return order ? [order.customerId] : null;
  }
}
