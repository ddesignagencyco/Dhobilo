import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { get, okJson, pktDate, post, tokens, uuid } from './lib.js';

// TRD 19.1: ramp to 200 VUs over 5 min and hold 10 min. Thresholds: failures < 1%, reads p95 < 800 ms,
// POST /orders p95 < 1500 ms. Override VUS, RAMP, HOLD (for example VUS=200 RAMP=1m HOLD=3m) for a shorter run.
const VUS = Number(__ENV.VUS || 200);
const STAGES = [
  { duration: __ENV.RAMP || '5m', target: VUS },
  { duration: __ENV.HOLD || '10m', target: VUS },
  { duration: '30s', target: 0 },
];

export const options = {
  stages: STAGES,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:vendors}': ['p(95)<800'],
    'http_req_duration{name:catalog}': ['p(95)<800'],
    'http_req_duration{name:slots}': ['p(95)<800'],
    'http_req_duration{name:estimate}': ['p(95)<800'],
    'http_req_duration{name:place_order}': ['p(95)<1500'],
    'http_req_duration{name:order_status}': ['p(95)<800'],
  },
};

const placed = new Counter('orders_placed');
const refused = new Counter('orders_refused_by_a_business_rule');
// how place-order calls ended, by status, so a refusal can be told from a fault
const byStatus = {};
for (const code of [201, 400, 401, 403, 404, 409, 422, 429, 500, 503]) byStatus[code] = new Counter(`place_order_status_${code}`);

export default function () {
  const t = tokens();
  const me = t.customers[((__VU - 1) * 7 + __ITER) % t.customers.length]; // rotate people so one person is not placing an order every few seconds
  const local = t.catalog.filter((c) => c.cityId === me.cityId); // order from a vendor in the customer's own city
  const v = local[Math.floor(Math.random() * local.length)];

  okJson(get(`/vendors?lat=${v.lat}&lng=${v.lng}&cityId=${v.cityId}`, me.token, 'vendors'), 'vendors');
  okJson(get(`/vendors/${v.vendorId}/catalog`, me.token, 'catalog'), 'catalog');

  const items = [{ serviceItemId: v.itemId, qty: 2 }];
  const est = post('/cart/estimate', { vendorId: v.vendorId, items }, me.token, 'estimate');
  if (!okJson(est, 'estimate')) return;
  const total = est.json('data.total');
  const turnaround = est.json('data.maxTurnaroundHours') || 48;

  const date = pktDate(1 + Math.floor(Math.random() * 3));
  const pickups = get(`/vendors/${v.vendorId}/slots?date=${date}&type=pickup`, me.token, 'slots');
  if (!okJson(pickups, 'pickup slots')) return;
  const free = (pickups.json('data.slots') || []).filter((s) => s.available);
  if (!free.length) return;
  const pickup = free[Math.floor(Math.random() * free.length)];
  const dDate = pktDate(5 + Math.floor(Math.random() * 2));
  const drops = get(`/vendors/${v.vendorId}/slots?date=${dDate}&type=delivery&pickupEnd=${encodeURIComponent(pickup.end)}&turnaroundHours=${turnaround}`, me.token, 'slots');
  const dfree = (drops.json('data.slots') || []).filter((s) => s.available);
  if (!dfree.length) return;

  const res = post(
    '/orders',
    { vendorId: v.vendorId, addressId: me.addressId, items, pickupSlotStart: pickup.start, deliverySlotStart: dfree[0].start, paymentMethod: 'COD', expectedTotal: total },
    me.token,
    'place_order',
    { 'Idempotency-Key': uuid() },
  );
  (byStatus[res.status] || byStatus[500]).add(1);
  if (res.status === 201) {
    placed.add(1);
    const id = res.json('data.id');
    for (let i = 0; i < 2; i++) {
      okJson(get(`/orders/${id}`, me.token, 'order_status'), 'order status');
      sleep(1);
    }
  } else if (res.status === 409 || res.status === 422) {
    refused.add(1); // a full slot or a changed price is a correct answer, not a failure
  } else {
    check(res, { 'order placed': () => false });
  }
  sleep(1);
}
