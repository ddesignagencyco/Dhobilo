import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { DomainEvent } from '../../common/events/domain-events';
import type { OrderStatusChangedEvent } from '../../common/events/domain-events';
import { QUEUES } from '../../infra/queue/queues';

export const POST_EARNINGS_JOB = 'post-order-earnings';
export const SWEEP_EARNINGS_JOB = 'sweep-earnings';
export interface PostEarningsData {
  orderId: string;
}

/** A delivered order gets its earnings posted by the finance queue (API and worker both see order changes). */
@Injectable()
export class FinanceScheduler {
  private readonly logger = new Logger(FinanceScheduler.name);

  constructor(@InjectQueue(QUEUES.FINANCE) private readonly queue: Queue) {}

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: false })
  async onOrderChanged(e: OrderStatusChangedEvent): Promise<void> {
    if (e.to !== OrderStatus.DELIVERED) return;
    try {
      await this.queue.add(POST_EARNINGS_JOB, { orderId: e.orderId } satisfies PostEarningsData, { jobId: `earnings-${e.orderId}`, removeOnComplete: true, removeOnFail: 1000 });
    } catch (err) {
      // The sweeper posts it within minutes.
      this.logger.error({ err, orderId: e.orderId }, 'Could not queue earnings posting');
    }
  }
}
