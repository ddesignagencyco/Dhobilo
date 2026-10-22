import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JobType, OrderStatus } from '@prisma/client';
import { DomainEvent } from '../../common/events/domain-events';
import type { OrderStatusChangedEvent } from '../../common/events/domain-events';
import { DeliveryJobsService } from './delivery-jobs.service';

/**
 * Keeps delivery jobs in step with their order. Runs in the API and the worker, because orders change in both.
 *
 *   ACCEPTED          -> a pickup job appears
 *   READY             -> a delivery job appears
 *   CANCELLED/REJECTED -> every open job for the order is cancelled
 *   a vendor or admin does the hand-off themselves (PICKED_UP, OUT_FOR_DELIVERY, DELIVERED) -> that leg's job is
 *                        cancelled, since nobody needs to be sent for it any more
 */
@Injectable()
export class DeliveryEventsListener {
  private readonly logger = new Logger(DeliveryEventsListener.name);

  constructor(private readonly jobs: DeliveryJobsService) {}

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: false })
  async onOrderChanged(e: OrderStatusChangedEvent): Promise<void> {
    try {
      switch (e.to) {
        case OrderStatus.ACCEPTED:
          await this.jobs.createForOrder(e.orderId, JobType.PICKUP, e.requestId);
          break;
        case OrderStatus.READY:
          await this.jobs.createForOrder(e.orderId, JobType.DROP, e.requestId);
          break;
        case OrderStatus.CANCELLED:
        case OrderStatus.REJECTED:
          await this.jobs.cancelOpenForOrder(e.orderId, e.reason ? `The order was cancelled: ${e.reason}` : 'The order was cancelled.');
          break;
        case OrderStatus.PICKED_UP:
          if (e.actor !== 'RIDER') await this.jobs.cancelOpenForOrder(e.orderId, 'The clothes were collected another way.', JobType.PICKUP);
          break;
        case OrderStatus.OUT_FOR_DELIVERY:
        case OrderStatus.DELIVERED:
          if (e.actor !== 'RIDER') await this.jobs.cancelOpenForOrder(e.orderId, 'The delivery was handled another way.', JobType.DROP);
          break;
      }
    } catch (err) {
      // The order change is already committed; the failure is logged for ops.
      this.logger.error({ err, orderId: e.orderId, to: e.to }, 'Could not update delivery jobs for an order change');
    }
  }
}
