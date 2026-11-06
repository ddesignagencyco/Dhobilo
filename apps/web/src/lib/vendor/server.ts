import 'server-only';

import { ApiError } from '../api/errors';
import { apiFetch } from '../api/fetch';
import { readVendorSession } from './session';

export type VendorStatusValue = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface VendorProfileSummary {
  businessName: string;
  status: VendorStatusValue;
  rejectionReason: string | null;
}

/** The signed-in vendor's own profile, or `unregistered` for an owner who has not applied yet. */
export async function fetchVendorProfileSummary(): Promise<
  { kind: 'none' } | { kind: 'unregistered' } | { kind: 'ok'; profile: VendorProfileSummary }
> {
  const session = await readVendorSession();
  if (!session) return { kind: 'none' };
  try {
    const { data } = await apiFetch<VendorProfileSummary>('/vendor/profile', {
      accessToken: session.accessToken,
      retries: 0,
    });
    return { kind: 'ok', profile: data };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'VENDOR_NOT_REGISTERED') return { kind: 'unregistered' };
    throw error;
  }
}
