import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../../../infra/redis/redis.constants';
import { OrderLiveEvent } from './order-events.publisher';

type Listener = (event: OrderLiveEvent) => void;

/**
 * One Redis subscription per API process (not per client) fanning events out to the SSE connections that
 * live in this process. Subscribers need their own connection, so it is a duplicate of the shared client.
 */
@Injectable()
export class OrderEventsHub implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderEventsHub.name);
  private subscriber?: Redis;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = this.redis.duplicate();
    this.subscriber.on('error', (err) => this.logger.warn({ err }, 'Live-event subscriber error'));
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      const orderId = channel.slice('order:'.length);
      const set = this.listeners.get(orderId);
      if (!set) return;
      try {
        const event = JSON.parse(message) as OrderLiveEvent;
        for (const fn of set) fn(event);
      } catch (err) {
        this.logger.warn({ err, channel }, 'Ignoring malformed live event');
      }
    });
    await this.subscriber.psubscribe('order:*');
  }

  async onModuleDestroy(): Promise<void> {
    this.listeners.clear();
    await this.subscriber?.quit().catch(() => this.subscriber?.disconnect());
  }

  /** Returns an unsubscribe function. */
  subscribe(orderId: string, fn: Listener): () => void {
    let set = this.listeners.get(orderId);
    if (!set) this.listeners.set(orderId, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.listeners.delete(orderId);
    };
  }

  get activeStreams(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}
