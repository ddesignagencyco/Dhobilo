'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { TOKEN_TRANSPORT_HEADER } from '../api/config';
import { ApiError, ApiUnreachableError } from '../api/errors';
import { apiFetch } from '../api/fetch';
import { routing } from '@/i18n/routing';
import { mutateCustomerApi } from './server';
import { isVendorRole, writeVendorSession } from '../vendor/session';
import { writeRiderSession } from '../rider/session';
import {
  type CustomerSessionUser,
  clearCustomerSession,
  readCustomerSession,
  sessionFromAuthResponse,
  writeCustomerSession,
} from './session';

const phoneSchema = z.string().trim().min(10).max(20);
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

export interface OtpState {
  step?: 'phone' | 'code';
  phone?: string;
  expiresInSeconds?: number;
  error?: { code: string; message: string; requestId?: string };
}

export interface ProfileState {
  ok?: boolean;
  error?: { code: string; message: string; requestId?: string };
}

function toError(error: unknown): OtpState['error'] {
  if (error instanceof ApiError) return error.toDisplay();
  if (error instanceof ApiUnreachableError) return { code: 'API_UNREACHABLE', message: error.message };
  throw error;
}

/** Only ever return to a path on this site, and never back to the login or admin app. */
function safeReturnTo(next: string | undefined, locale: string): string {
  const fallback = `/${locale}`;
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  const rest = next.replace(/^\/[a-z]{2}(?=\/|$)/, '');
  if (!rest || rest === '/') return fallback;
  if (rest.startsWith('/login') || rest.startsWith('/admin')) return fallback;
  return next;
}

/** Send a 6-digit SMS code. Returns the code step on success; never throws for a user-facing error. */
export async function requestOtp(_locale: string, _prev: OtpState, formData: FormData): Promise<OtpState> {
  const parsed = phoneSchema.safeParse(formData.get('phone'));
  if (!parsed.success) {
    return {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Enter a valid phone number.',
      },
    };
  }

  try {
    const { data } = await apiFetch<{ expiresInSeconds: number }>('/auth/otp/request', {
      method: 'POST',
      body: { phone: parsed.data },
      retries: 0,
    });

    return {
      step: 'code',
      phone: parsed.data,
      expiresInSeconds: data.expiresInSeconds,
    };
  } catch (error) {
    return { step: 'phone', error: toError(error) };
  }
}

/** Exchange the code for tokens, then land on the page the customer came from. */
export async function verifyOtp(
  locale: string,
  next: string | undefined,
  _prev: OtpState,
  formData: FormData,
): Promise<OtpState> {
  const phone = phoneSchema.safeParse(formData.get('phone'));
  const code = codeSchema.safeParse(formData.get('code'));

  if (!phone.success || !code.success) {
    return {
      error: { code: 'VALIDATION_FAILED', message: 'Enter the 6-digit code.' },
    };
  }

  let destination: string;

  try {
    const { data } = await apiFetch<{
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
      user: CustomerSessionUser;
    }>('/auth/otp/verify', {
      method: 'POST',
      body: {
        phone: phone.data,
        code: code.data,
        role: formData.get('role') === 'VENDOR_OWNER' ? 'VENDOR_OWNER' : 'CUSTOMER',
      },
      headers: { ...TOKEN_TRANSPORT_HEADER },
      retries: 0,
    });

    // The account's real role decides which app it lands in; each role keeps its own session cookie.
    const session = sessionFromAuthResponse(data);
    if (data.user.role === 'CUSTOMER') {
      await writeCustomerSession(session);
      destination = safeReturnTo(next, locale);
    } else if (isVendorRole(data.user.role)) {
      await writeVendorSession(session);
      destination = `/${locale}/shop/orders`;
    } else if (data.user.role === 'RIDER') {
      await writeRiderSession(session);
      destination = `/${locale}/rider/home`;
    } else {
      return {
        step: 'phone',
        error: {
          code: 'NOT_CUSTOMER',
          message: 'Admins sign in at /admin/login.',
        },
      };
    }
  } catch (error) {
    return { step: 'code', error: toError(error) };
  }

  redirect(destination);
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
