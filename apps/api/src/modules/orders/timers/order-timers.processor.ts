import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { AppException } from '../../../common/errors/app.exception';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { QUEUES } from '../../../infra/queue/queues';
import { OrderLifecycleService, SYSTEM_ACTOR } from '../lifecycle/order-lifecycle.service';

export const VENDOR_TIMEOUT_JOB = 'vendor-response-timeout';
export const SWEEP_OVERDUE_JOB = 'sweep-overdue-orders';
export const vendorTimeoutJobId = (orderId: string) => `vendor-timeout-${orderId}`;
export const TIMEOUT_REASON = 'The vendor did not respond in time.';

export interface VendorTimeoutJob {
  orderId: string;
  requestId?: string;
}

/** Codes meaning "someone already dealt with this order": not failures, so the job must not retry. */
const ALREADY_HANDLED = new Set(['ORDER_INVALID_TRANSITION', 'ORDER_STATE_CHANGED', 'NOT_FOUND']);

/**
 * Worker-side order timers (TRD §9). An order nobody answers within the vendor's response window is rejected
 * automatically. Every handler is idempotent: it looks at the order's current status before acting, so a job that
 * runs twice, late, or after the vendor already answered does nothing.
 */
@Processor(QUEUES.ORDER_TIMERS)
@Injectable()
export class OrderTimersProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderTimersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async process(job: Job<VendorTimeoutJob | undefined>): Promise<unknown> {
    switch (job.name) {
      case VENDOR_TIMEOUT_JOB:
        return { expired: await this.expireIfOverdue(job.data!.orderId, job.data!.requestId) };
      case SWEEP_OVERDUE_JOB:
        return { expired: await this.sweep() };
      default:
        throw new Error(`No handler for order-timers job "${job.name}"`);
    }
  }

  /** Rejects the order if it is still waiting and its deadline has passed. Returns whether it did. */
  async expireIfOverdue(orderId: string, requestId?: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, vendorRespondBy: true, paymentMethod: true, paymentStatus: true },
    });
    if (!order || order.status !== OrderStatus.PLACED) return false;
    // Online orders are not the vendor's to answer until the money is confirmed.
    if (order.paymentMethod !== 'COD' && order.paymentStatus !== 'PAID') return false;
    // A job that fires a moment early (clock skew) leaves the order for the sweeper instead of cutting the vendor short.
    if (order.vendorRespondBy.getTime() > this.clock.now().getTime() + 1000) return false;

    try {
      await this.lifecycle.transition(orderId, OrderStatus.REJECTED, SYSTEM_ACTOR, { reason: TIMEOUT_REASON, requestId });
      return true;
    } catch (err) {
      if (err instanceof AppException && ALREADY_HANDLED.has(String(err.code))) return false;
      throw err;
    }
  }

  /** Safety net: catches orders whose delayed job was lost (Redis restart, flush, enqueue failure). */
  async sweep(): Promise<number> {
    const overdue = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PLACED,
        vendorRespondBy: { lte: this.clock.now() },
        OR: [{ paymentMethod: 'COD' }, { paymentStatus: 'PAID' }],
      },
      orderBy: { vendorRespondBy: 'asc' },
      take: 100,
      select: { id: true },
    });
    let expired = 0;
    for (const { id } of overdue) {
      try {
        if (await this.expireIfOverdue(id)) expired++;
      } catch (err) {
        this.logger.error({ err, orderId: id }, 'Could not expire overdue order');
      }
    }
    return expired;
  }
}
