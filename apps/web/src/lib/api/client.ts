/**
 * Browser API client for customer routes.
 * Wraps the BFF proxy which handles the customer session (CUSTOMER_SESSION_COOKIE).
 */

import { customerBff, riderBff, vendorBff } from './bff';

interface RequestOptions {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
}

type BffFn = <T>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, string>;
  },
) => ReturnType<typeof customerBff<T>>;

function makeClient(bff: BffFn) {
  return {
    get: <T>(path: string, options?: RequestOptions) =>
      bff<T>(path, { query: options?.params, headers: options?.headers }),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      bff<T>(path, { method: 'POST', body, headers: options?.headers }),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      bff<T>(path, { method: 'PUT', body, headers: options?.headers }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      bff<T>(path, { method: 'PATCH', body, headers: options?.headers }),
    delete: <T>(path: string) => bff<T>(path, { method: 'DELETE' }),
  };
}

export const vendorApiClient = makeClient(vendorBff);
export const riderApiClient = makeClient(riderBff);

export const apiClient = {
  get<T>(path: string, options?: RequestOptions) {
    return customerBff<T>(path, {
      query: options?.params,
      headers: options?.headers,
    });
  },

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return customerBff<T>(path, {
      method: 'POST',
      body,
      headers: options?.headers,
    });
  },

  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return customerBff<T>(path, {
      method: 'PUT',
      body,
      headers: options?.headers,
    });
  },

  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return customerBff<T>(path, {
      method: 'PATCH',
      body,
      headers: options?.headers,
    });
  },

  delete<T>(path: string) {
    return customerBff<T>(path, { method: 'DELETE' });
  },
};
