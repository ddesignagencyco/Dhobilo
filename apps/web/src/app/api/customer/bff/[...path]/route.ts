import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { refreshSession } from '@/lib/auth/refresh';
import {
  accessTokenIsFresh,
  clearCustomerSession,
  readCustomerSession,
  writeCustomerSession,
} from '@/lib/customer/session';

/**
 * The customer app's only door to the API, kept separate from the admin BFF.
 *
 * Same rules as `/api/bff`: same-origin, no token in JavaScript, thin pass-through of status and the
 * API envelope. A customer token is never attached to an admin request, nor the other way round.
 */

const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'accept-language', 'idempotency-key'];
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'retry-after', 'cache-control'];

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;

  if (MUTATING.has(request.method) && !originAllowed(request)) {
    return NextResponse.json(
      { error: { code: 'CSRF_ORIGIN', message: 'That request did not come from the customer app.' } },
      { status: 403 },
    );
  }

  let session = await readCustomerSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Your session expired. Please sign in again.' } },
      { status: 401 },
    );
  }

  if (!accessTokenIsFresh(session)) {
    try {
      session = await refreshSession(session);
      await writeCustomerSession(session);
    } catch (error) {
      await clearCustomerSession();
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

export const dynamic = 'force-dynamic';
