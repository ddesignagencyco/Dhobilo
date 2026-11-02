import 'server-only';

import { cookies } from 'next/headers';
import type { AdminRole, Role } from '@dhoblio/shared';

/**
 * Where the admin's tokens live.
 *
 * The API issues a short access token in the response body and a refresh token in an httpOnly cookie
 * scoped to `/api/v1/auth` with `SameSite=Strict`. That cookie is unusable from a browser on a different
 * origin to the API, so the panel asks for the refresh token in the body instead
 * (`x-token-transport: body`, see apps/api/src/modules/auth/auth.controller.ts) and keeps BOTH tokens in
 * its own httpOnly cookie on the web origin.
 *
 * Consequences, on purpose:
 *  - No token is ever readable from JavaScript, so an XSS in a chart library cannot exfiltrate a session.
 *  - The browser never talks to the API directly; everything goes through this app's server. See
 *    src/app/api/bff/[...path]/route.ts.
 *  - Web and API can sit on unrelated domains without any CORS or SameSite negotiation.
 *
 * The `user` field is for rendering and navigation only. It is NOT a permission source: every admin route
 * is enforced server-side by the API's @AdminAreaOnly guard, which reloads adminRole from the database on
 * each request. Treat this copy as a hint that can be stale or, for a hand-crafted request, a lie.
 */

export const SESSION_COOKIE = 'dh_admin_session';

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: Role;
  adminRole: AdminRole | null;
  locale: 'EN' | 'UR';
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires, computed from the API's `expiresIn`. */
  accessExpiresAt: number;
  user: SessionUser;
}

/** Refresh this long before the access token actually expires, so a slow request cannot race the clock. */
export const REFRESH_SKEW_MS = 60_000;

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // matches the API's refresh-token lifetime

function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    // Lax, not Strict: an admin following a deep link from email or chat must arrive signed in.
    // Safe here because the browser never carries a token to the API — only to this app's own server,
    // and every mutation goes through a POST route handler, not a GET.
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  };
}

export function isSecureDeployment(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function readSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    // A truncated or tampered cookie is treated as "not signed in" rather than crashing the render.
    return null;
  }
}

export async function writeSession(session: Session): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, JSON.stringify(session), cookieOptions(isSecureDeployment()));
}

export async function clearSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', { ...cookieOptions(isSecureDeployment()), maxAge: 0 });
}

/** Shapes the API's auth response into a session. */
export function sessionFromAuthResponse(body: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: SessionUser;
}, previousRefreshToken?: string): Session {
  const refreshToken = body.refreshToken ?? previousRefreshToken;
  if (!refreshToken) {
    // Without `x-token-transport: body` the API only sets the cookie, which this app cannot use.
    throw new Error('The API did not return a refresh token in the body; the transport header is missing.');
  }
  return {
    accessToken: body.accessToken,
    refreshToken,
    accessExpiresAt: Date.now() + body.expiresIn * 1000,
    user: body.user,
  };
}

export function accessTokenIsFresh(session: Session): boolean {
  return session.accessExpiresAt - REFRESH_SKEW_MS > Date.now();
}
