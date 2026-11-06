'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { TOKEN_TRANSPORT_HEADER } from '../api/config';
import { ApiError, ApiUnreachableError } from '../api/errors';
import { apiFetch } from '../api/fetch';
import { writeCustomerSession } from '../customer/session';
import { writeRiderSession } from '../rider/session';
import { isVendorRole, writeVendorSession } from '../vendor/session';
import { type SessionUser, sessionFromAuthResponse } from './session';

export type OtpRole = 'customer' | 'vendor' | 'rider';
export type AccountArea = OtpRole | 'admin';

const phoneSchema = z.string().trim().min(10).max(20);
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

export interface OtpState {
  step?: 'phone' | 'code';
  phone?: string;
  expiresInSeconds?: number;
  /** Set with WRONG_ROLE: which sign-in page this number belongs to. */
  actualArea?: AccountArea;
  error?: { code: string; message: string; requestId?: string };
}

const SIGNUP_ROLE: Record<OtpRole, 'CUSTOMER' | 'VENDOR_OWNER' | 'RIDER'> = {
  customer: 'CUSTOMER',
  vendor: 'VENDOR_OWNER',
  rider: 'RIDER',
};

function toError(error: unknown): OtpState['error'] {
  if (error instanceof ApiError) return error.toDisplay();
  if (error instanceof ApiUnreachableError) return { code: 'API_UNREACHABLE', message: error.message };
  throw error;
}

function areaOf(role: string): AccountArea {
  if (role === 'CUSTOMER') return 'customer';
  if (isVendorRole(role)) return 'vendor';
  if (role === 'RIDER') return 'rider';
  return 'admin';
}

/** Only ever return to a path inside the role's own area, never to a login page or another role's app. */
function safeReturnTo(next: string | undefined, locale: string, role: OtpRole, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  const rest = next.replace(/^\/[a-z]{2}(?=\/|$)/, '');
  if (!rest || rest === '/') return fallback;
  if (rest.includes('/login')) return fallback;
  const inArea =
    role === 'customer'
      ? !rest.startsWith('/admin') && !rest.startsWith('/shop') && !rest.startsWith('/rider')
      : rest === `/${role === 'vendor' ? 'shop' : 'rider'}` ||
        rest.startsWith(`/${role === 'vendor' ? 'shop' : 'rider'}/`);
  if (!inArea) return fallback;
  return next.startsWith(`/${locale}`) ? next : `/${locale}${rest}`;
}

/** Send a 6-digit SMS code. Returns the code step on success; never throws for a user-facing error. */
export async function requestOtp(_locale: string, _prev: OtpState, formData: FormData): Promise<OtpState> {
  const parsed = phoneSchema.safeParse(formData.get('phone'));
  if (!parsed.success) {
    return { error: { code: 'VALIDATION_FAILED', message: 'Enter a valid phone number.' } };
  }

  try {
    const { data } = await apiFetch<{ expiresInSeconds: number }>('/auth/otp/request', {
      method: 'POST',
      body: { phone: parsed.data },
      retries: 0,
    });
    return { step: 'code', phone: parsed.data, expiresInSeconds: data.expiresInSeconds };
  } catch (error) {
    return { step: 'phone', error: toError(error) };
  }
}

/**
 * Exchange the code for tokens. Each sign-in page only ever creates its own role's session: a phone that
 * belongs to another role is turned away (and its freshly issued refresh token revoked) rather than being
 * silently signed into a different app.
 */
export async function verifyOtp(
  role: OtpRole,
  locale: string,
  next: string | undefined,
  _prev: OtpState,
  formData: FormData,
): Promise<OtpState> {
  const phone = phoneSchema.safeParse(formData.get('phone'));
  const code = codeSchema.safeParse(formData.get('code'));

  if (!phone.success || !code.success) {
    return {
      step: 'code',
      phone: phone.success ? phone.data : undefined,
      error: { code: 'VALIDATION_FAILED', message: 'Enter the 6-digit code.' },
    };
  }

  let destination: string;

  try {
    const { data } = await apiFetch<{
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
      user: SessionUser;
    }>('/auth/otp/verify', {
      method: 'POST',
      body: { phone: phone.data, code: code.data, role: SIGNUP_ROLE[role] },
      headers: { ...TOKEN_TRANSPORT_HEADER },
      retries: 0,
    });

    const actual = areaOf(data.user.role);
    if (actual !== role) {
      if (data.refreshToken) {
        try {
          await apiFetch('/auth/logout', {
            method: 'POST',
            body: { refreshToken: data.refreshToken },
            accessToken: data.accessToken,
            retries: 0,
          });
        } catch {
          // Best effort: the token was never stored anywhere.
        }
      }
      return {
        step: 'phone',
        actualArea: actual,
        error: { code: 'WRONG_ROLE', message: `This number is registered as a ${actual} account.` },
      };
    }

    const session = sessionFromAuthResponse(data);
    if (role === 'customer') {
      await writeCustomerSession(session);
      destination = safeReturnTo(next, locale, role, `/${locale}`);
    } else if (role === 'vendor') {
      await writeVendorSession(session);
      let registered = true;
      try {
        await apiFetch('/vendor/profile', { accessToken: session.accessToken, retries: 0 });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'VENDOR_NOT_REGISTERED') registered = false;
      }
      destination = registered
        ? safeReturnTo(next, locale, role, `/${locale}/shop/orders`)
        : `/${locale}/shop/register`;
    } else {
      await writeRiderSession(session);
      destination = safeReturnTo(next, locale, role, `/${locale}/rider/home`);
    }
  } catch (error) {
    return { step: 'code', phone: phone.data, error: toError(error) };
  }

  redirect(destination);
}
