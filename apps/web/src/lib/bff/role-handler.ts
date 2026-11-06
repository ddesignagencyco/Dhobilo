import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { type Session, accessTokenIsFresh } from '@/lib/auth/session';
import { refreshSession } from '@/lib/auth/refresh';

/**
 * One same-origin proxy per role. Same rules everywhere: no token in JavaScript, the access token is
 * attached server-side, and a token for one role is never offered to another role's routes.
 */
export interface RoleSessionStore {
  read: () => Promise<Session | null>;
  write: (session: Session) => Promise<void>;
  clear: () => Promise<void>;
}

const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'accept-language', 'idempotency-key'];
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'retry-after', 'cache-control'];

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export function createRoleBffHandler(role: RoleSessionStore) {
  return async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
    const { path } = await context.params;

    if (MUTATING.has(request.method) && !originAllowed(request)) {
      return NextResponse.json(
        {
          error: {
            code: 'CSRF_ORIGIN',
            message: 'That request did not come from the customer app.',
          },
        },
        { status: 403 },
      );
    }

    let session = await role.read();
    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Your session expired. Please sign in again.',
          },
        },
        { status: 401 },
      );
    }

    if (!accessTokenIsFresh(session)) {
      try {
        session = await refreshSession(session);
        await role.write(session);
      } catch (error) {
        await role.clear();
        const status = error instanceof ApiError ? error.status : 401;
        return NextResponse.json(
          {
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Your session expired. Please sign in again.',
            },
          },
          { status: status === 403 ? 401 : status },
        );
      }
    }

    const incoming = new URL(request.url);
    const target = new URL(`${API_BASE_URL}/${path.join('/')}`);
    target.search = incoming.search;

    const headers = new Headers({
      Authorization: `Bearer ${session.accessToken}`,
    });
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
        {
          error: {
            code: 'API_UNREACHABLE',
            message: 'Could not reach the Dhoblio API.',
          },
        },
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
  };
}
