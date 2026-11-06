'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { TOKEN_TRANSPORT_HEADER } from '../api/config';
import { ApiError, ApiUnreachableError } from '../api/errors';
import { apiFetch } from '../api/fetch';
import { type SessionUser, clearSession, readSession, sessionFromAuthResponse, writeSession } from './session';

const loginSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1),
});

export interface LoginState {
  /** Echoed back so a failed attempt does not wipe what the person typed (React resets the form). */
  email?: string;
  error?: { code: string; message: string; requestId?: string };
}

/**
 * Only ever return to a path on this site. A `next` of `https://evil.example` would otherwise turn the
 * login form into an open redirect.
 */
function safeReturnTo(next: string | undefined, locale: string): string {
  const fallback = `/${locale}/admin`;
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  // Must stay inside the admin panel; anything else is not ours to send staff to.
  const withoutLocale = next.replace(/^\/[a-z]{2}(?=\/)/, '');
  if (!withoutLocale.startsWith('/admin')) return fallback;
  if (withoutLocale.startsWith('/admin/login')) return fallback;
  return next;
}

export async function signIn(
  locale: string,
  next: string | undefined,
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const submittedEmail = String(formData.get('email') ?? '');
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      email: submittedEmail,
      error: { code: 'VALIDATION_FAILED', message: 'Enter a valid email address and your password.' },
    };
  }

  let destination: string;

  try {
    const { data } = await apiFetch<{
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
      user: SessionUser;
    }>('/auth/admin/login', {
      method: 'POST',
      body: parsed.data,
      headers: { ...TOKEN_TRANSPORT_HEADER },
      // A wrong password must not be retried: the API locks the account after 5 failures, and a retry
      // would spend two of those five on one click.
      retries: 0,
    });

    if (data.user.role !== 'ADMIN') {
      return { email: submittedEmail, error: { code: 'NOT_ADMIN', message: 'That account is not an admin account.' } };
    }

    await writeSession(sessionFromAuthResponse(data));
    destination = safeReturnTo(next, locale);
  } catch (error) {
    if (error instanceof ApiError) {
      return { email: submittedEmail, error: error.toDisplay() };
    }
    if (error instanceof ApiUnreachableError) {
      return { email: submittedEmail, error: { code: 'API_UNREACHABLE', message: error.message } };
    }
    throw error;
  }

  // redirect() throws, so it must sit outside the try block or it would be caught as a failure.
  redirect(destination);
}

export async function signOut(locale: string): Promise<void> {
  const session = await readSession();

  if (session) {
    try {
      // Revokes the refresh-token chain server-side, so a copied cookie cannot outlive the sign-out.
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: { refreshToken: session.refreshToken },
        accessToken: session.accessToken,
        retries: 0,
      });
    } catch {
      // The API being unreachable must not trap an admin in a session they asked to end: clear locally.
    }
  }

  await clearSession();
  redirect(`/${locale}/admin/login`);
}
