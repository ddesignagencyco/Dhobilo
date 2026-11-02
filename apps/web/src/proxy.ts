import createIntlMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import {
  type MiddlewareSession,
  needsRefresh,
  refreshInMiddleware,
} from './lib/auth/middleware-refresh';

/**
 * Next 16's `proxy` convention (what earlier versions called `middleware`).
 *
 * Three jobs:
 *  1. Locale prefixing (FE-0.2).
 *  2. The admin route guard (FE-0.6).
 *  3. Refreshing the access token before the page renders, because a React Server Component cannot set
 *     cookies and so cannot persist a rotated refresh token (see lib/auth/middleware-refresh.ts).
 *
 * Admin routes deliberately do NOT go through next-intl's middleware. It was redirecting an already
 * correct `/en/admin/login` back to itself, which is an immediate loop, and the panel does not need what
 * it provides: an admin URL always carries its locale explicitly, so prefixing is a two-line decision
 * made below. Translations are unaffected — they come from `setRequestLocale` plus
 * NextIntlClientProvider in app/[locale]/layout.tsx, not from the middleware.
 *
 * Customer, vendor and rider routes keep next-intl's middleware, which is where locale detection from
 * `Accept-Language` and the `NEXT_LOCALE` cookie genuinely earns its place.
 *
 * The role check below is a UX gate, not a security boundary: the cookie is httpOnly so no script can
 * forge it, but a hand-crafted request could carry anything. Every admin route is enforced server-side by
 * the API's @Roles and @AdminAreaOnly guards, which reload the admin's role from the database per request.
 */

const intlMiddleware = createIntlMiddleware(routing);

const SESSION_COOKIE = 'dh_admin_session';
const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

/** Reachable without a session. Everything else under /admin requires one. */
const PUBLIC_ADMIN_PATHS = ['/admin/login'];

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
};

function stripLocale(pathname: string): { locale: string | null; rest: string } {
  const match = /^\/([a-z]{2})(\/.*|$)/.exec(pathname);
  if (match && routing.locales.includes(match[1] as (typeof routing.locales)[number])) {
    return { locale: match[1]!, rest: match[2] || '/' };
  }
  return { locale: null, rest: pathname };
}

function parseSession(raw: string | undefined): MiddlewareSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MiddlewareSession;
    return parsed?.accessToken && parsed?.refreshToken && parsed?.user?.id ? parsed : null;
  } catch {
    return null;
  }
}

/** Preferred locale for an admin URL that arrived without a prefix. */
function preferredLocale(request: NextRequest): string {
  const cookie = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookie && routing.locales.includes(cookie as (typeof routing.locales)[number])) return cookie;
  return routing.defaultLocale;
}

function redirectTo(request: NextRequest, pathname: string, params: Record<string, string> = {}) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { locale, rest } = stripLocale(pathname);

  // Not an admin route: next-intl handles locale detection and prefixing as usual.
  if (!rest.startsWith('/admin')) return intlMiddleware(request);

  // An admin URL with no locale prefix (/admin/orders): add one and start again.
  if (!locale) {
    const target = `/${preferredLocale(request)}${rest}`;
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  const isPublic = PUBLIC_ADMIN_PATHS.some((p) => rest === p || rest.startsWith(`${p}/`));
  let session = parseSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (isPublic) return NextResponse.next();
    return redirectTo(request, `/${locale}/admin/login`, { next: `${pathname}${request.nextUrl.search}` });
  }

  // Signed in as someone who is not an admin: clear it rather than render a shell full of 403s.
  if (session.user.role !== 'ADMIN') {
    const bounce = redirectTo(request, `/${locale}/admin/login`, { error: 'not_admin' });
    bounce.cookies.set(SESSION_COOKIE, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
    return bounce;
  }

  let rotated: MiddlewareSession | null = null;

  if (needsRefresh(session)) {
    const outcome = await refreshInMiddleware(session, API_BASE_URL);

    if (outcome.status === 'dead') {
      const params: Record<string, string> = { error: 'expired' };
      if (!isPublic) params.next = `${pathname}${request.nextUrl.search}`;
      const bounce = redirectTo(request, `/${locale}/admin/login`, params);
      bounce.cookies.set(SESSION_COOKIE, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
      return bounce;
    }

    if (outcome.status === 'refreshed') {
      rotated = outcome.session;
      session = outcome.session;
      // Hand the fresh token to this same render. Mutating the request cookie rewrites the Cookie header
      // Next forwards downstream, so the RSC tree below reads the new token rather than the spent one.
      request.cookies.set(SESSION_COOKIE, JSON.stringify(outcome.session));
    }
    // 'unchanged' (API down, or a transient error): proceed on the old token and let the page surface it.
  }

  // Already signed in and asking for the login page: send them to the panel.
  const response = isPublic ? redirectTo(request, `/${locale}/admin`) : NextResponse.next();

  // Persist the rotation for the browser. Without this the next navigation would present the spent token,
  // which the API treats as replay and would revoke the whole chain.
  if (rotated) response.cookies.set(SESSION_COOKIE, JSON.stringify(rotated), SESSION_COOKIE_OPTIONS);

  return response;
}

export const config = {
  /**
   * Skip Next internals, the BFF proxy (it handles its own session and must not be locale-routed) and
   * anything that looks like a static file.
   */
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
