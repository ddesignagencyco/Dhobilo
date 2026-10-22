import { Injectable, MessageEvent } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Observable } from 'rxjs';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { OrderEventsHub } from './lifecycle/order-events.hub';
import { OrderLiveEvent } from './lifecycle/order-events.publisher';
import { actorKindOf } from './lifecycle/order-state-machine';

export const HEARTBEAT_MS = 25_000;

/**
 * Server-sent events for one order (FR-C9, TRD §12). Every status change is an event whose id is its history
 * sequence number. A client that reconnects with `Last-Event-ID` first receives what it missed, then live updates;
 * one that connects fresh gets the current state first. Browsers' EventSource cannot send an Authorization
 * header, so web clients use a fetch-based SSE reader (e.g. @microsoft/fetch-event-source) with the bearer token.
 */
@Injectable()
export class OrderStreamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: OrderEventsHub,
  ) {}

  open(orderId: string, lastEventId?: string): Observable<MessageEvent> {
    const last = lastEventId && /^\d+$/.test(lastEventId) ? Number(lastEventId) : undefined;

    return new Observable<MessageEvent>((subscriber) => {
      let sentUpTo = last ?? 0;
      let replaying = true;
      const buffered: OrderLiveEvent[] = [];

      const emit = (e: OrderLiveEvent) => {
        if (e.seq <= sentUpTo) return; // already delivered (live event that raced the replay)
        sentUpTo = e.seq;
        subscriber.next({ id: String(e.seq), type: 'status', data: e });
      };

      // Subscribe before reading history so nothing slips through the gap; buffer until replay is done.
      const unsubscribe = this.hub.subscribe(orderId, (e) => (replaying ? buffered.push(e) : emit(e)));
      const heartbeat = setInterval(() => subscriber.next({ type: 'ping', data: {} }), HEARTBEAT_MS);

      this.history(orderId, last)
        .then((missed) => {
          missed.forEach(emit);
          buffered.sort((a, b) => a.seq - b.seq).forEach(emit);
          replaying = false;
        })
        .catch((err) => subscriber.error(err));

      return () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    });
  }

  /** After a Last-Event-ID: everything newer. Fresh connection: just the latest state. */
  private async history(orderId: string, after?: number): Promise<OrderLiveEvent[]> {
    const rows =
      after !== undefined
        ? await this.prisma.orderStatusHistory.findMany({ where: { orderId, seq: { gt: after } }, orderBy: { seq: 'asc' } })
        : await this.prisma.orderStatusHistory.findMany({ where: { orderId }, orderBy: { seq: 'desc' }, take: 1 });
    return rows.map((r) => ({
      seq: r.seq,
      orderId,
      from: r.fromStatus ?? '',
      to: r.toStatus,
      at: r.createdAt.toISOString(),
      actor: actorKindOf(r.actorRole as Role | null),
      reason: r.note ?? undefined,
    }));
  }
}
