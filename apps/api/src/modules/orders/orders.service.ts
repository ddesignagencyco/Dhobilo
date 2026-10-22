import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEvent, OrderPlacedEvent } from '../../common/events/domain-events';
import { haversineKm } from '../../common/geo/haversine';
import { fmt, parseMoney } from '../../common/money/money';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { Clock } from '../../common/time/clock';
import { localParts } from '../../common/time/zoned';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import { PricingService, QuotedVendor, mergeLines } from '../cart/pricing.service';
import { CommissionService } from '../finance/commission.service';
import { SlotsService } from '../slots/slots.service';
import { ListOrdersQueryDto, PlaceOrderDto } from './dto/orders.dto';
import { orderSelect, orderSummarySelect, toOrderSummary, toOrderView } from './order-view';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;
const PLACE_LIMIT = { limit: 10, windowSec: 60 } as const;

export function parseIdempotencyKey(header: string | undefined): string {
  if (!header) {
    throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'The Idempotency-Key header is required to place an order.', HttpStatus.BAD_REQUEST);
  }
  if (!IDEMPOTENCY_KEY.test(header)) {
    throw new AppException(ErrorCode.VALIDATION_FAILED, 'Idempotency-Key must be 8-100 letters, digits, - or _ (a UUID works).', HttpStatus.BAD_REQUEST);
  }
  return header;
}

/** Whether the vendor's own clock says "open" right now (weekday + minute inside a published opening window). */
export function withinOpeningHours(vendor: Pick<QuotedVendor, 'hours' | 'city'>, now: Date): boolean {
  const local = localParts(now, vendor.city.timezone);
  return vendor.hours.some((h) => h.dayOfWeek === local.dayOfWeek && h.opensAt <= local.minutes && local.minutes < h.closesAt);
}

export function orderNumber(city: { code: string | null; name: string }, seq: number): string {
  const code = (city.code ?? city.name.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase();
  return `DHB-${code}-${String(seq).padStart(6, '0')}`;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly commission: CommissionService,
    private readonly slots: SlotsService,
    private readonly limiter: RateLimiter,
    private readonly events: EventEmitter2,
    private readonly clock: Clock,
  ) {}

  /**
   * Places an order (FR-C5..C8). Safe to retry with the same Idempotency-Key: the original order comes back
   * (`replayed: true`) instead of a duplicate, even for simultaneous retries.
   */
  async place(user: AuthUser, idempotencyKey: string, dto: PlaceOrderDto, requestId?: string) {
    const replay = await this.findReplay(user.id, idempotencyKey, dto);
    if (replay) return { order: replay, replayed: true };

    await this.limiter.consume(`rl:order-place:user:${user.id}`, PLACE_LIMIT.limit, PLACE_LIMIT.windowSec);
    this.assertAcceptedRequest(dto);

    const address = await this.prisma.address.findFirst({ where: { id: dto.addressId, userId: user.id, deletedAt: null } });
    if (!address) throw new AppException('ADDRESS_NOT_FOUND', 'Choose one of your saved addresses.', HttpStatus.UNPROCESSABLE_ENTITY);

    const now = this.clock.now();
    const quote = await this.pricing.quote(this.prisma, dto.vendorId, dto.items);
    const vendor = quote.vendor;

    if (vendor.availability !== 'OPEN' || !withinOpeningHours(vendor, now)) {
      throw new AppException('VENDOR_UNAVAILABLE', 'This vendor is not taking orders right now.', HttpStatus.CONFLICT, {
        availability: vendor.availability,
        reason: vendor.availability !== 'OPEN' ? 'NOT_OPEN' : 'OUTSIDE_HOURS',
      });
    }
    const distanceKm = haversineKm(address.lat, address.lng, vendor.lat, vendor.lng);
    if (address.cityId !== vendor.cityId || distanceKm > vendor.serviceRadiusKm) {
      throw new AppException('OUT_OF_SERVICE_AREA', 'This vendor does not serve your address.', HttpStatus.UNPROCESSABLE_ENTITY, {
        distanceKm: Number(distanceKm.toFixed(1)),
        serviceRadiusKm: vendor.serviceRadiusKm,
      });
    }

    // The customer must have agreed to exactly this price (prices may have changed since the estimate).
    const expected = parseMoney(dto.expectedTotal)!;
    if (!expected.equals(quote.total)) {
      throw new AppException('PRICE_CHANGED', 'Prices changed since your estimate. Please review the new total.', HttpStatus.CONFLICT, {
        expectedTotal: fmt(expected),
        total: fmt(quote.total),
        subtotal: fmt(quote.subtotal),
        deliveryFee: fmt(quote.deliveryFee),
      });
    }

    const pickupStart = new Date(dto.pickupSlotStart);
    const deliveryStart = new Date(dto.deliverySlotStart);

    let created: { id: string; replayed?: boolean };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // One order at a time per vendor: slot capacity counts below stay correct under concurrency.
        await tx.$queryRaw`SELECT id FROM "Vendor" WHERE id = ${vendor.id}::uuid FOR UPDATE`;
        // A simultaneous retry with the same key may have just won; hand back its order rather than failing on the slot it took.
        const duplicate = await tx.order.findFirst({ where: { customerId: user.id, idempotencyKey }, select: { id: true } });
        if (duplicate) return { id: duplicate.id, replayed: true };
        const pickup = await this.slots.assertBookable(tx, vendor, 'pickup', pickupStart);
        const delivery = await this.slots.assertBookable(tx, vendor, 'delivery', deliveryStart, {
          pickupEnd: pickup.end,
          turnaroundHours: quote.maxTurnaroundHours,
        });

        const [{ orderSeq }] = await tx.$queryRaw<{ orderSeq: number }[]>`
          UPDATE "City" SET "orderSeq" = "orderSeq" + 1 WHERE id = ${vendor.cityId} RETURNING "orderSeq"`;
        const commission = await this.commission.compute(
          tx,
          vendor.id,
          quote.lines.map((l) => ({ categoryId: l.categoryId, lineTotal: l.lineTotal })),
          quote.discountTotal,
          now,
        );

        return tx.order.create({
          select: { id: true },
          data: {
            orderNo: orderNumber(vendor.city, orderSeq),
            idempotencyKey,
            customerId: user.id,
            vendorId: vendor.id,
            cityId: vendor.cityId,
            addressId: address.id,
            addressSnapshot: {
              label: address.label,
              line1: address.line1,
              line2: address.line2,
              area: address.area,
              cityId: address.cityId,
              lat: address.lat,
              lng: address.lng,
            },
            status: OrderStatus.PLACED,
            pickupSlotStart: pickup.start,
            pickupSlotEnd: pickup.end,
            deliverySlotStart: delivery.start,
            deliverySlotEnd: delivery.end,
            subtotal: quote.subtotal,
            discountTotal: quote.discountTotal,
            deliveryFee: quote.deliveryFee,
            total: quote.total,
            commissionRatePct: commission.ratePct,
            commissionAmount: commission.amount,
            vendorEarning: commission.vendorEarning,
            paymentMethod: PaymentMethod.COD,
            paymentStatus: PaymentStatus.COD_PENDING,
            customerNote: dto.customerNote,
            vendorRespondBy: new Date(now.getTime() + vendor.respondWithinMin * 60_000),
            items: {
              create: quote.lines.map((l) => ({
                serviceItemId: l.serviceItemId,
                name: l.name,
                nameUr: l.nameUr,
                serviceType: l.serviceType,
                unitPrice: l.unitPrice,
                qty: l.qty,
                lineTotal: l.lineTotal,
              })),
            },
            history: { create: { fromStatus: null, toStatus: OrderStatus.PLACED, actorId: user.id, actorRole: Role.CUSTOMER } },
            payments: { create: { method: PaymentMethod.COD, gateway: 'cod', amount: quote.total, status: PaymentStatus.COD_PENDING } },
          },
        });
      });
    } catch (err) {
      // Two simultaneous requests with the same key: the loser gets the winner's order.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && String(err.meta?.target).includes('idempotencyKey')) {
        const winner = await this.findReplay(user.id, idempotencyKey, dto);
        if (winner) return { order: winner, replayed: true };
      }
      throw err;
    }

    if (created.replayed) {
      const winner = await this.findReplay(user.id, idempotencyKey, dto);
      if (winner) return { order: winner, replayed: true };
    }

    await this.prisma.cart.deleteMany({ where: { customerId: user.id, vendorId: vendor.id } });
    await this.events.emitAsync(DomainEvent.ORDER_PLACED, {
      orderId: created.id,
      vendorId: vendor.id,
      customerId: user.id,
      requestId,
    } satisfies OrderPlacedEvent);

    return { order: await this.getOwn(user.id, created.id), replayed: false };
  }

  async list(customerId: string, q: ListOrdersQueryDto) {
    const limit = Math.min(q.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const rows = await this.prisma.order.findMany({
      where: { customerId, ...(q.status ? { status: q.status } : {}), ...beforeCursor(q.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: orderSummarySelect,
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return { items: items.map(toOrderSummary), nextCursor };
  }

  async getOwn(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, customerId }, select: orderSelect });
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, 'Order not found.', HttpStatus.NOT_FOUND);
    return toOrderView(order);
  }

  /** Only COD exists until Phase 6, and promo codes until Phase 7: refuse rather than silently ignore. */
  private assertAcceptedRequest(dto: PlaceOrderDto): void {
    if (dto.paymentMethod !== PaymentMethod.COD) {
      throw new AppException('PAYMENT_METHOD_UNAVAILABLE', 'Only cash on delivery is available right now.', HttpStatus.BAD_REQUEST, {
        available: [PaymentMethod.COD],
      });
    }
    if (dto.promoCode) throw new AppException('PROMO_UNAVAILABLE', 'Promo codes are not available yet.', HttpStatus.BAD_REQUEST);
  }

  /** The earlier order for this (customer, key), if any, provided the request is the same one. */
  private async findReplay(customerId: string, key: string, dto: PlaceOrderDto) {
    const existing = await this.prisma.order.findFirst({
      where: { customerId, idempotencyKey: key },
      select: orderSelect,
    });
    if (!existing) return null;

    const wanted = new Map(mergeLines(dto.items).map((l) => [l.serviceItemId, l.qty]));
    const sameItems = existing.items.length === wanted.size && existing.items.every((i) => i.serviceItemId && wanted.get(i.serviceItemId) === i.qty);
    const same =
      existing.vendorId === dto.vendorId &&
      existing.pickupSlotStart.getTime() === new Date(dto.pickupSlotStart).getTime() &&
      existing.deliverySlotStart.getTime() === new Date(dto.deliverySlotStart).getTime() &&
      sameItems;
    if (!same) {
      throw new AppException('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different order.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return toOrderView(existing);
  }
}
