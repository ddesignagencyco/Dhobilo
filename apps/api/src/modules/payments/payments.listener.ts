import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderStatus } from '@prisma/client';
import { DomainEvent } from '../../common/events/domain-events';
import type { OrderStatusChangedEvent } from '../../common/events/domain-events';
import { PaymentsService } from './payments.service';

/** Cancelled or rejected orders give back what was paid. Runs in the API and the worker, since orders change in both. */
@Injectable()
export class PaymentsListener {
  private readonly logger = new Logger(PaymentsListener.name);

  constructor(private readonly payments: PaymentsService) {}

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: false })
  async onOrderChanged(e: OrderStatusChangedEvent): Promise<void> {
    if (e.to !== OrderStatus.CANCELLED && e.to !== OrderStatus.REJECTED) return;
    try {
      await this.payments.onOrderClosed(e.orderId);
    } catch (err) {
      this.logger.error({ err, orderId: e.orderId }, 'Could not start refunds for a closed order');
    }
  }
}
