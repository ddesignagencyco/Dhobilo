'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError, ApiUnreachableError } from '../api/errors';
import { apiFetch } from '../api/fetch';
import { routing } from '@/i18n/routing';
import { mutateCustomerApi } from './server';
import { clearCustomerSession, readCustomerSession } from './session';

export interface ProfileState {
  ok?: boolean;
  error?: { code: string; message: string; requestId?: string };
}

function toError(error: unknown): ProfileState['error'] {
  if (error instanceof ApiError) return error.toDisplay();
  if (error instanceof ApiUnreachableError) return { code: 'API_UNREACHABLE', message: error.message };
  throw error;
}

export async function signOutCustomer(locale: string): Promise<void> {
  const session = await readCustomerSession();

  if (session) {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: { refreshToken: session.refreshToken },
        accessToken: session.accessToken,
        retries: 0,
      });
    } catch {
      // The API being unreachable must not trap the customer in a session they asked to end.
    }
  }

  await clearCustomerSession();
  redirect(`/${locale}/login`);
}

/** Name is the only profile field the customer UI edits here. */
export async function updateCustomerProfile(
  locale: string,
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const name = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .safeParse(formData.get('name') ?? '');

  if (!name.success) {
    return {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Enter your name (up to 80 characters).',
      },
    };
  }

  try {
    await mutateCustomerApi('/me', {
      method: 'PATCH',
      body: { name: name.data },
      retries: 0,
    });
    return { ok: true };
  } catch (error) {
    return { error: toError(error) };
  }
}

/** Persist the UI language on the account and move to the matching locale. */
export async function changeCustomerLanguage(locale: string, nextLocale: string): Promise<void> {
  if (!routing.locales.includes(nextLocale as (typeof routing.locales)[number])) {
    redirect(`/${locale}/profile`);
  }

  try {
    await mutateCustomerApi('/me', {
      method: 'PATCH',
      body: { locale: nextLocale === 'ur' ? 'UR' : 'EN' },
      retries: 0,
    });
  } catch {
    // The language still changes for this browser session even if the API is down; the next save
    // will persist it.
  }

  redirect(`/${nextLocale}/profile`);
}
