import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEvent, OrderPlacedEvent } from '../../common/events/domain-events';
import { fmt, money } from '../../common/money/money';
import { Clock } from '../../common/time/clock';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QUEUES } from '../../infra/queue/queues';
import { LedgerService } from '../finance/ledger.service';
import { OrderLifecycleService, SYSTEM_ACTOR } from '../orders/lifecycle/order-lifecycle.service';
import { GatewayRegistry } from './gateway.registry';
import { InitiatePaymentDto } from './dto/payments.dto';
import type { CheckoutResult, GatewayCode } from './payment-gateway';
import { PAYMENT_RECONCILE_JOB, PAYMENT_WEBHOOK_JOB, PaymentWebhookJob, REFUND_ORDER_JOB, RefundOrderJob, refundOrderJobId, webhookJobId } from './payments.jobs';

const GATEWAYS = new Set<GatewayCode>(['jazzcash', 'easypaisa', 'payfast', 'raast']);
export const PAYMENT_TIMEOUT_REASON = 'The online payment was not completed in time.';

const orderForPayment = {
  id: true,
  orderNo: true,
  status: true,
  paymentStatus: true,
  vendorId: true,
  total: true,
  vendor: { select: { respondWithinMin: true } },
} satisfies Prisma.OrderSelect;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: GatewayRegistry,
    private readonly lifecycle: OrderLifecycleService,
    private readonly ledger: LedgerService,
    private readonly events: EventEmitter2,
    private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(QUEUES.PAYMENTS) private readonly queue: Queue,
  ) {}

  /** Starts (or restarts) the hosted checkout for one of the customer's own orders. */
  async initiate(user: AuthUser, dto: InitiatePaymentDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, customerId: user.id },
      select: {
        id: true,
        orderNo: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        customer: { select: { name: true, phone: true, email: true } },
      },
    });
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, 'Order not found.', HttpStatus.NOT_FOUND);
    if (order.paymentMethod === PaymentMethod.COD) {
      throw new AppException('PAYMENT_METHOD_UNAVAILABLE', 'This order is paid in cash on delivery.', HttpStatus.BAD_REQUEST);
    }
    if (order.status !== OrderStatus.PLACED) {
      throw new AppException('ORDER_NOT_PAYABLE', 'This order can no longer be paid online.', HttpStatus.CONFLICT, { status: order.status });
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new AppException('PAYMENT_ALREADY_PAID', 'This order is already paid.', HttpStatus.CONFLICT);
    }

    const gateway = this.gateways.forMethod(order.paymentMethod);
    const pending = await this.prisma.payment.findFirst({
      where: { orderId: order.id, method: order.paymentMethod, status: PaymentStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
    if (pending?.gateway && GATEWAYS.has(pending.gateway as GatewayCode)) {
      const checkout = await gateway.initiate(
        {
          orderId: order.id,
          orderNo: order.orderNo,
          amount: money(order.total),
          customerName: order.customer.name ?? 'Dhoblio customer',
          customerPhone: order.customer.phone,
          customerEmail: order.customer.email,
          description: `Dhoblio order ${order.orderNo}`,
        },
        pending.gatewayRef ?? undefined,
      );
      if (!pending.gatewayRef && checkout.gatewayRef) {
        await this.prisma.payment.update({ where: { id: pending.id }, data: { gatewayRef: checkout.gatewayRef } });
      }
      return this.checkoutResponse(pending.id, order.id, gateway.code, checkout, order.total, pending.createdAt);
    }

    const checkout = await gateway.initiate({
      orderId: order.id,
      orderNo: order.orderNo,
      amount: money(order.total),
      customerName: order.customer.name ?? 'Dhoblio customer',
      customerPhone: order.customer.phone,
      customerEmail: order.customer.email,
      description: `Dhoblio order ${order.orderNo}`,
    });
    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        method: order.paymentMethod,
        gateway: gateway.code,
        gatewayRef: checkout.gatewayRef,
        amount: order.total,
        status: PaymentStatus.PENDING,
      },
    });
    return this.checkoutResponse(payment.id, order.id, gateway.code, checkout, order.total, payment.createdAt);
  }

  /** Verifies the provider signature and queues the application of the event; never trusts the caller. */
  async receiveWebhook(route: string, headers: Record<string, string | string[] | undefined>, rawBody: Buffer) {
    const gateway = this.gateways.forWebhook(route);
    const event = gateway.verifyWebhook(headers, rawBody);
    const data: PaymentWebhookJob = {
      event: {
        gateway: event.gateway,
        gatewayRef: event.gatewayRef,
        status: event.status,
        ...(event.amount ? { amount: event.amount.toFixed(2) } : {}),
        ...(event.eventId ? { eventId: event.eventId } : {}),
        payload: event.payload,
      },
    };
    await this.queue.add(PAYMENT_WEBHOOK_JOB, data, { jobId: webhookJobId(data.event) });
    return { received: true };
  }

  /** Applies one normalized gateway event. Duplicate and out-of-order notifications are safe. */
  async applyEvent(event: PaymentWebhookJob['event']): Promise<{ duplicate: boolean; status: PaymentStatus; refunded?: boolean }> {
    const found = await this.prisma.payment.findFirst({
      where: { gateway: event.gateway, gatewayRef: event.gatewayRef },
      select: { id: true },
    });
    if (!found) throw new AppException('PAYMENT_NOT_FOUND', 'No payment matches this gateway reference.', HttpStatus.NOT_FOUND);

    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: found.id }, include: { order: { select: orderForPayment } } });
    if (event.amount) {
      const told = money(event.amount);
      if (!told.equals(money(payment.amount))) {
        throw new AppException('PAYMENT_AMOUNT_MISMATCH', 'The gateway amount does not match the order total.', HttpStatus.BAD_REQUEST, {
          expected: fmt(money(payment.amount)),
          received: fmt(told),
        });
      }
    }
    if (event.status === 'PENDING') return { duplicate: true, status: payment.status };

    // Money for an order that was already cancelled/rejected goes straight back to the customer.
    if (
      event.status === 'PAID' &&
      (payment.order.status === OrderStatus.CANCELLED || payment.order.status === OrderStatus.REJECTED) &&
      payment.status !== PaymentStatus.REFUNDED
    ) {
      const gateway = this.gateways.forCode(event.gateway);
      await gateway.refund(payment.gatewayRef ?? event.gatewayRef, money(payment.amount), 'The order was cancelled before payment completed.');
      const refunded = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `payment:${payment.id}`);
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { status: true } });
        if (current.status === PaymentStatus.REFUNDED) return { duplicate: true, status: current.status, refunded: true };
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED, rawPayload: this.payload(event, 'late payment refunded') },
        });
        await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: PaymentStatus.REFUNDED } });
        return { duplicate: false, status: PaymentStatus.REFUNDED, refunded: true };
      });
      return refunded;
    }

    let emitPlaced = false;
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `payment:${payment.id}`);
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { order: { select: orderForPayment } } });
      if (current.status === PaymentStatus.REFUNDED && event.status !== 'REFUNDED') {
        return { duplicate: true, status: current.status };
      }
      if (current.status === PaymentStatus.PAID && event.status === 'FAILED') {
        return { duplicate: true, status: current.status };
      }

      const nextStatus =
        event.status === 'PAID' ? PaymentStatus.PAID : event.status === 'REFUNDED' ? PaymentStatus.REFUNDED : PaymentStatus.FAILED;
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: nextStatus, rawPayload: this.payload(event, event.status) },
      });

      if (nextStatus === PaymentStatus.PAID) {
        if (current.order.status === OrderStatus.PLACED && current.order.paymentStatus !== PaymentStatus.PAID) {
          const respondBy = new Date(this.clock.now().getTime() + current.order.vendor.respondWithinMin * 60_000);
          await tx.order.update({ where: { id: current.orderId }, data: { paymentStatus: PaymentStatus.PAID, vendorRespondBy: respondBy } });
          emitPlaced = true;
        } else if (current.order.paymentStatus !== PaymentStatus.PAID) {
          await tx.order.update({ where: { id: current.orderId }, data: { paymentStatus: PaymentStatus.PAID } });
        }
      } else if (nextStatus === PaymentStatus.REFUNDED) {
        await tx.order.update({ where: { id: current.orderId }, data: { paymentStatus: PaymentStatus.REFUNDED } });
      } else if (current.order.paymentStatus === PaymentStatus.PENDING) {
        await tx.order.update({ where: { id: current.orderId }, data: { paymentStatus: PaymentStatus.FAILED } });
      }

      return { duplicate: current.status === nextStatus, status: nextStatus };
    });

    if (emitPlaced) {
      const order = await this.prisma.order.findUnique({ where: { id: payment.orderId }, select: { vendorId: true, customerId: true } });
      if (order) {
        await this.events.emitAsync(DomainEvent.ORDER_PLACED, {
          orderId: payment.orderId,
          vendorId: order.vendorId,
          customerId: order.customerId,
        } satisfies OrderPlacedEvent);
      }
    }
    if (result.status === PaymentStatus.REFUNDED) await this.ledger.refundOrderEarnings(payment.orderId, 'Payment refunded');
    return result;
  }

  /** Reconciles pending payments with the gateway, then cancels online orders whose payment window has closed. */
  async reconcile(): Promise<{ checked: number; cancelled: number }> {
    const timeoutMin = this.config.get('PAYMENT_TIMEOUT_MIN', { infer: true });
    const cutoff = new Date(this.clock.now().getTime() - timeoutMin * 60_000);
    const pending = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.PENDING, gateway: { not: 'cod' }, createdAt: { lte: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, gateway: true, gatewayRef: true },
    });

    let checked = 0;
    for (const payment of pending) {
      if (!GATEWAYS.has(payment.gateway as GatewayCode) || !payment.gatewayRef) continue;
      checked++;
      try {
        const status = await this.gateways.forCode(payment.gateway as GatewayCode).status(payment.gatewayRef);
        if (status.status !== 'PENDING') {
          await this.applyEvent({
            gateway: payment.gateway as GatewayCode,
            gatewayRef: payment.gatewayRef,
            status: status.status,
            amount: status.amount?.toFixed(2),
            eventId: status.eventId,
            payload: status.payload ?? { reconciled: true },
          });
        }
      } catch (err) {
        this.logger.warn({ err, paymentId: payment.id, gateway: payment.gateway }, 'Could not reconcile a payment');
      }
    }

    const stale = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PLACED,
        paymentMethod: { not: PaymentMethod.COD },
        paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
        createdAt: { lte: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true },
    });
    let cancelled = 0;
    for (const order of stale) {
      try {
        const current = await this.prisma.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true, status: true } });
        if (!current || current.status !== OrderStatus.PLACED) continue;
        if (current.paymentStatus === PaymentStatus.PAID) continue;
        await this.prisma.payment.updateMany({ where: { orderId: order.id, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.FAILED } });
        await this.prisma.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.FAILED } });
        await this.lifecycle.transition(order.id, OrderStatus.CANCELLED, SYSTEM_ACTOR, { reason: PAYMENT_TIMEOUT_REASON });
        cancelled++;
      } catch (err) {
        this.logger.warn({ err, orderId: order.id }, 'Could not expire an unpaid order');
      }
    }
    return { checked, cancelled };
  }

  /** Refunds every successful online payment for an order (cancel/reject path). */
  async refundOrder(orderId: string, reason?: string): Promise<{ refunded: number }> {
    const payments = await this.prisma.payment.findMany({
      where: { orderId, status: PaymentStatus.PAID, gateway: { not: 'cod' } },
      select: { id: true },
    });
    let refunded = 0;
    for (const payment of payments) {
      const did = await this.refundPayment(payment.id, reason);
      if (did) refunded++;
    }
    return { refunded };
  }

  /** Refunds one payment; safe to call twice. */
  async refundPayment(paymentId: string, reason?: string): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new AppException('PAYMENT_NOT_FOUND', 'Payment not found.', HttpStatus.NOT_FOUND);
    if (payment.status === PaymentStatus.REFUNDED) return false;
    if (payment.status !== PaymentStatus.PAID) {
      throw new AppException('PAYMENT_NOT_REFUNDABLE', 'Only a successful payment can be refunded.', HttpStatus.CONFLICT, { status: payment.status });
    }
    if (!GATEWAYS.has(payment.gateway as GatewayCode)) throw new AppException('PAYMENT_NOT_REFUNDABLE', 'This payment has no online gateway.', HttpStatus.CONFLICT);
    const gateway = this.gateways.forCode(payment.gateway as GatewayCode);
    await gateway.refund(payment.gatewayRef ?? '', money(payment.amount), reason);
    const changed = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `payment:${payment.id}`);
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { status: true } });
      if (current.status === PaymentStatus.REFUNDED) return false;
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.REFUNDED } });
      await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: PaymentStatus.REFUNDED } });
      return true;
    });
    if (changed) await this.ledger.refundOrderEarnings(payment.orderId, reason ?? 'Payment refunded');
    return changed;
  }

  async enqueueRefund(orderId: string, reason?: string): Promise<void> {
    await this.queue.add(REFUND_ORDER_JOB, { orderId, reason } satisfies RefundOrderJob, { jobId: refundOrderJobId(orderId) });
  }

  private checkoutResponse(paymentId: string, orderId: string, gateway: GatewayCode, checkout: CheckoutResult, amount: Prisma.Decimal, createdAt: Date) {
    const timeoutMin = this.config.get('PAYMENT_TIMEOUT_MIN', { infer: true });
    return {
      paymentId,
      orderId,
      gateway,
      gatewayRef: checkout.gatewayRef,
      amount: fmt(money(amount)),
      redirectUrl: checkout.redirectUrl,
      formFields: checkout.formFields ?? {},
      expiresAt: new Date(createdAt.getTime() + timeoutMin * 60_000),
      status: PaymentStatus.PENDING,
    };
  }

  private payload(event: PaymentWebhookJob['event'], note: string): Prisma.InputJsonObject {
    return { note, gateway: event.gateway, status: event.status, eventId: event.eventId ?? null, amount: event.amount ?? null };
  }

  private lock(tx: Prisma.TransactionClient, key: string): Promise<number> {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}
