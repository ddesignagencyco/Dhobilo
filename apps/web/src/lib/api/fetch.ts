import 'server-only';

import { REQUEST_TIMEOUT_MS, apiUrl } from './config';
import { ApiError, ApiUnreachableError } from './errors';
import type { ApiErrorBody } from '@dhoblio/shared';

/** What the API's response envelope looks like (apps/api/src/common/interceptors). */
interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiResult<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, unknown>;
  body?: unknown;
  accessToken?: string;
  headers?: Record<string, string>;
  /** Next's fetch cache. Admin data is live by default: a stale payout queue is a real problem. */
  cache?: RequestCache;
  revalidate?: number | false;
  tags?: string[];
  signal?: AbortSignal;
  /** How many times to retry a 503 SERVICE_BUSY / 429. The API sets Retry-After on 503. */
  retries?: number;
  timeoutMs?: number;
}

const DEFAULT_RETRIES = 2;

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  const fromHeader = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.min(fromHeader, 8_000);
  // 400ms, 1200ms, with jitter so a wave of admins does not retry in lockstep.
  return Math.min(400 * 3 ** attempt, 6_000) + Math.random() * 250;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One API call. Unwraps the `{ data }` envelope, turns `{ error }` into an ApiError, and retries the
 * codes the backend explicitly marked as retryable.
 *
 * Retrying is only safe because the admin mutations this panel makes are either idempotent server-side
 * or guarded by a state check that rejects a repeat (approve/reject/pay all check current state). The one
 * place that needs an Idempotency-Key is order placement, which the admin panel never does.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const {
    method = 'GET',
    query,
    body,
    accessToken,
    headers = {},
    cache,
    revalidate,
    tags,
    signal,
    retries = DEFAULT_RETRIES,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = options;

  const url = apiUrl(path, query);
  let lastError: ApiError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: composed,
        ...(cache ? { cache } : {}),
        ...(revalidate !== undefined || tags ? { next: { revalidate, tags } } : {}),
      });
    } catch (cause) {
      // A timeout or a refused connection. Retry GETs; a failed mutation must surface, because we cannot
      // know whether the server applied it.
      if (method === 'GET' && attempt < retries) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw new ApiUnreachableError(cause);
    }

    if (response.status === 204) return { data: undefined as T };

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }

    if (response.ok) {
      const envelope = parsed as Envelope<T> | undefined;
      // Raw responses (file downloads, SSE) opt out of the envelope; fall back to the parsed body.
      const hasEnvelope = !!envelope && typeof envelope === 'object' && 'data' in envelope;
      return {
        data: (hasEnvelope ? envelope.data : (parsed as T)) as T,
        meta: hasEnvelope ? envelope.meta : undefined,
      };
    }

    const errorBody = (parsed as Partial<ApiErrorBody> | undefined)?.error;
    const error = new ApiError(response.status, errorBody, response.statusText);

    if (error.isRetryable && attempt < retries) {
      lastError = error;
      await sleep(backoffMs(attempt, response.headers.get('Retry-After')));
      continue;
    }

    throw error;
  }

  throw lastError ?? new ApiUnreachableError();
}
