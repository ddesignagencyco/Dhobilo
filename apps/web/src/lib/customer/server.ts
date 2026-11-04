import 'server-only';

import { redirect } from 'next/navigation';
import { refreshSession } from '../auth/refresh';
import { ApiError } from '../api/errors';
import { type ApiResult, type RequestOptions, apiFetch } from '../api/fetch';
import {
  type CustomerSession,
  accessTokenIsFresh,
  clearCustomerSession,
  readCustomerSession,
  writeCustomerSession,
} from './session';

/** Mirrors lib/api/server.ts, but reads and refreshes the customer cookie. */
export class CustomerSessionRequiredError extends Error {
  constructor() {
    super('No customer session');
    this.name = 'CustomerSessionRequiredError';
  }
}

export async function fetchCustomerApi<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const session = await readCustomerSession();
  if (!session) throw new CustomerSessionRequiredError();
  return apiFetch<T>(path, { ...options, accessToken: session.accessToken });
}

/** Read that redirects to the customer login instead of throwing. */
export async function fetchForCustomerPage<T>(
  path: string,
  options: RequestOptions & { locale: string; returnTo?: string } = { locale: 'en' },
): Promise<ApiResult<T>> {
  const { locale, returnTo, ...rest } = options;
  try {
    return await fetchCustomerApi<T>(path, rest);
  } catch (error) {
    if (error instanceof CustomerSessionRequiredError || (error instanceof ApiError && error.isSessionExpired)) {
      redirect(customerLoginPath(locale, returnTo));
    }
    throw error;
  }
}

export function customerLoginPath(locale: string, returnTo?: string): string {
  const base = `/${locale}/login`;
  return returnTo ? `${base}?next=${encodeURIComponent(returnTo)}` : base;
}

/** Mutating call from a Server Action or Route Handler; may persist a rotated refresh token. */
export async function mutateCustomerApi<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  let session = await readCustomerSession();
  if (!session) throw new CustomerSessionRequiredError();

  if (!accessTokenIsFresh(session)) {
    session = await refreshAndPersist(session);
  }

  try {
    return await apiFetch<T>(path, { ...options, accessToken: session.accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.isSessionExpired) {
      const refreshed = await refreshAndPersist(session);
      return apiFetch<T>(path, { ...options, accessToken: refreshed.accessToken });
    }
    throw error;
  }
}

async function refreshAndPersist(session: CustomerSession): Promise<CustomerSession> {
  try {
    const next = await refreshSession(session);
    await writeCustomerSession(next);
    return next;
  } catch (error) {
    await clearCustomerSession();
    throw error instanceof ApiError ? error : new CustomerSessionRequiredError();
  }
}

/** The signed-in customer, or null. Rendering and navigation only; the API enforces permissions. */
export async function currentCustomer() {
  const session = await readCustomerSession();
  return session?.user ?? null;
}
