/**
 * Browser API client for customer routes.
 * Wraps the BFF proxy which handles the customer session (CUSTOMER_SESSION_COOKIE).
 */

import { customerBff } from './bff';

interface RequestOptions {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export const apiClient = {
  get<T>(path: string, options?: RequestOptions) {
    return customerBff<T>(path, { query: options?.params, headers: options?.headers });
  },

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return customerBff<T>(path, { method: 'POST', body, headers: options?.headers });
  },

  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return customerBff<T>(path, { method: 'PUT', body, headers: options?.headers });
  },

  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return customerBff<T>(path, { method: 'PATCH', body, headers: options?.headers });
  },

  delete<T>(path: string) {
    return customerBff<T>(path, { method: 'DELETE' });
  },
};
