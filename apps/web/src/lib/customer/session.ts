import 'server-only';

import { cookies } from 'next/headers';
import {
  type Session,
  type SessionUser,
  accessTokenIsFresh,
  sessionFromAuthResponse,
} from '../auth/session';

/**
 * The customer session lives in its own cookie, separate from `dh_admin_session`.
 *
 * Tokens never reach the browser here either: the customer UI talks to `/api/customer/bff`, which
 * attaches the access token server-side. The two roles must not share a cookie — signing into the
 * customer app should not sign an admin out, and a customer token must never be offered to an admin
 * route.
 */
export const CUSTOMER_SESSION_COOKIE = 'dh_customer_session';

export type CustomerSessionUser = SessionUser;
export type CustomerSession = Session;

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  };
}

function isSecureDeployment(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function readCustomerSession(): Promise<CustomerSession | null> {
  const raw = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CustomerSession;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user?.id) return null;
    // A vendor/rider token in this cookie would pass every customer page's guard but fail every API
    // call. Treat it as "not signed in" instead of rendering a shell full of 403s.
    if (parsed.user.role !== 'CUSTOMER') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCustomerSession(session: CustomerSession): Promise<void> {
  (await cookies()).set(CUSTOMER_SESSION_COOKIE, JSON.stringify(session), cookieOptions(isSecureDeployment()));
}

export async function clearCustomerSession(): Promise<void> {
  (await cookies()).set(CUSTOMER_SESSION_COOKIE, '', {
    ...cookieOptions(isSecureDeployment()),
    maxAge: 0,
  });
}

export { accessTokenIsFresh, sessionFromAuthResponse };
