import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { DomainEvent, OrderStatusChangedEvent } from '../../../common/events/domain-events';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { ActorKind, checkTransition } from './order-state-machine';

export interface ActorContext {
  kind: ActorKind;
  userId?: string;
  role?: Role;
}

export const SYSTEM_ACTOR: ActorContext = { kind: 'SYSTEM' };

export interface TransitionOptions {
  /** Shown to the customer/vendor (rejection and cancellation reasons). Required by some steps. */
  reason?: string;
  requestId?: string;
  /** Only proceed if the order is currently in this status (for callers acting on what they last saw). */
  expectedFrom?: OrderStatus;
}

export interface TransitionResult {
  id: string;
  from: OrderStatus;
  to: OrderStatus;
  seq: number;
  at: Date;
}

/** Timestamp column stamped when an order enters a status. */
const STAMP: Partial<Record<OrderStatus, keyof Prisma.OrderUpdateManyMutationInput>> = {
  ACCEPTED: 'acceptedAt',
  PICKED_UP: 'pickedUpAt',
  READY: 'readyAt',
  DELIVERED: 'deliveredAt',
};

/**
 * The single place an order's status changes (TRD §10). Controllers and workers never write `status` directly.
 * Each change is one transaction: legality check against the transition table, a compare-and-set update, and
 * an append-only history row. Side effects (live updates, notifications, timers) hang off the committed event.
 */
@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async transition(orderId: string, to: OrderStatus, actor: ActorContext, opts: TransitionOptions = {}): Promise<TransitionResult> {
    const reason = opts.reason?.trim() || undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
      if (!order) throw new AppException(ErrorCode.NOT_FOUND, 'Order not found.', HttpStatus.NOT_FOUND);
      const from = order.status;

      if (opts.expectedFrom && opts.expectedFrom !== from) throw this.changed(from);

      const problem = checkTransition(from, to, actor.kind, reason);
      if (problem) {
        throw new AppException(
          problem.code,
          problem.message,
          problem.code === 'ORDER_REASON_REQUIRED' ? HttpStatus.BAD_REQUEST : HttpStatus.CONFLICT,
          { from, to },
        );
      }

      const now = new Date();
      const stamp = STAMP[to];
      // Compare-and-set: of two simultaneous requests moving the same order, only one can win.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: from },
        data: {
          status: to,
          ...(stamp ? { [stamp]: now } : {}),
          ...(to === OrderStatus.REJECTED ? { rejectionReason: reason } : {}),
          ...(to === OrderStatus.CANCELLED ? { cancelReason: reason } : {}),
        },
      });
      if (claimed.count !== 1) throw this.changed(from);

      const history = await tx.orderStatusHistory.create({
        data: { orderId, fromStatus: from, toStatus: to, actorId: actor.userId ?? null, actorRole: actor.role ?? null, note: reason },
        select: { seq: true, createdAt: true },
      });
      return { id: orderId, from, to, seq: history.seq, at: history.createdAt } satisfies TransitionResult;
    });

    // After commit. A failing listener must never turn a committed change into an error response.
    try {
      await this.events.emitAsync(DomainEvent.ORDER_STATUS_CHANGED, {
        orderId,
        from: result.from,
        to,
        seq: result.seq,
        actor: actor.kind,
        reason,
        at: result.at.toISOString(),
        requestId: opts.requestId,
      } satisfies OrderStatusChangedEvent);
    } catch (err) {
      this.logger.error({ err, orderId, to }, 'order.status_changed listener failed');
    }
    return result;
  }

  private changed(current: OrderStatus): AppException {
    return new AppException('ORDER_STATE_CHANGED', 'The order was just updated by someone else. Refresh and try again.', HttpStatus.CONFLICT, {
      status: current,
    });
  }
}
