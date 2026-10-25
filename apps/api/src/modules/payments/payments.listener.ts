import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { DomainEvent } from '../../common/events/domain-events';
import type { OrderStatusChangedEvent } from '../../common/events/domain-events';
import { QUEUES } from '../../infra/queue/queues';
import { REFUND_ORDER_JOB, RefundOrderJob, refundOrderJobId } from './payments.jobs';

/** A paid order that is cancelled or rejected must give the money back; the worker does the gateway call. */
@Injectable()
export class PaymentsListener {
  private readonly logger = new Logger(PaymentsListener.name);

  constructor(@InjectQueue(QUEUES.PAYMENTS) private readonly queue: Queue) {}

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED)
  async onOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    if (event.to !== OrderStatus.CANCELLED && event.to !== OrderStatus.REJECTED) return;
    try {
      await this.queue.add(
        REFUND_ORDER_JOB,
        { orderId: event.orderId, reason: event.reason ?? `Order ${event.to.toLowerCase()}` } satisfies RefundOrderJob,
        { jobId: refundOrderJobId(event.orderId) },
      );
    } catch (err) {
      this.logger.error({ err, orderId: event.orderId }, 'Could not enqueue order refund');
    }
  }
}
