import 'server-only';

import { redirect } from 'next/navigation';
import { refreshSession } from '../auth/refresh';
import {
  type Session,
  accessTokenIsFresh,
  clearSession,
  readSession,
  writeSession,
} from '../auth/session';
import { ApiError } from './errors';
import { type ApiResult, type RequestOptions, apiFetch } from './fetch';

/**
 * Two ways to call the API from the server, because Next draws a hard line through the middle of them:
 * a React Server Component may not set cookies during render, so it cannot persist a refreshed session.
 *
 *  - `fetchFromApi`  — read path, safe inside any RSC. Uses the access token as-is. If it is expired,
 *                      the call fails and the caller sends the admin to the login screen. Middleware
 *                      refreshes ahead of the render, so in practice this rarely triggers.
 *  - `mutateApi`     — Server Actions and Route Handlers only. May refresh and write the new session.
 *
 * Calling `mutateApi` from an RSC render throws a Next error about cookies, which is the behaviour we
 * want: it is a programming mistake, not something to paper over.
 */

export class SessionRequiredError extends Error {
  constructor() {
    super('No admin session');
    this.name = 'SessionRequiredError';
  }
}

/** RSC-safe read. Throws SessionRequiredError when there is no session at all. */
export async function fetchFromApi<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const session = await readSession();
  if (!session) throw new SessionRequiredError();
  return apiFetch<T>(path, { ...options, accessToken: session.accessToken });
}

/**
 * Read that redirects to the login screen instead of throwing, for use at the top of a page component.
 * `nextPath` is where to come back to after signing in.
 */
export async function fetchForPage<T>(
  path: string,
  options: RequestOptions & { locale: string; returnTo?: string } = { locale: 'en' },
): Promise<ApiResult<T>> {
  const { locale, returnTo, ...rest } = options;
  try {
    return await fetchFromApi<T>(path, rest);
  } catch (error) {
    if (error instanceof SessionRequiredError || (error instanceof ApiError && error.isSessionExpired)) {
      redirect(loginPath(locale, returnTo));
    }
    throw error;
  }
}

export function loginPath(locale: string, returnTo?: string): string {
  const base = `/${locale}/admin/login`;
  return returnTo ? `${base}?next=${encodeURIComponent(returnTo)}` : base;
}

/**
 * Mutating call from a Server Action or Route Handler. Refreshes the access token first when it is close
 * to expiry, and once more if the API still answers UNAUTHENTICATED.
 */
export async function mutateApi<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  let session = await readSession();
  if (!session) throw new SessionRequiredError();

  if (!accessTokenIsFresh(session)) {
    session = await refreshAndPersist(session);
  }

  try {
    return await apiFetch<T>(path, { ...options, accessToken: session.accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.isSessionExpired) {
      // The token was rejected even though we thought it was fresh (clock skew, or a role change that
      // revoked the session). One refresh, one retry, then give up.
      const refreshed = await refreshAndPersist(session);
      return apiFetch<T>(path, { ...options, accessToken: refreshed.accessToken });
    }
    throw error;
  }
}

async function refreshAndPersist(session: Session): Promise<Session> {
  try {
    const next = await refreshSession(session);
    await writeSession(next);
    return next;
  } catch (error) {
    await clearSession();
    throw error instanceof ApiError ? error : new SessionRequiredError();
  }
}

/** The signed-in admin, or null. Rendering and navigation only — the API enforces real permissions. */
export async function currentAdmin() {
  const session = await readSession();
  return session?.user ?? null;
}
