import 'server-only';

/**
 * Where the API lives, from the server's point of view. Never exposed to the browser: the browser talks
 * only to this app's own /api/bff proxy, so there is no NEXT_PUBLIC_ equivalent of this on purpose.
 */
export const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

/** Asks the API to return the refresh token in the response body (see src/lib/auth/session.ts). */
export const TOKEN_TRANSPORT_HEADER = { 'x-token-transport': 'body' } as const;

/** Default server-side timeout. The slowest admin endpoints are reports, which are queued, not inline. */
export const REQUEST_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS ?? 20_000);

export function apiUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        for (const v of value) if (v !== undefined && v !== null && v !== '') url.searchParams.append(key, String(v));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}
