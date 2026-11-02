/**
 * A refresh that can run inside middleware.
 *
 * This duplicates a little of src/lib/auth/refresh.ts on purpose: that module is `server-only` and reaches
 * for `next/headers`, neither of which middleware can use. Keeping a small self-contained copy here is
 * cheaper than making the main client runtime-agnostic.
 *
 * Why refresh in middleware at all: the API's access token lives 15 minutes, and a React Server Component
 * cannot set cookies, so an RSC render has no way to persist a rotated token. Without this, an admin who
 * walked away for a coffee would be bounced to the login screen on their next click even though their
 * 30-day refresh token is perfectly good.
 */

export interface MiddlewareSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  user: { id: string; role: string; adminRole: string | null; [k: string]: unknown };
}

/** Refresh this far ahead of expiry, so a slow page render cannot outlive its own token. */
const SKEW_MS = 120_000;

export function needsRefresh(session: MiddlewareSession): boolean {
  return session.accessExpiresAt - SKEW_MS <= Date.now();
}

export type RefreshOutcome =
  | { status: 'refreshed'; session: MiddlewareSession }
  | { status: 'unchanged' }
  | { status: 'dead' };

export async function refreshInMiddleware(
  session: MiddlewareSession,
  apiBaseUrl: string,
): Promise<RefreshOutcome> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Ask for the rotated refresh token in the body: this app keeps it itself rather than relying on
        // the API's SameSite=Strict cookie, which a different origin cannot use.
        'x-token-transport': 'body',
      },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // The API is unreachable or slow. Let the request through on the old token; the page's own fetch will
    // produce a proper error. Signing the admin out because of one dropped packet would be worse.
    return { status: 'unchanged' };
  }

  if (response.status === 401 || response.status === 403) {
    // Definitively rejected: the token was revoked, replayed, or the account was deactivated.
    return { status: 'dead' };
  }

  if (!response.ok) return { status: 'unchanged' };

  try {
    const body = (await response.json()) as {
      data?: { accessToken: string; refreshToken?: string; expiresIn: number; user: MiddlewareSession['user'] };
    };
    const data = body.data;
    if (!data?.accessToken || !data?.expiresIn) return { status: 'unchanged' };

    return {
      status: 'refreshed',
      session: {
        accessToken: data.accessToken,
        // If the API rotated the token it comes back here; if it did not, the old one is still current.
        refreshToken: data.refreshToken ?? session.refreshToken,
        accessExpiresAt: Date.now() + data.expiresIn * 1000,
        user: data.user ?? session.user,
      },
    };
  } catch {
    return { status: 'unchanged' };
  }
}
