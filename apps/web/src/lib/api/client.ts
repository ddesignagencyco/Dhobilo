/**
 * Browser API client for vendor routes.
 * Wraps the BFF proxy which handles vendor session (VENDOR_SESSION_COOKIE).
 * For vendor API calls, use customerBff (same pattern as other non-admin users).
 */

import { customerBffData } from './bff';

export const apiClient = {
  async get<T>(path: string, options?: { params?: Record<string, unknown> }) {
    const query = options?.params ? new URLSearchParams(Object.entries(options.params).map(([k, v]) => [k, String(v)])).toString() : '';
    const fullPath = query ? `${path}?${query}` : path;
    const data = await customerBffData<T>(fullPath);
    return { data };
  },

  async post<T>(path: string, body?: unknown) {
    const data = await customerBffData<T>(path, {
      method: 'POST',
      body,
    });
    return { data };
  },

  async patch<T>(path: string, body?: unknown) {
    const data = await customerBffData<T>(path, {
      method: 'PATCH',
      body,
    });
    return { data };
  },

  async delete<T>(path: string) {
    const data = await customerBffData<T>(path, { method: 'DELETE' });
    return { data };
  },
};
