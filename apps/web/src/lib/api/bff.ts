import {
  type ApiErrorBody,
  adminErrorMessage,
  isSessionErrorCode,
  validationDetails,
  type FieldError,
} from '@dhoblio/shared';

/**
 * The browser's API client. Talks only to this app's own /api/bff proxy, which attaches the access token
 * server-side (see src/app/api/bff/[...path]/route.ts), so nothing here ever handles a token.
 */

export class BffError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, body: Partial<ApiErrorBody['error']> | undefined, fallback?: string) {
    const code = body?.code ?? 'INTERNAL_ERROR';
    super(adminErrorMessage(code, body?.message ?? fallback));
    this.name = 'BffError';
    this.status = status;
    this.code = code;
    this.details = body?.details;
    this.requestId = body?.requestId;
  }

  get isSessionExpired(): boolean {
    return isSessionErrorCode(this.code) || this.status === 401;
  }

  get isForbidden(): boolean {
    return this.code === 'FORBIDDEN' || this.status === 403;
  }

  get fieldErrors(): FieldError[] {
    return validationDetails(this.details);
  }
}

export interface BffResult<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface BffOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

function bffUrl(base: string, path: string, query?: Record<string, unknown>): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${clean}`, window.location.origin);
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

/**
 * On an expired session the whole page is reloaded rather than redirected in the router: middleware then
 * does the redirect with a `next` parameter, so the admin lands back where they were after signing in.
 */
function handleSessionExpiry(): never {
  window.location.reload();
  // `reload()` does not return, but TypeScript cannot know that.
  throw new BffError(401, { code: 'UNAUTHENTICATED', message: 'Your session expired.' });
}

export async function bff<T>(path: string, options: BffOptions = {}): Promise<BffResult<T>> {
  return bffAt('/api/bff', path, options);
}

async function bffAt<T>(base: string, path: string, options: BffOptions = {}): Promise<BffResult<T>> {
  const { method = 'GET', query, body, signal, headers = {} } = options;

  const response = await fetch(bffUrl(base, path, query), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    credentials: 'same-origin',
  });

  if (response.status === 204) return { data: undefined as T };

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  if (!response.ok) {
    const errorBody = (parsed as Partial<ApiErrorBody> | undefined)?.error;
    const error = new BffError(response.status, errorBody, response.statusText);
    if (error.isSessionExpired) handleSessionExpiry();
    throw error;
  }

  const envelope = parsed as BffResult<T> | undefined;
  const hasEnvelope = !!envelope && typeof envelope === 'object' && 'data' in envelope;
  return {
    data: (hasEnvelope ? envelope.data : (parsed as T)) as T,
    meta: hasEnvelope ? envelope.meta : undefined,
  };
}

/** Convenience for TanStack Query, which only wants the payload. */
export async function bffData<T>(path: string, options: BffOptions = {}): Promise<T> {
  return (await bff<T>(path, options)).data;
}

/** Customer app variants: same client, different session cookie behind the proxy. */
export async function customerBff<T>(path: string, options: BffOptions = {}): Promise<BffResult<T>> {
  return bffAt('/api/customer/bff', path, options);
}

export async function customerBffData<T>(path: string, options: BffOptions = {}): Promise<T> {
  return (await customerBff<T>(path, options)).data;
}

export async function vendorBff<T>(path: string, options: BffOptions = {}): Promise<BffResult<T>> {
  return bffAt('/api/vendor/bff', path, options);
}

export async function riderBff<T>(path: string, options: BffOptions = {}): Promise<BffResult<T>> {
  return bffAt('/api/rider/bff', path, options);
}
