import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { DomainEvent } from '../../common/events/domain-events';
import type { OrderStatusChangedEvent } from '../../common/events/domain-events';
import { QUEUES } from '../../infra/queue/queues';
import { SETTLE_ORDER_JOB, SettleOrderJob, settleOrderJobId } from './finance.jobs';

/** Delivered orders become money movements, but the work belongs in the worker (ledger + COD). */
@Injectable()
export class FinanceListener {
  private readonly logger = new Logger(FinanceListener.name);

  constructor(@InjectQueue(QUEUES.FINANCE) private readonly queue: Queue) {}

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED)
  async onOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    if (event.to !== OrderStatus.DELIVERED) return;
    try {
      await this.queue.add(SETTLE_ORDER_JOB, { orderId: event.orderId } satisfies SettleOrderJob, {
        jobId: settleOrderJobId(event.orderId),
      });
    } catch (err) {
      this.logger.error({ err, orderId: event.orderId }, 'Could not enqueue order settlement');
    }
  }
}
