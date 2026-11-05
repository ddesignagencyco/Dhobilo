import 'server-only';

import { cookies } from 'next/headers';
import type { Session } from '../auth/session';

export const RIDER_SESSION_COOKIE = 'dh_rider_session';

export type RiderSession = Session;

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

export async function readRiderSession(): Promise<RiderSession | null> {
  const raw = (await cookies()).get(RIDER_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RiderSession;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user?.id) return null;
    if (parsed.user.role !== 'RIDER') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeRiderSession(session: RiderSession): Promise<void> {
  (await cookies()).set(RIDER_SESSION_COOKIE, JSON.stringify(session), cookieOptions(isSecureDeployment()));
}

export async function clearRiderSession(): Promise<void> {
  (await cookies()).set(RIDER_SESSION_COOKIE, '', {
    ...cookieOptions(isSecureDeployment()),
    maxAge: 0,
  });
}
