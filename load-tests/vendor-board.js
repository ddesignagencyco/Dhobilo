import { sleep } from 'k6';
import { get, okJson, post, tokens } from './lib.js';

// TRD 19.1: 50 VUs polling the board and moving orders along. p95 < 600 ms.
export const options = {
  vus: 50,
  duration: __ENV.QUICK ? '40s' : '5m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:board}': ['p(95)<600'],
    'http_req_duration{name:counts}': ['p(95)<600'],
    'http_req_duration{name:detail}': ['p(95)<600'],
    'http_req_duration{name:analytics}': ['p(95)<600'],
  },
};

export default function () {
  const t = tokens();
  const me = t.vendors[(__VU - 1) % t.vendors.length];
  okJson(get('/vendor/orders/counts', me.token, 'counts'), 'counts');
  const board = get('/vendor/orders?limit=20', me.token, 'board');
  okJson(board, 'board');
  const rows = board.json('data') || [];
  if (rows.length) okJson(get(`/vendor/orders/${rows[0].id}`, me.token, 'detail'), 'detail');
  const waiting = get('/vendor/orders?status=PLACED&limit=5', me.token, 'board');
  const first = (waiting.json('data') || [])[0];
  if (first && Math.random() < 0.3) {
    const r = post(`/vendor/orders/${first.id}/accept`, {}, me.token, 'accept');
    if (r.status >= 500) okJson(r, 'accept'); // 409 (already answered) is a correct answer
  }
  okJson(get('/vendor/analytics?days=7', me.token, 'analytics'), 'analytics');
  sleep(2);
}
