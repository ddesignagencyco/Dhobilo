import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { DomainEvent } from '../../../common/events/domain-events';
import type { OrderPlacedEvent, OrderStatusChangedEvent } from '../../../common/events/domain-events';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { QUEUES } from '../../../infra/queue/queues';
import { VENDOR_TIMEOUT_JOB, VendorTimeoutJob, vendorTimeoutJobId } from './order-timers.processor';

/** API-side: schedules the vendor-response deadline when an order is placed and cancels it once it is answered. */
@Injectable()
export class OrderTimersScheduler {
  private readonly logger = new Logger(OrderTimersScheduler.name);

  constructor(
    @InjectQueue(QUEUES.ORDER_TIMERS) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  @OnEvent(DomainEvent.ORDER_PLACED, { async: false })
  async onPlaced(e: OrderPlacedEvent): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({ where: { id: e.orderId }, select: { vendorRespondBy: true } });
      if (!order) return;
      const delay = Math.max(order.vendorRespondBy.getTime() - this.clock.now().getTime(), 0);
      await this.queue.add(
        VENDOR_TIMEOUT_JOB,
        { orderId: e.orderId, requestId: e.requestId } satisfies VendorTimeoutJob,
        // Fixed job id: scheduling the same order twice can never produce two timers.
        { jobId: vendorTimeoutJobId(e.orderId), delay, removeOnComplete: true, removeOnFail: 1000 },
      );
    } catch (err) {
      // The order is safe in Postgres and the worker's sweeper will still expire it shortly after its deadline.
      this.logger.error({ err, orderId: e.orderId }, 'Could not schedule the vendor-response timer');
    }
  }

  /** Once someone has answered, the timer is pointless. Best effort; the processor is idempotent anyway. */
  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: false })
  async onChanged(e: OrderStatusChangedEvent): Promise<void> {
    if (e.from !== OrderStatus.PLACED) return;
    try {
      await this.queue.remove(vendorTimeoutJobId(e.orderId));
    } catch (err) {
      this.logger.debug({ err, orderId: e.orderId }, 'Timer already gone');
    }
  }
}
