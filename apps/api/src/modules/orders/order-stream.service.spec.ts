import { MessageEvent } from '@nestjs/common';
import { HEARTBEAT_MS, OrderStreamService } from './order-stream.service';

function setup(history: unknown[] = []) {
  const unsubscribe = jest.fn();
  const listeners: ((e: unknown) => void)[] = [];
  const hub = {
    subscribe: jest.fn((_id: string, fn: (e: unknown) => void) => {
      listeners.push(fn);
      return unsubscribe;
    }),
  };
  const prisma = { orderStatusHistory: { findMany: jest.fn().mockResolvedValue(history) } };
  return { service: new OrderStreamService(prisma as never, hub as never), hub, prisma, unsubscribe, listeners };
}

describe('OrderStreamService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends a ping every 25 s so proxies and clients keep the connection open', async () => {
    const { service } = setup();
    const seen: MessageEvent[] = [];
    const sub = service.open('o1').subscribe((e) => seen.push(e));
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(seen.filter((e) => e.type === 'ping')).toHaveLength(3);
    sub.unsubscribe();
  });

  it('stops pinging and drops its subscription the moment the client goes away', async () => {
    const { service, unsubscribe } = setup();
    const seen: MessageEvent[] = [];
    const sub = service.open('o1').subscribe((e) => seen.push(e));
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS);
    sub.unsubscribe();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    const before = seen.length;
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 4);
    expect(seen).toHaveLength(before);
  });

  it('subscribes to live events before reading history, so nothing can fall in the gap', async () => {
    const { service, hub, prisma } = setup();
    const order: string[] = [];
    hub.subscribe.mockImplementationOnce(() => {
      order.push('subscribe');
      return jest.fn();
    });
    prisma.orderStatusHistory.findMany.mockImplementationOnce(async () => {
      order.push('history');
      return [];
    });
    const sub = service.open('o1').subscribe();
    await jest.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['subscribe', 'history']);
    sub.unsubscribe();
  });

  it('reads only newer history when given a Last-Event-ID, only the latest row otherwise', async () => {
    const withId = setup();
    withId.service.open('o1', '41').subscribe().unsubscribe();
    expect(withId.prisma.orderStatusHistory.findMany).toHaveBeenCalledWith({ where: { orderId: 'o1', seq: { gt: 41 } }, orderBy: { seq: 'asc' } });

    const fresh = setup();
    fresh.service.open('o1').subscribe().unsubscribe();
    expect(fresh.prisma.orderStatusHistory.findMany).toHaveBeenCalledWith({ where: { orderId: 'o1' }, orderBy: { seq: 'desc' }, take: 1 });

    const junk = setup();
    junk.service.open('o1', 'abc').subscribe().unsubscribe();
    expect(junk.prisma.orderStatusHistory.findMany).toHaveBeenCalledWith({ where: { orderId: 'o1' }, orderBy: { seq: 'desc' }, take: 1 });
  });

  it('delivers live events that arrived during replay in order, skipping ones already sent', async () => {
    const { service, listeners, prisma } = setup();
    let release!: () => void;
    prisma.orderStatusHistory.findMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve([{ seq: 5, fromStatus: 'PLACED', toStatus: 'ACCEPTED', createdAt: new Date('2026-10-23T05:00:00Z'), actorRole: 'VENDOR_OWNER', note: null }]);
        }),
    );
    const seen: MessageEvent[] = [];
    const sub = service.open('o1', '4').subscribe((e) => e.type === 'status' && seen.push(e));
    const live = (seq: number, to: string) => listeners[0]({ seq, orderId: 'o1', from: 'x', to, at: 'now', actor: 'VENDOR' });
    live(6, 'PICKED_UP');
    live(5, 'ACCEPTED'); // duplicate of the replayed row
    release();
    await jest.advanceTimersByTimeAsync(0);
    expect(seen.map((e) => e.id)).toEqual(['5', '6']);
    live(6, 'PICKED_UP'); // duplicate after replay
    live(7, 'IN_PROCESS');
    expect(seen.map((e) => e.id)).toEqual(['5', '6', '7']);
    sub.unsubscribe();
  });

  it('errors the stream (so the client reconnects) if history cannot be read', async () => {
    const { service, prisma } = setup();
    prisma.orderStatusHistory.findMany.mockRejectedValueOnce(new Error('db down'));
    const error = jest.fn();
    service.open('o1').subscribe({ error });
    await jest.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }));
  });
});
