'use server';

import { redirect } from 'next/navigation';
import { apiFetch } from '../api/fetch';
import { clearRiderSession, readRiderSession } from './session';

export async function signOutRider(locale: string): Promise<void> {
  const session = await readRiderSession();

  if (session) {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: { refreshToken: session.refreshToken },
        accessToken: session.accessToken,
        retries: 0,
      });
    } catch {
      // The API being unreachable must not trap the rider in a session they asked to end.
    }
  }

  await clearRiderSession();
  redirect(`/${locale}/rider/login`);
}
