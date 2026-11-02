import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { refreshSession } from '@/lib/auth/refresh';
import { accessTokenIsFresh, clearSession, readSession, writeSession } from '@/lib/auth/session';

/**
 * The browser's only door to the API.
 *
 * Client components fetch through here (same origin, no CORS, no token in JavaScript) and this handler
 * attaches the access token server-side. It is deliberately a thin pass-through: it forwards the status
 * and the API's response envelope untouched, so TanStack Query sees exactly what the API said, including
 * `meta` cursors and error codes.
 *
 * It grants no extra privilege — the token it attaches is the admin's own, and every route behind it is
 * still guarded by the API's @Roles and @AdminAreaOnly. What it does do is keep the token out of reach
 * of any script running on the page.
 */

const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'accept-language', 'idempotency-key'];
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'retry-after', 'cache-control'];

/** Methods that change state must come from our own origin, mirroring the API's own CSRF check. */
const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin navigations and non-browser clients send no Origin
  const self = new URL(request.url).origin;
  return origin === self;
}

async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;

  if (MUTATING.has(request.method) && !originAllowed(request)) {
    return NextResponse.json(
      { error: { code: 'CSRF_ORIGIN', message: 'That request did not come from the admin panel.' } },
      { status: 403 },
    );
  }

  let session = await readSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Your session expired. Please sign in again.' } },
      { status: 401 },
    );
  }

  // Refresh before spending a token we already know is stale. A route handler may set cookies, so unlike
  // an RSC render this can persist the rotation.
  if (!accessTokenIsFresh(session)) {
    try {
      session = await refreshSession(session);
      await writeSession(session);
    } catch (error) {
      await clearSession();
      const status = error instanceof ApiError ? error.status : 401;
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Your session expired. Please sign in again.' } },
        { status: status === 403 ? 401 : status },
      );
    }
  }

  const incoming = new URL(request.url);
  const target = new URL(`${API_BASE_URL}/${path.join('/')}`);
  target.search = incoming.search;

  const headers = new Headers({ Authorization: `Bearer ${session.accessToken}` });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      // Never let Next cache a proxied admin read: payout queues and dispatch boards must be live.
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'API_UNREACHABLE', message: 'Could not reach the Dhoblio API.' } },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set('Cache-Control', 'no-store');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;

/** Report downloads stream through here, so do not try to pre-render or cache this route. */
export const dynamic = 'force-dynamic';
