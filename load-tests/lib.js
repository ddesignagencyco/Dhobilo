import { SharedArray } from 'k6/data';
import http from 'k6/http';
import { check } from 'k6';

export const BASE = __ENV.BASE_URL || 'http://host.docker.internal:4100/api/v1';

// Tokens and ids minted by ops/perf/mint-tokens.js (the file is not committed).
export const data = new SharedArray('tokens', () => [JSON.parse(open(__ENV.TOKENS || '/work/ops/perf/tokens.json'))]);
export const tokens = () => data[0];

/** A different client address per virtual user, so per-IP limits behave as they would for real people. */
export function headersFor(token, extra = {}) {
  const ip = `10.${(__VU >> 8) & 255}.${__VU & 255}.${(__ITER % 250) + 1}`;
  return { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

export const get = (path, token, name) => http.get(`${BASE}${path}`, { headers: headersFor(token), tags: { name } });
export const post = (path, body, token, name, extra) => http.post(`${BASE}${path}`, JSON.stringify(body ?? {}), { headers: headersFor(token, extra), tags: { name } });

export const okJson = (res, label) => check(res, { [`${label} 2xx`]: (r) => r.status >= 200 && r.status < 300 });

export function uuid() {
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) s += i === 8 || i === 13 || i === 18 || i === 23 ? '-' : i === 14 ? '4' : h[Math.floor(Math.random() * 16)];
  return s;
}

/** The yyyy-mm-dd of a day n days from now in Pakistan time (UTC+5). */
export function pktDate(daysAhead) {
  return new Date(Date.now() + 5 * 3600_000 + daysAhead * 86_400_000).toISOString().slice(0, 10);
}
