import { AddressInfo } from 'node:net';
import { Role } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { OrderEventsHub } from '../src/modules/orders/lifecycle/order-events.hub';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createTestApp, createUserWithToken, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, anotherCustomer, openSse, orderScenario, placeOrder, waitFor } from './order-helpers';

describe('Live order tracking over SSE (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let base: string;
  let hub: OrderEventsHub;
  const open: { close(): void }[] = [];

  beforeAll(async () => {
    const clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    await t.app.listen(0);
    base = `http://127.0.0.1:${(t.app.getHttpServer().address() as AddressInfo).port}/api/v1`;
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    hub = t.app.get(OrderEventsHub);
  });
  beforeEach(async () => {
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterEach(() => {
    open.splice(0).forEach((s) => s.close());
  });
  afterAll(() => t.close());

  const scenario = () => orderScenario(t, basics);
  const stream = async (id: string, auth: { Authorization: string }, extra: Record<string, string> = {}) => {
    const s = await openSse(`${base}/orders/${id}/events`, { ...auth, ...extra });
    open.push(s);
    return s;
  };
  const accept = (s: OrderScenario, id: string) => http.post(`/api/v1/vendor/orders/${id}/accept`).set(s.vendor.owner.auth).expect(200);
  const step = (s: OrderScenario, id: string, status: string) => http.post(`/api/v1/vendor/orders/${id}/status`).set(s.vendor.owner.auth).send({ status }).expect(200);
  const seqs = async (id: string) => (await t.prisma.orderStatusHistory.findMany({ where: { orderId: id }, orderBy: { seq: 'asc' } })).map((h) => h.seq);

  it('opens an event stream with the right headers and starts with the current status', async () => {
    const s = await scenario();
    const o = await placeOrder(http, s);
    const live = await stream(o.id, s.customer.auth);
    expect(live.status).toBe(200);
    expect(live.contentType).toContain('text/event-stream');

    const [first] = await live.events(1);
    const [seq] = await seqs(o.id);
    expect(first).toMatchObject({ id: String(seq), event: 'status', data: { orderId: o.id, to: 'PLACED', seq } });
  });

  it('pushes each status change to the customer and the vendor as it happens', async () => {
    const s = await scenario();
    const o = await placeOrder(http, s);
    const customer = await stream(o.id, s.customer.auth);
    const vendor = await stream(o.id, s.vendor.owner.auth);
    await customer.events(1);
    await vendor.events(1);

    await accept(s, o.id);
    await step(s, o.id, 'PICKED_UP');

    for (const live of [customer, vendor]) {
      const events = await live.events(3); // PLACED snapshot + ACCEPTED + PICKED_UP
      expect(events.map((e) => (e.data as { to: string }).to)).toEqual(['PLACED', 'ACCEPTED', 'PICKED_UP']);
      expect(events[1].data).toMatchObject({ from: 'PLACED', actor: 'VENDOR', orderId: o.id });
      const ids = events.map((e) => Number(e.id));
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(new Set(ids).size).toBe(3);
    }
  });

  it('only sends events for the order you opened', async () => {
    const s = await scenario();
    const mine = await placeOrder(http, s);
    const other = await placeOrder(http, s);
    const live = await stream(mine.id, s.customer.auth);
    await live.events(1);
    await accept(s, other.id);
    await accept(s, mine.id);
    const events = await live.events(2);
    expect(events.every((e) => (e.data as { orderId: string }).orderId === mine.id)).toBe(true);
    expect(live.frames.filter((f) => f.event === 'status')).toHaveLength(2);
  });

  it('replays what was missed after Last-Event-ID, then continues live, without repeats', async () => {
    const s = await scenario();
    const o = await placeOrder(http, s);
    const first = await stream(o.id, s.customer.auth);
    const [snapshot] = await first.events(1);
    first.close(); // customer goes offline (tunnel, bad signal)

    await accept(s, o.id);
    await step(s, o.id, 'PICKED_UP');
    await step(s, o.id, 'IN_PROCESS');

    const back = await stream(o.id, s.customer.auth, { 'Last-Event-ID': snapshot.id! });
    const replayed = await back.events(3);
    expect(replayed.map((e) => (e.data as { to: string }).to)).toEqual(['ACCEPTED', 'PICKED_UP', 'IN_PROCESS']);

    await step(s, o.id, 'READY');
    const all = await back.events(4);
    expect(all.map((e) => (e.data as { to: string }).to)).toEqual(['ACCEPTED', 'PICKED_UP', 'IN_PROCESS', 'READY']);
    expect(new Set(all.map((e) => e.id)).size).toBe(4);
  });

  it('a client that is already up to date gets nothing old, only what follows', async () => {
    const s = await scenario();
    const o = await placeOrder(http, s);
    await accept(s, o.id);
    const latest = String((await seqs(o.id)).at(-1));

    const live = await stream(o.id, s.customer.auth, { 'Last-Event-ID': latest });
    await new Promise((r) => setTimeout(r, 300));
    expect(live.frames.filter((f) => f.event === 'status')).toEqual([]);
    await step(s, o.id, 'PICKED_UP');
    const [event] = await live.events(1);
    expect(event.data).toMatchObject({ to: 'PICKED_UP' });
  });

  it('ignores a malformed Last-Event-ID and just starts from the current state', async () => {
    const s = await scenario();
    const o = await placeOrder(http, s);
    await accept(s, o.id);
    const live = await stream(o.id, s.customer.auth, { 'Last-Event-ID': 'not-a-number' });
    const events = await live.events(1);
    expect(events[0].data).toMatchObject({ to: 'ACCEPTED' });
  });

  it('delivers changes made by another process (the worker) through Redis', async () => {
    const s = await scenario();
    const o = await placeOrder(http, s);
    const live = await stream(o.id, s.customer.auth);
    await live.events(1);
    const seq = 99_999_999;
    await t.redis.publish(`order:${o.id}`, JSON.stringify({ seq, orderId: o.id, from: 'PLACED', to: 'REJECTED', at: new Date().toISOString(), actor: 'SYSTEM', reason: 'The vendor did not respond in time.' }));
    const events = await live.events(2);
    expect(events[1]).toMatchObject({ id: String(seq), data: { to: 'REJECTED', actor: 'SYSTEM', reason: 'The vendor did not respond in time.' } });
  });

  it('survives garbage on the channel and does not repeat an event it already sent', async () => {
    const s = await scenario();
    const o = await placeOrder(http, s);
    const live = await stream(o.id, s.customer.auth);
    await live.events(1);
    await t.redis.publish(`order:${o.id}`, 'this is not json');
    await accept(s, o.id);
    const [, accepted] = await live.events(2);
    // publish the same event again (a duplicate delivery): it must not appear twice
    await t.redis.publish(`order:${o.id}`, JSON.stringify(accepted.data));
    await new Promise((r) => setTimeout(r, 300));
    expect(live.frames.filter((f) => f.event === 'status')).toHaveLength(2);
  });

  describe('who may watch', () => {
    it('the customer, the vendor’s people and admins can; strangers get 404; no token 401; riders 403', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      const adm = await createAdmin(t);
      for (const auth of [s.customer.auth, s.vendor.owner.auth, adm.auth]) {
        const live = await stream(o.id, auth);
        expect(live.status).toBe(200);
        live.close();
      }

      const stranger = await anotherCustomer(t, basics, s);
      const otherVendor = await scenario();
      for (const auth of [stranger.customer.auth, otherVendor.vendor.owner.auth]) {
        expect((await stream(o.id, auth)).status).toBe(404);
      }
      const rider = await createUserWithToken(t, Role.RIDER);
      expect((await stream(o.id, rider.auth)).status).toBe(403);
      expect((await openSse(`${base}/orders/${o.id}/events`)).status).toBe(401);
      expect((await stream('not-a-uuid', s.customer.auth)).status).toBe(404);
      expect((await stream('00000000-0000-4000-8000-000000000000', s.customer.auth)).status).toBe(404);
    });
  });

  it('cleans up when a client disconnects (no leaked subscriptions)', async () => {
    const s = await scenario();
    const o = await placeOrder(http, s);
    const before = hub.activeStreams;
    const a = await stream(o.id, s.customer.auth);
    const b = await stream(o.id, s.vendor.owner.auth);
    await a.events(1);
    await b.events(1);
    expect(hub.activeStreams).toBe(before + 2);
    a.close();
    b.close();
    await waitFor(async () => hub.activeStreams === before, 4000, 'streams to close');
  });

  it('fans out to many watchers of one order', async () => {
    const s = await scenario();
    const o = await placeOrder(http, s);
    const watchers = await Promise.all(Array.from({ length: 15 }, () => stream(o.id, s.customer.auth)));
    await Promise.all(watchers.map((w) => w.events(1)));
    await accept(s, o.id);
    const results = await Promise.all(watchers.map((w) => w.events(2)));
    expect(results.every((events) => (events[1].data as { to: string }).to === 'ACCEPTED')).toBe(true);
  });
});
