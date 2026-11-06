import 'server-only';

import { cookies } from 'next/headers';
import type { Session } from '../auth/session';

export const VENDOR_SESSION_COOKIE = 'dh_vendor_session';

export type VendorSession = Session;

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  };
}

export function isVendorRole(role: string | undefined): boolean {
  return role === 'VENDOR_OWNER' || role === 'VENDOR_STAFF';
}

export async function readVendorSession(): Promise<VendorSession | null> {
  const raw = (await cookies()).get(VENDOR_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VendorSession;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user?.id) return null;
    if (!isVendorRole(parsed.user.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeVendorSession(session: VendorSession): Promise<void> {
  (await cookies()).set(VENDOR_SESSION_COOKIE, JSON.stringify(session), cookieOptions());
}

export async function clearVendorSession(): Promise<void> {
  (await cookies()).set(VENDOR_SESSION_COOKIE, '', {
    ...cookieOptions(),
    maxAge: 0,
  });
}
