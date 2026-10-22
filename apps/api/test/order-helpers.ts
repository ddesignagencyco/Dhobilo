import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import type request from 'supertest';
import { Basics, LiveVendorOpts, TestApp, createAddress, createCustomer, createLiveVendor, createUserWithToken } from './helpers';

// With the pinned "now" (Fri 2026-10-23 10:00 Karachi) and the default 48 h item: pickup Sat 10:00, delivery Mon 11:00.
export const PICKUP = '2026-10-24T05:00:00.000Z';
export const DELIVERY = '2026-10-26T06:00:00.000Z';

export async function orderScenario(t: TestApp, basics: Basics, vendorOpts: LiveVendorOpts = {}) {
  const vendor = await createLiveVendor(t, basics, vendorOpts);
  const customer = await createCustomer(t);
  const address = await createAddress(t, customer.user.id, basics.cityId);
  return { vendor, customer, address, item: vendor.items[0] };
}
export type OrderScenario = Awaited<ReturnType<typeof orderScenario>>;

/** A customer + saved address for an existing vendor. */
export async function anotherCustomer(t: TestApp, basics: Basics, s: OrderScenario): Promise<OrderScenario> {
  const customer = await createCustomer(t);
  return { ...s, customer, address: await createAddress(t, customer.user.id, basics.cityId) };
}

/** Places an order through the API (2 x Rs 100 + Rs 150 delivery = 350.00) and returns the order body. */
export async function placeOrder(http: ReturnType<typeof request>, s: OrderScenario, extra: Record<string, unknown> = {}) {
  const res = await http
    .post('/api/v1/orders')
    .set(s.customer.auth)
    .set('Idempotency-Key', randomUUID())
    .send({
      vendorId: s.vendor.vendor.id,
      addressId: s.address.id,
      items: [{ serviceItemId: s.item.id, qty: 2 }],
      pickupSlotStart: PICKUP,
      deliverySlotStart: DELIVERY,
      paymentMethod: 'COD',
      expectedTotal: '350.00',
      ...extra,
    })
    .expect(201);
  return res.body.data as { id: string; orderNo: string; status: string };
}

/** A staff member of the scenario's vendor, with a token. */
export async function addStaff(t: TestApp, s: OrderScenario) {
  const staff = await createUserWithToken(t, Role.VENDOR_STAFF);
  await t.prisma.vendorStaff.create({ data: { vendorId: s.vendor.vendor.id, userId: staff.user.id } });
  return staff;
}

/** Polls until `check` returns a truthy value (for work done by background workers). */
export async function waitFor<T>(check: () => Promise<T | null | undefined | false>, timeoutMs = 8000, label = 'condition'): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

export interface SseFrame {
  id?: string;
  event?: string;
  data?: unknown;
}

/** A tiny SSE client for tests: reads the stream in the background and lets you wait for specific events. */
export async function openSse(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const res = await fetch(url, { headers: { accept: 'text/event-stream', ...headers }, signal: controller.signal });
  const frames: SseFrame[] = [];
  let ended = false;

  if (res.ok && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let cut: number;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const frame: SseFrame = {};
            for (const line of block.split('\n')) {
              if (line.startsWith('id:')) frame.id = line.slice(3).trim();
              else if (line.startsWith('event:')) frame.event = line.slice(6).trim();
              else if (line.startsWith('data:')) frame.data = JSON.parse(line.slice(5).trim());
            }
            frames.push(frame);
          }
        }
      } catch {
        /* aborted */
      } finally {
        ended = true;
      }
    })();
  }

  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    frames,
    get ended() {
      return ended;
    },
    /** Waits until at least `count` frames of type `event` have arrived, then returns all of them. */
    async events(count: number, event = 'status', timeoutMs = 4000) {
      return waitFor(async () => {
        const got = frames.filter((f) => f.event === event);
        return got.length >= count ? got : null;
      }, timeoutMs, `${count} "${event}" event(s)`);
    },
    close: () => controller.abort(),
  };
}
