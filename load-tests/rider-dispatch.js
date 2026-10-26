import { sleep } from 'k6';
import { get, okJson, post, tokens } from './lib.js';

// TRD 19.1: 100 riders sending their location every 15 s and looking at jobs. p95 < 500 ms.
export const options = {
  vus: 100,
  duration: __ENV.QUICK ? '60s' : '5m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:location}': ['p(95)<500'],
    'http_req_duration{name:available_jobs}': ['p(95)<500'],
    'http_req_duration{name:my_jobs}': ['p(95)<500'],
  },
};

export function setup() {
  const t = tokens();
  for (const r of t.riders) post('/rider/online', { lat: 31.52, lng: 74.35 }, r.token, 'online');
}

export default function () {
  const t = tokens();
  const me = t.riders[(__VU - 1) % t.riders.length];
  const jitter = () => (Math.random() - 0.5) * 0.05;
  okJson(post('/rider/location', { lat: 31.52 + jitter(), lng: 74.35 + jitter() }, me.token, 'location'), 'location');
  okJson(get('/rider/jobs/available', me.token, 'available_jobs'), 'available jobs');
  okJson(get('/rider/jobs', me.token, 'my_jobs'), 'my jobs');
  sleep(__ENV.QUICK ? 5 : 15);
}
