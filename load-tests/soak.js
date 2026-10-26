import { sleep } from 'k6';
import { get, okJson, tokens } from './lib.js';

// 50 VUs for a long time (default 3 h). Watch memory, database connections and queue depth alongside it with
// ops/perf/watch.sh. Reads plus the vendor board, so nothing accumulates in the database.
//   DURATION=3h docker run ... k6 run /work/load-tests/soak.js
export const options = {
  vus: 50,
  duration: __ENV.DURATION || '3h',
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] },
};

export default function () {
  const t = tokens();
  const v = t.catalog[(__VU + __ITER) % t.catalog.length];
  const me = t.customers[(__VU - 1) % t.customers.length];
  okJson(get(`/vendors?lat=${v.lat}&lng=${v.lng}&cityId=${v.cityId}`, me.token, 'vendors'), 'vendors');
  okJson(get('/orders', me.token, 'my_orders'), 'my orders');
  const vend = t.vendors[(__VU - 1) % t.vendors.length];
  okJson(get('/vendor/orders?limit=20', vend.token, 'board'), 'board');
  sleep(2);
}
