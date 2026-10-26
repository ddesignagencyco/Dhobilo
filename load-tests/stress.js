import { sleep } from 'k6';
import { get, okJson, tokens } from './lib.js';

// Steps the load up until something gives. The point is to learn the breaking point and to confirm that failure
// is graceful (429 / 503 and recovery, never wrong data). Reads only, so the database is unchanged afterwards.
// MAX caps the top step (default 1000 VUs); QUICK shortens every step to 15 s.
const MAX = Number(__ENV.MAX || 1000);
const STEP_DURATION = __ENV.QUICK ? '15s' : '2m';

export const options = {
  stages: [100, 200, 400, 600, 800, 1000].filter((v) => v <= MAX).map((target) => ({ duration: STEP_DURATION, target })).concat([{ duration: '15s', target: 0 }]),
  thresholds: { http_req_failed: [{ threshold: 'rate<0.2', abortOnFail: false }] },
};

export default function () {
  const t = tokens();
  const v = t.catalog[(__VU + __ITER) % t.catalog.length];
  const me = t.customers[(__VU - 1) % t.customers.length];
  okJson(get(`/vendors?lat=${v.lat}&lng=${v.lng}&cityId=${v.cityId}`, me.token, 'vendors'), 'vendors');
  okJson(get(`/vendors/${v.vendorId}/catalog`, me.token, 'catalog'), 'catalog');
  okJson(get('/orders', me.token, 'my_orders'), 'my orders');
  sleep(0.5);
}
