import http from 'k6/http';
import crypto from 'k6/crypto';
import { check } from 'k6';
import { BASE } from './lib.js';

// 500 identical gateway notifications at once. Exactly one state change must result; the rest are accepted as
// duplicates. Needs an order with a pending online payment: run ops/perf/prepare-webhook-burst.js, which prints
// the GATEWAY_REF and AMOUNT to pass in, then check the database afterwards (ops/perf/check-webhook-burst.sh).
export const options = {
  scenarios: { burst: { executor: 'shared-iterations', vus: 100, iterations: 500, maxDuration: '1m' } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1000'] },
};

const SECRET = __ENV.PAYMENT_MOCK_WEBHOOK_SECRET;
const REF = __ENV.GATEWAY_REF;
const AMOUNT = __ENV.AMOUNT;

export default function () {
  const body = JSON.stringify({ gatewayRef: REF, status: 'PAID', amount: AMOUNT, eventId: 'evt-burst-1' });
  const sig = crypto.hmac('sha256', SECRET, body, 'hex');
  const res = http.post(`${BASE}/webhooks/card`, body, {
    headers: { 'Content-Type': 'application/json', 'x-payment-signature': sig, 'X-Forwarded-For': `10.9.${__VU}.1` },
  });
  check(res, { accepted: (r) => r.status === 200 });
}
