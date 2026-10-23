import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { fmt, money } from '../../common/money/money';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ListPaymentsQueryDto } from './dto/payments.dto';

const select = {
  id: true,
  method: true,
  gateway: true,
  gatewayRef: true,
  status: true,
  amount: true,
  attempt: true,
  failureReason: true,
  paidAt: true,
  refundedAmount: true,
  refundRef: true,
  refundedAt: true,
  expiresAt: true,
  createdAt: true,
  order: { select: { id: true, orderNo: true, status: true, paymentStatus: true, customer: { select: { id: true, name: true, phone: true } } } },
} satisfies Prisma.PaymentSelect;

type Row = Prisma.PaymentGetPayload<{ select: typeof select }>;

const view = (p: Row) => ({
  ...p,
  amount: fmt(money(p.amount)),
  refundedAmount: fmt(money(p.refundedAmount)),
  currency: 'PKR' as const,
});

/** Support's view of payments (FE-6.8). */
@Injectable()
export class PaymentsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListPaymentsQueryDto) {
    const limit = Math.min(q.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const rows = await this.prisma.payment.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.method ? { method: q.method } : {}),
        ...(q.orderNo ? { order: { orderNo: { contains: q.orderNo, mode: 'insensitive' as const } } } : {}),
        ...beforeCursor(q.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select,
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return { items: items.map(view), nextCursor };
  }

  /** One payment with every notification the gateway sent about it. */
  async detail(id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id }, select: { ...select, events: { orderBy: { createdAt: 'asc' }, select: { id: true, eventId: true, status: true, amount: true, note: true, processedAt: true, createdAt: true } } } });
    if (!p) throw new AppException(ErrorCode.NOT_FOUND, 'Payment not found.', HttpStatus.NOT_FOUND);
    const { events, ...rest } = p;
    return { ...view(rest), events: events.map((e) => ({ ...e, amount: e.amount ? fmt(money(e.amount)) : null })) };
  }
}
