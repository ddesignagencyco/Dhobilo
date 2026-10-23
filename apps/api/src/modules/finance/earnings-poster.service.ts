import { Injectable, Logger } from '@nestjs/common';
import { LedgerType, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LedgerService } from './ledger.service';

/**
 * Credits vendors for delivered orders that were paid online (TRD §13.2). Cash orders are credited by the COD
 * settlement instead, when the rider's money reaches us. Safe to run any number of times for the same order.
 */
@Injectable()
export class EarningsPosterService {
  private readonly logger = new Logger(EarningsPosterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /** Posts the order's earning and commission if it is due. Returns whether anything was posted. */
  async postIfDue(orderId: string): Promise<boolean> {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true, paymentMethod: true, paymentStatus: true } });
    if (!o || o.status !== OrderStatus.DELIVERED || o.paymentMethod === PaymentMethod.COD || o.paymentStatus !== PaymentStatus.PAID) return false;
    return this.ledger.postEarnings(this.prisma, orderId);
  }

  /** Safety net for jobs that were lost: finds delivered, paid online orders with no earning posted. */
  async sweep(): Promise<number> {
    const missing = await this.prisma.order.findMany({
      where: { status: OrderStatus.DELIVERED, paymentMethod: { not: PaymentMethod.COD }, paymentStatus: PaymentStatus.PAID, ledger: { none: { type: LedgerType.ORDER_EARNING } } },
      orderBy: { deliveredAt: 'asc' },
      take: 200,
      select: { id: true },
    });
    let posted = 0;
    for (const { id } of missing) {
      try {
        if (await this.postIfDue(id)) posted++;
      } catch (err) {
        this.logger.error({ err, orderId: id }, 'Could not post an order’s earnings');
      }
    }
    return posted;
  }
}
