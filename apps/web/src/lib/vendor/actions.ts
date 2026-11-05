'use server';

import { redirect } from 'next/navigation';
import { apiFetch } from '../api/fetch';
import { clearVendorSession, readVendorSession } from './session';

export async function signOutVendor(locale: string): Promise<void> {
  const session = await readVendorSession();

  if (session) {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: { refreshToken: session.refreshToken },
        accessToken: session.accessToken,
        retries: 0,
      });
    } catch {
      // The API being unreachable must not trap the vendor in a session they asked to end.
    }
  }

  await clearVendorSession();
  redirect(`/${locale}/login`);
}
