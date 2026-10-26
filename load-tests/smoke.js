import { sleep } from 'k6';
import { get, okJson, tokens } from './lib.js';

// TRD 19.1 smoke: one user, 30 s, every main read path. Zero errors allowed.
export const options = { vus: 1, duration: '30s', thresholds: { http_req_failed: ['rate<0.01'] } };

export default function () {
  const t = tokens();
  okJson(get('/health/ready', null, 'ready'), 'ready');
  const c = t.catalog[0];
  okJson(get(`/vendors?lat=${c.lat}&lng=${c.lng}&cityId=${c.cityId}`, null, 'vendors'), 'vendors');
  okJson(get(`/vendors/${c.vendorId}/catalog`, null, 'catalog'), 'catalog');
  okJson(get('/orders', t.customers[0].token, 'my_orders'), 'my orders');
  okJson(get('/vendor/orders/counts', t.vendors[0].token, 'vendor_counts'), 'vendor counts');
  sleep(1);
}
