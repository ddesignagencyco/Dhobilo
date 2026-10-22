import { HttpStatus, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { fmt, money } from '../../common/money/money';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminOrdersQueryDto } from './dto/vendor-orders.dto';
import { OrderLifecycleService } from './lifecycle/order-lifecycle.service';
import { actorKindOf, nextStatuses } from './lifecycle/order-state-machine';

/** Support tools (FE-4.8): find any order, see everything about it, and cancel it with a recorded reason. */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  async list(q: AdminOrdersQueryDto) {
    const limit = Math.min(q.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const rows = await this.prisma.order.findMany({
      where: {
        ...(q.status?.length ? { status: { in: q.status } } : {}),
        ...(q.vendorId ? { vendorId: q.vendorId } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
        ...(q.orderNo ? { orderNo: { contains: q.orderNo, mode: 'insensitive' as const } } : {}),
        ...beforeCursor(q.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        orderNo: true,
        status: true,
        total: true,
        paymentMethod: true,
        paymentStatus: true,
        placedAt: true,
        createdAt: true,
        vendor: { select: { id: true, businessName: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return { items: items.map(({ createdAt: _c, total, ...o }) => ({ ...o, total: fmt(money(total)) })), nextCursor };
  }

  async detail(orderId: string) {
    const order = /^[0-9a-f-]{36}$/i.test(orderId)
      ? await this.prisma.order.findUnique({
          where: { id: orderId },
          include: {
            vendor: { select: { id: true, businessName: true } },
            customer: { select: { id: true, name: true, phone: true } },
            items: true,
            history: { orderBy: { seq: 'asc' } },
            payments: true,
          },
        })
      : null;
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, 'Order not found.', HttpStatus.NOT_FOUND);

    const m = (v: Prisma.Decimal) => fmt(money(v));
    return {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      currency: 'PKR',
      vendor: order.vendor,
      customer: order.customer,
      addressSnapshot: order.addressSnapshot,
      pickupSlotStart: order.pickupSlotStart,
      pickupSlotEnd: order.pickupSlotEnd,
      deliverySlotStart: order.deliverySlotStart,
      deliverySlotEnd: order.deliverySlotEnd,
      subtotal: m(order.subtotal),
      discountTotal: m(order.discountTotal),
      deliveryFee: m(order.deliveryFee),
      total: m(order.total),
      commissionRatePct: m(order.commissionRatePct),
      commissionAmount: m(order.commissionAmount),
      vendorEarning: m(order.vendorEarning),
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      customerNote: order.customerNote,
      vendorRespondBy: order.vendorRespondBy,
      rejectionReason: order.rejectionReason,
      cancelReason: order.cancelReason,
      placedAt: order.placedAt,
      acceptedAt: order.acceptedAt,
      pickedUpAt: order.pickedUpAt,
      readyAt: order.readyAt,
      deliveredAt: order.deliveredAt,
      items: order.items.map((i) => ({ id: i.id, serviceItemId: i.serviceItemId, name: i.name, nameUr: i.nameUr, serviceType: i.serviceType, unitPrice: m(i.unitPrice), qty: i.qty, lineTotal: m(i.lineTotal) })),
      payments: order.payments.map((pay) => ({ id: pay.id, method: pay.method, gateway: pay.gateway, gatewayRef: pay.gatewayRef, amount: m(pay.amount), status: pay.status, createdAt: pay.createdAt })),
      nextActions: nextStatuses(order.status, 'ADMIN'),
      timeline: order.history.map((h) => ({ seq: h.seq, status: h.toStatus, from: h.fromStatus, at: h.createdAt, by: actorKindOf(h.actorRole), actorId: h.actorId, note: h.note })),
    };
  }

  async cancel(admin: AuthUser, orderId: string, reason: string, requestId?: string) {
    await this.lifecycle.transition(orderId, OrderStatus.CANCELLED, { kind: 'ADMIN', userId: admin.id, role: admin.role }, { reason, requestId });
    return this.detail(orderId);
  }
}
