import { HttpStatus, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { fmt, money } from '../../common/money/money';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { VendorOrdersQueryDto } from './dto/vendor-orders.dto';
import { OrderLifecycleService } from './lifecycle/order-lifecycle.service';
import { actorKindOf, nextStatuses } from './lifecycle/order-state-machine';

/** "+923001234567" -> "+92300***4567": enough to recognise, not enough to misuse. */
/** Online orders stay hidden from the vendor until they are paid. */
const VISIBLE: Prisma.OrderWhereInput = { vendorVisibleAt: { not: null } };

export const maskPhone = (phone: string) => (phone.length > 8 ? `${phone.slice(0, 6)}***${phone.slice(-4)}` : '***');

const boardSelect = {
  id: true,
  orderNo: true,
  status: true,
  placedAt: true,
  createdAt: true,
  vendorRespondBy: true,
  pickupSlotStart: true,
  pickupSlotEnd: true,
  deliverySlotStart: true,
  deliverySlotEnd: true,
  total: true,
  vendorEarning: true,
  paymentMethod: true,
  customer: { select: { name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

const detailSelect = {
  id: true,
  orderNo: true,
  status: true,
  placedAt: true,
  acceptedAt: true,
  pickedUpAt: true,
  readyAt: true,
  deliveredAt: true,
  vendorRespondBy: true,
  rejectionReason: true,
  cancelReason: true,
  customerNote: true,
  addressSnapshot: true,
  pickupSlotStart: true,
  pickupSlotEnd: true,
  deliverySlotStart: true,
  deliverySlotEnd: true,
  subtotal: true,
  discountTotal: true,
  deliveryFee: true,
  total: true,
  commissionRatePct: true,
  commissionAmount: true,
  vendorEarning: true,
  paymentMethod: true,
  paymentStatus: true,
  customer: { select: { name: true, phone: true } },
  items: { select: { id: true, name: true, nameUr: true, serviceType: true, unitPrice: true, qty: true, lineTotal: true } },
} satisfies Prisma.OrderSelect;

@Injectable()
export class VendorOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  /**
   * The order board. Waiting orders (PLACED only) come most-urgent first with no paging; everything else is
   * newest first with a cursor.
   */
  async list(vendorId: string, q: VendorOrdersQueryDto) {
    const limit = Math.min(q.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const onlyWaiting = q.status?.length === 1 && q.status[0] === OrderStatus.PLACED;
    const where: Prisma.OrderWhereInput = { vendorId, ...VISIBLE, ...(q.status?.length ? { status: { in: q.status } } : {}) };

    if (onlyWaiting) {
      const rows = await this.prisma.order.findMany({ where, orderBy: [{ vendorRespondBy: 'asc' }, { id: 'asc' }], take: 100, select: boardSelect });
      return { items: rows.map(toBoardRow), nextCursor: null };
    }
    const rows = await this.prisma.order.findMany({
      where: { ...where, ...beforeCursor(q.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: boardSelect,
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return { items: items.map(toBoardRow), nextCursor };
  }

  /** Orders per status, for the tabs on the board. Every status is present, zero or not. */
  async counts(vendorId: string) {
    const groups = await this.prisma.order.groupBy({ by: ['status'], where: { vendorId, ...VISIBLE }, _count: { _all: true } });
    const counts = Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const g of groups) counts[g.status] = g._count._all;
    return counts;
  }

  async detail(vendorId: string, orderId: string) {
    const order = await this.owned(vendorId, orderId, detailSelect);
    const history = await this.prisma.orderStatusHistory.findMany({ where: { orderId }, orderBy: { seq: 'asc' } });
    const { customer, items, ...rest } = order;
    return {
      ...rest,
      currency: 'PKR',
      customer: { name: customer.name, phone: maskPhone(customer.phone) },
      subtotal: fmt(money(order.subtotal)),
      discountTotal: fmt(money(order.discountTotal)),
      deliveryFee: fmt(money(order.deliveryFee)),
      total: fmt(money(order.total)),
      commissionRatePct: fmt(money(order.commissionRatePct)),
      commissionAmount: fmt(money(order.commissionAmount)),
      vendorEarning: fmt(money(order.vendorEarning)),
      items: items.map((i) => ({ ...i, unitPrice: fmt(money(i.unitPrice)), lineTotal: fmt(money(i.lineTotal)) })),
      /** What this vendor can do right now; drives the buttons. */
      nextActions: nextStatuses(order.status, 'VENDOR'),
      timeline: history.map((h) => ({ status: h.toStatus, from: h.fromStatus, at: h.createdAt, by: actorKindOf(h.actorRole), note: h.note })),
    };
  }

  accept(user: AuthUser, vendorId: string, orderId: string, requestId?: string) {
    return this.move(user, vendorId, orderId, OrderStatus.ACCEPTED, undefined, requestId);
  }

  reject(user: AuthUser, vendorId: string, orderId: string, reason: string, requestId?: string) {
    return this.move(user, vendorId, orderId, OrderStatus.REJECTED, reason, requestId);
  }

  advance(user: AuthUser, vendorId: string, orderId: string, status: OrderStatus, requestId?: string) {
    return this.move(user, vendorId, orderId, status, undefined, requestId);
  }

  private async move(user: AuthUser, vendorId: string, orderId: string, to: OrderStatus, reason: string | undefined, requestId?: string) {
    await this.owned(vendorId, orderId, { id: true });
    await this.lifecycle.transition(orderId, to, { kind: 'VENDOR', userId: user.id, role: user.role }, { reason, requestId });
    return this.detail(vendorId, orderId);
  }

  /** The order, only if it belongs to this vendor; otherwise 404 (never confirm other vendors' orders exist). */
  private async owned<S extends Prisma.OrderSelect>(vendorId: string, orderId: string, select: S) {
    const order = /^[0-9a-f-]{36}$/i.test(orderId) ? await this.prisma.order.findFirst({ where: { id: orderId, vendorId, ...VISIBLE }, select }) : null;
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, 'Order not found.', HttpStatus.NOT_FOUND);
    return order;
  }
}

function toBoardRow(o: Prisma.OrderGetPayload<{ select: typeof boardSelect }>) {
  const { _count, customer, createdAt: _createdAt, ...rest } = o;
  return {
    ...rest,
    customerName: customer.name,
    total: fmt(money(o.total)),
    vendorEarning: fmt(money(o.vendorEarning)),
    itemCount: _count.items,
    /** Only meaningful while PLACED: the deadline after which the order is auto-rejected. */
    respondBy: o.status === OrderStatus.PLACED ? o.vendorRespondBy : null,
  };
}
