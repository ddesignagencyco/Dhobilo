import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, Payment, PaymentMethod, PaymentStatus, Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEvent } from '../../common/events/domain-events';
import type { OrderPlacedEvent } from '../../common/events/domain-events';
import { fmt, money } from '../../common/money/money';
import { Clock } from '../../common/time/clock';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../delivery/ops-alert.service';
import { LedgerService } from '../finance/ledger.service';
import { NotificationOrchestrator } from '../notifications/notification-orchestrator';
import { OrderLifecycleService } from '../orders/lifecycle/order-lifecycle.service';
import { GatewayRegistry } from './gateway/gateway.registry';
import type { CheckoutInfo } from './gateway/payment-gateway';
import { PaymentsScheduler } from './payments.scheduler';

/** What the app needs to know about one payment attempt. Never contains anything secret except the checkout form for the customer's own browser. */
export interface PaymentView {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  attempt: number;
  amount: string;
  currency: 'PKR';
  expiresAt: Date | null;
  failureReason: string | null;
  checkout: { redirectUrl: string; method: 'GET' | 'POST'; formFields?: Record<string, string> } | null;
}

const MAX_ATTEMPTS = 5;
const CLOSED_ORDER: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REJECTED];

/**
 * Online payments (FR-C8, TRD §13). The rules that matter:
 *  - The customer pays on the gateway's hosted page. We never see card or wallet details.
 *  - The result is believed only when a signed notification (or a direct status check) says so, never because the
 *    customer's browser came back to us.
 *  - Notifications are stored first, once each, then applied by the worker; applying is idempotent and ordered by
 *    state: PAID is never overwritten by FAILED, and a payment that arrives for an order that is already
 *    cancelled (or already paid another way) is refunded automatically.
 *  - The vendor first hears about an online order when it is paid.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: GatewayRegistry,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
    private readonly events: EventEmitter2,
    private readonly lifecycle: OrderLifecycleService,
    private readonly scheduler: PaymentsScheduler,
    private readonly ops: OpsAlertService,
    private readonly ledger: LedgerService,
    private readonly notifier: NotificationOrchestrator,
    private readonly audit: AuditService,
  ) {}

  get timeoutMs(): number {
    return this.config.get('PAYMENT_TIMEOUT_MIN', { infer: true }) * 60_000;
  }

  // ───────────────────────── starting a payment ─────────────────────────

  /** The row to create together with the order, before the customer is sent anywhere. */
  newAttempt(method: PaymentMethod, amount: Prisma.Decimal, attempt = 1): Prisma.PaymentUncheckedCreateWithoutOrderInput {
    const gateway = this.registry.forMethod(method);
    if (!gateway) throw new AppException('PAYMENT_METHOD_UNAVAILABLE', 'That payment method is not available right now.', HttpStatus.BAD_REQUEST, { available: this.registry.enabledMethods() });
    return { method, gateway: gateway.code, amount, status: PaymentStatus.PENDING, attempt, expiresAt: new Date(this.clock.now().getTime() + this.timeoutMs) };
  }

  /** Asks the gateway for a checkout for a freshly created attempt and stores it. */
  async initiate(paymentId: string): Promise<PaymentView> {
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: { select: { id: true, orderNo: true, customer: { select: { phone: true } } } } } });
    const gateway = this.registry.forCode(p.gateway);
    if (!gateway) throw new AppException('PAYMENT_METHOD_UNAVAILABLE', 'That payment method is not available right now.', HttpStatus.BAD_REQUEST);
    const returnUrl = `${this.config.get('API_URL', { infer: true })}/api/v1/payments/return/${gateway.code}?order=${p.order.id}`;
    let checkout: CheckoutInfo;
    try {
      checkout = await gateway.initiate({
        paymentId: p.id,
        orderId: p.order.id,
        orderNo: p.order.orderNo,
        amount: fmt(money(p.amount)),
        customerPhone: p.order.customer.phone,
        description: `Dhoblio order ${p.order.orderNo}`,
        returnUrl,
        expiresAt: p.expiresAt ?? new Date(this.clock.now().getTime() + this.timeoutMs),
      });
    } catch (err) {
      this.logger.error({ err, paymentId }, 'The gateway would not start the payment');
      await this.prisma.payment.update({ where: { id: p.id }, data: { status: PaymentStatus.FAILED, failureReason: 'The payment gateway could not be reached.' } });
      throw new AppException('PAYMENT_GATEWAY_ERROR', 'We could not start the payment. Please try again.', HttpStatus.BAD_GATEWAY);
    }
    const stored = await this.prisma.payment.update({
      where: { id: p.id },
      data: { gatewayRef: checkout.gatewayRef, checkout: { redirectUrl: checkout.redirectUrl, method: checkout.method, ...(checkout.formFields ? { formFields: checkout.formFields } : {}) } },
    });
    return this.toView(stored, checkout);
  }

  /** The newest payment attempt for an order, as the app sees it. */
  async latestView(orderId: string): Promise<PaymentView | null> {
    const p = await this.prisma.payment.findFirst({ where: { orderId }, orderBy: [{ attempt: 'desc' }, { createdAt: 'desc' }] });
    return p ? this.toView(p) : null;
  }

  toView(p: Payment, fresh?: CheckoutInfo): PaymentView {
    let checkout: PaymentView['checkout'] = null;
    if (p.status === PaymentStatus.PENDING && (fresh || p.checkout)) {
      const info = (fresh ?? (p.checkout as unknown as CheckoutInfo)) as CheckoutInfo;
      const gateway = this.registry.forCode(p.gateway);
      const full = gateway?.hydrateCheckout ? gateway.hydrateCheckout(info) : info;
      checkout = { redirectUrl: full.redirectUrl, method: full.method, ...(full.formFields ? { formFields: full.formFields } : {}) };
    }
    return {
      id: p.id,
      method: p.method,
      status: p.status,
      attempt: p.attempt,
      amount: fmt(money(p.amount)),
      currency: 'PKR',
      expiresAt: p.expiresAt,
      failureReason: p.failureReason,
      checkout,
    };
  }

  /** The customer's view of how an order's payment stands. */
  async forCustomer(customerId: string, orderId: string): Promise<PaymentView[]> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, customerId }, select: { id: true } });
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, 'Order not found.', HttpStatus.NOT_FOUND);
    const rows = await this.prisma.payment.findMany({ where: { orderId }, orderBy: [{ attempt: 'desc' }] });
    return rows.map((p) => this.toView(p));
  }

  /** "Pay now" / "try again" for an online order that is still unpaid. Starts a fresh attempt. */
  async retry(user: AuthUser, orderId: string, method?: PaymentMethod): Promise<PaymentView> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId: user.id },
      select: { id: true, status: true, paymentMethod: true, paymentStatus: true, total: true, payments: { select: { attempt: true, expiresAt: true, status: true } } },
    });
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, 'Order not found.', HttpStatus.NOT_FOUND);
    if (order.paymentMethod === PaymentMethod.COD || order.status !== OrderStatus.PLACED || (order.paymentStatus !== PaymentStatus.PENDING && order.paymentStatus !== PaymentStatus.FAILED)) {
      throw new AppException('PAYMENT_NOT_NEEDED', 'This order does not need a payment right now.', HttpStatus.CONFLICT, { status: order.status, paymentStatus: order.paymentStatus });
    }
    const attempts = order.payments.reduce((n, p) => Math.max(n, p.attempt), 0);
    if (attempts >= MAX_ATTEMPTS) throw new AppException('PAYMENT_ATTEMPTS_EXHAUSTED', 'Too many payment attempts. Please place the order again.', HttpStatus.CONFLICT, { max: MAX_ATTEMPTS });

    const chosen = method ?? order.paymentMethod;
    if (chosen === PaymentMethod.COD) throw new AppException('PAYMENT_METHOD_UNAVAILABLE', 'Choose an online payment method.', HttpStatus.BAD_REQUEST);
    const attempt = await this.prisma.$transaction(async (tx) => {
      // Earlier attempts that never finished are abandoned; if one is paid after all, it is refunded (see settle()).
      await tx.payment.updateMany({ where: { orderId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.FAILED, failureReason: 'Replaced by a new attempt.' } });
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.PENDING, paymentMethod: chosen } });
      return tx.payment.create({ data: { ...this.newAttempt(chosen, order.total, attempts + 1), orderId } });
    });
    return this.initiate(attempt.id);
  }

  // ───────────────────────── notifications from the gateway ─────────────────────────

  /**
   * Step 1 of a gateway notification: check the signature on the raw body, keep the notification (once), and hand it
   * to the worker. Returns quickly so the gateway doesn't time out and resend.
   */
  async ingest(gatewayCode: string, headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<{ duplicate: boolean }> {
    const gateway = this.registry.forCode(gatewayCode);
    if (!gateway) throw new AppException(ErrorCode.NOT_FOUND, 'Unknown payment gateway.', HttpStatus.NOT_FOUND);
    const event = gateway.verifyWebhook(headers, rawBody);
    if (!event) throw new AppException(ErrorCode.UNAUTHENTICATED, 'Invalid notification signature.', HttpStatus.UNAUTHORIZED);

    let stored: { id: string };
    try {
      stored = await this.prisma.paymentEvent.create({
        data: { gateway: gateway.code, eventId: event.eventId, gatewayRef: event.gatewayRef, status: event.status, amount: event.amount ? new Prisma.Decimal(event.amount) : null, payload: event.payload as Prisma.InputJsonObject, note: event.reason ?? null },
        select: { id: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { duplicate: true };
      throw err;
    }
    await this.scheduler.processEvent(stored.id);
    return { duplicate: false };
  }

  /** Step 2, in the worker: apply one stored notification. Safe to run any number of times. */
  async processEvent(eventId: string): Promise<'applied' | 'ignored' | 'already-done'> {
    const event = await this.prisma.paymentEvent.findUnique({ where: { id: eventId } });
    if (!event) return 'ignored';
    if (event.processedAt) return 'already-done';

    const payment = await this.prisma.payment.findUnique({ where: { gateway_gatewayRef: { gateway: event.gateway, gatewayRef: event.gatewayRef } } });
    let note: string | null = null;
    let outcome: 'applied' | 'ignored' = 'applied';
    if (!payment) {
      note = 'No payment with this reference.';
      outcome = 'ignored';
      await this.ops.alert('Payment notification for an unknown payment', `${event.gateway} sent ${event.status} for ${event.gatewayRef}, which we have no record of.`, { eventId });
    } else if (event.amount && !money(event.amount).equals(money(payment.amount))) {
      // Never mark an order paid for a different amount than we asked for.
      note = `Amount mismatch: gateway ${fmt(money(event.amount))}, expected ${fmt(money(payment.amount))}.`;
      outcome = 'ignored';
      await this.ops.alert('Payment amount does not match', `Order payment ${payment.id}: ${note}`, { paymentId: payment.id, eventId });
    } else if (event.status === 'PAID') {
      await this.markPaid(payment.id);
    } else {
      await this.markFailed(payment.id, event.note ?? 'The payment was not completed.');
    }
    await this.prisma.paymentEvent.update({ where: { id: eventId }, data: { processedAt: this.clock.now(), paymentId: payment?.id ?? null, ...(note ? { note } : {}) } });
    return outcome;
  }

  /** PENDING or FAILED -> PAID (a late success still counts). Anything already settled is left alone. */
  async markPaid(paymentId: string): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
      data: { status: PaymentStatus.PAID, paidAt: this.clock.now(), failureReason: null },
    });
    // Runs even when the update above changed nothing, so a retried job still finishes what an earlier run began.
    await this.settle(paymentId);
  }

  /** PENDING -> FAILED. A payment that is already PAID can never be failed by a late or out-of-order notification. */
  async markFailed(paymentId: string, reason: string): Promise<void> {
    const claimed = await this.prisma.payment.updateMany({ where: { id: paymentId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.FAILED, failureReason: reason.slice(0, 300) } });
    if (claimed.count === 0) return;
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { orderId: true } });
    const live = await this.prisma.payment.count({ where: { orderId: p.orderId, status: { in: [PaymentStatus.PENDING, PaymentStatus.PAID] } } });
    if (live === 0) await this.prisma.order.updateMany({ where: { id: p.orderId, paymentStatus: PaymentStatus.PENDING }, data: { paymentStatus: PaymentStatus.FAILED } });
  }

  /**
   * What a paid payment means for its order: normally the order becomes PAID and the vendor is told; if the order was
   * cancelled meanwhile, or another payment already covered it, this one is given back.
   */
  async settle(paymentId: string): Promise<void> {
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: { select: { id: true, status: true, vendorId: true, customerId: true, vendor: { select: { respondWithinMin: true } } } } } });
    if (p.status !== PaymentStatus.PAID) return;

    if (CLOSED_ORDER.includes(p.order.status)) {
      await this.refundQuietly(p.id, 'The order was cancelled before the payment arrived.');
      return;
    }
    const claimed = await this.prisma.order.updateMany({ where: { id: p.order.id, paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } }, data: { paymentStatus: PaymentStatus.PAID } });
    if (claimed.count === 1) {
      if (p.order.status === OrderStatus.PLACED) {
        // The vendor's response window starts now, when they first hear about the order.
        const now = this.clock.now();
        await this.prisma.order.update({ where: { id: p.order.id }, data: { vendorVisibleAt: now, vendorRespondBy: new Date(now.getTime() + p.order.vendor.respondWithinMin * 60_000) } });
        await this.events.emitAsync(DomainEvent.ORDER_PLACED, { orderId: p.order.id, vendorId: p.order.vendorId, customerId: p.order.customerId } satisfies OrderPlacedEvent);
      }
      return;
    }
    // Not the first payment for this order: if an earlier one is paid, this is a double payment.
    const earlier = await this.prisma.payment.count({ where: { orderId: p.order.id, id: { not: p.id }, status: PaymentStatus.PAID, paidAt: { lte: p.paidAt ?? this.clock.now() } } });
    if (earlier > 0) await this.refundQuietly(p.id, 'Duplicate payment for the same order.');
  }

  // ───────────────────────── refunds ─────────────────────────

  /** Full refund of a paid payment. Idempotent: refunding twice returns the first result. */
  async refund(paymentId: string, reason: string, adminId?: string, requestId?: string): Promise<PaymentView> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'refund:' + paymentId}))`;
        const p = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!p) throw new AppException(ErrorCode.NOT_FOUND, 'Payment not found.', HttpStatus.NOT_FOUND);
        if (p.status === PaymentStatus.REFUNDED) return { payment: p, done: false };
        if (p.status !== PaymentStatus.PAID || p.gateway === 'cod') {
          throw new AppException('PAYMENT_NOT_REFUNDABLE', `A ${p.status.toLowerCase()} payment cannot be refunded.`, HttpStatus.CONFLICT, { status: p.status });
        }
        const gateway = this.registry.forCode(p.gateway);
        if (!gateway || !p.gatewayRef) throw new AppException('GATEWAY_UNSUPPORTED', 'This payment cannot be refunded automatically.', HttpStatus.NOT_IMPLEMENTED);
        const refunded = await gateway.refund(p.gatewayRef, fmt(money(p.amount)), reason);

        const updated = await tx.payment.update({ where: { id: p.id }, data: { status: PaymentStatus.REFUNDED, refundedAmount: p.amount, refundRef: refunded.refundRef, refundedAt: this.clock.now() } });
        const stillPaid = await tx.payment.count({ where: { orderId: p.orderId, id: { not: p.id }, status: PaymentStatus.PAID } });
        // Marked refunded when nothing else paid for it: either it was paid, or it was cancelled before the money arrived.
        if (stillPaid === 0) await tx.order.updateMany({ where: { id: p.orderId, OR: [{ paymentStatus: PaymentStatus.PAID }, { status: { in: CLOSED_ORDER } }] }, data: { paymentStatus: PaymentStatus.REFUNDED } });
        // If the vendor was already credited for this order, take their share back.
        await this.ledger.postRefund(tx, p.orderId);
        if (adminId) {
          await this.audit.record({ action: 'PAYMENT_REFUNDED', entity: 'Payment', entityId: p.id, actorId: adminId, actorRole: Role.ADMIN, after: { reason, amount: fmt(money(p.amount)) }, requestId }, tx);
        }
        return { payment: updated, done: true };
      },
      { timeout: 30_000 },
    );
    if (result.done) await this.tellCustomerRefunded(result.payment.orderId, result.payment.amount);
    return this.toView(result.payment);
  }

  /** For automatic refunds: a gateway that can't refund by itself is escalated to ops instead of failing the job forever. */
  async refundQuietly(paymentId: string, reason: string): Promise<void> {
    try {
      await this.refund(paymentId, reason);
    } catch (err) {
      if (err instanceof AppException && (err.code === 'GATEWAY_UNSUPPORTED' || err.code === 'PAYMENT_NOT_REFUNDABLE')) {
        await this.ops.alert('A payment needs a manual refund', `Payment ${paymentId}: ${reason} (${err.message})`, { paymentId });
        return;
      }
      throw err;
    }
  }

  private async tellCustomerRefunded(orderId: string, amount: Prisma.Decimal): Promise<void> {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, select: { orderNo: true, customerId: true } });
    if (o) await this.notifier.notifyUser(o.customerId, 'order_refunded', { orderNo: o.orderNo, total: fmt(money(amount)) }, { orderId, type: 'ORDER_REFUNDED' });
  }

  /** An order was cancelled or rejected: give back anything paid, and stop waiting for anything unpaid. */
  async onOrderClosed(orderId: string): Promise<void> {
    await this.prisma.payment.updateMany({ where: { orderId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.FAILED, failureReason: 'The order was cancelled.' } });
    const paid = await this.prisma.payment.findMany({ where: { orderId, status: PaymentStatus.PAID }, select: { id: true } });
    for (const { id } of paid) await this.scheduler.refund(id, 'The order was cancelled or rejected.');
  }

  // ───────────────────────── timers (run by the worker) ─────────────────────────

  /** Online orders nobody paid for in time are cancelled. A last look at the gateway first, in case a notification was lost. */
  async expireUnpaid(): Promise<number> {
    const now = this.clock.now();
    const candidates = await this.prisma.order.findMany({
      where: { status: OrderStatus.PLACED, paymentMethod: { not: PaymentMethod.COD }, paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
      select: { id: true, createdAt: true, payments: { select: { id: true, status: true, gateway: true, gatewayRef: true, expiresAt: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    let cancelled = 0;
    for (const o of candidates) {
      // Each attempt carries its own deadline (set from the clock when it was created); an order with none falls back to its age.
      const stamped = o.payments.map((p) => p.expiresAt?.getTime()).filter((t): t is number => t !== undefined);
      const deadline = stamped.length > 0 ? Math.max(...stamped) : o.createdAt.getTime() + this.timeoutMs;
      if (deadline > now.getTime()) continue;
      try {
        if (await this.checkWithGateway(o.payments.filter((p) => p.status === PaymentStatus.PENDING))) continue; // it was paid after all
        await this.prisma.payment.updateMany({ where: { orderId: o.id, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.FAILED, failureReason: 'Not paid in time.' } });
        await this.lifecycle.transition(o.id, OrderStatus.CANCELLED, { kind: 'SYSTEM' }, { reason: 'Payment was not completed in time.' });
        cancelled++;
      } catch (err) {
        if (err instanceof AppException && ['ORDER_INVALID_TRANSITION', 'ORDER_STATE_CHANGED', 'NOT_FOUND'].includes(String(err.code))) continue;
        this.logger.error({ err, orderId: o.id }, 'Could not cancel an unpaid order');
      }
    }
    return cancelled;
  }

  /** Payments pending for a while are checked with the gateway, in case its notification never reached us. */
  async reconcile(): Promise<number> {
    // An attempt's age is how much of its window has passed: it was created `timeout` before it expires.
    const reconcileAfterMs = this.config.get('PAYMENT_RECONCILE_AFTER_MIN', { infer: true }) * 60_000;
    const expiresBefore = new Date(this.clock.now().getTime() + this.timeoutMs - reconcileAfterMs);
    const stale = await this.prisma.payment.findMany({ where: { status: PaymentStatus.PENDING, gatewayRef: { not: null }, expiresAt: { lte: expiresBefore } }, select: { id: true, status: true, gateway: true, gatewayRef: true, expiresAt: true }, take: 100 });
    let changed = 0;
    for (const p of stale) if (await this.checkWithGateway([p], true)) changed++;
    return changed;
  }

  /** Asks the gateway about each payment. Returns true if any turned out paid (or, with `anyChange`, failed). */
  private async checkWithGateway(payments: { id: string; gateway: string; gatewayRef: string | null }[], anyChange = false): Promise<boolean> {
    let changed = false;
    for (const p of payments) {
      const gateway = this.registry.forCode(p.gateway);
      if (!gateway || !p.gatewayRef) continue;
      try {
        const s = await gateway.status(p.gatewayRef);
        if (s.status === 'PAID') {
          await this.markPaid(p.id);
          changed = true;
        } else if (s.status === 'FAILED') {
          await this.markFailed(p.id, 'The gateway reports the payment failed.');
          if (anyChange) changed = true;
        }
      } catch (err) {
        if (!(err instanceof AppException && err.code === 'GATEWAY_UNSUPPORTED')) this.logger.warn({ err, paymentId: p.id }, 'Could not check a payment with its gateway');
      }
    }
    return changed;
  }

  /** Notifications that were stored but never applied (queue outage): apply them now. */
  async applyStrandedEvents(olderThanMs = 20_000): Promise<number> {
    // Wall-clock time: the database stamps `createdAt`, and the worker normally applies a notification within seconds.
    const stranded = await this.prisma.paymentEvent.findMany({ where: { processedAt: null, createdAt: { lte: new Date(Date.now() - olderThanMs) } }, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true } });
    for (const { id } of stranded) await this.processEvent(id);
    return stranded.length;
  }

  async sweep(opts: { strandedAfterMs?: number } = {}): Promise<{ events: number; reconciled: number; cancelled: number }> {
    const events = await this.applyStrandedEvents(opts.strandedAfterMs);
    const reconciled = await this.reconcile();
    const cancelled = await this.expireUnpaid();
    return { events, reconciled, cancelled };
  }
}
