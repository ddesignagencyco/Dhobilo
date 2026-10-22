import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { DomainEvent } from '../../../common/events/domain-events';
import type { OrderStatusChangedEvent } from '../../../common/events/domain-events';
import { REDIS } from '../../../infra/redis/redis.constants';

export const orderChannel = (orderId: string) => `order:${orderId}`;

/** What travels over Redis (and out through SSE) for each status change. */
export interface OrderLiveEvent {
  seq: number;
  orderId: string;
  from: string;
  to: string;
  at: string;
  actor: string;
  reason?: string;
}

/**
 * Publishes committed status changes to Redis pub/sub so every API replica can push them to its connected
 * clients (TRD §12). Registered in both the API and the worker, because timers change orders from the worker.
 * Best effort: clients that miss a message catch up through Last-Event-ID replay or polling.
 */
@Injectable()
export class OrderEventsPublisher {
  private readonly logger = new Logger(OrderEventsPublisher.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: false })
  async publish(e: OrderStatusChangedEvent): Promise<void> {
    const live: OrderLiveEvent = { seq: e.seq, orderId: e.orderId, from: e.from, to: e.to, at: e.at, actor: e.actor, reason: e.reason };
    try {
      await this.redis.publish(orderChannel(e.orderId), JSON.stringify(live));
    } catch (err) {
      this.logger.warn({ err, orderId: e.orderId }, 'Could not publish live order event');
    }
  }
}
