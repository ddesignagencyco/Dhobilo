import 'server-only';

import { TOKEN_TRANSPORT_HEADER } from '../api/config';
import { apiFetch } from '../api/fetch';
import { ApiError } from '../api/errors';
import { type Session, type SessionUser, sessionFromAuthResponse } from './session';

/**
 * Refresh-token rotation makes concurrent refreshes dangerous.
 *
 * The API rotates the refresh token on every /auth/refresh and revokes the whole chain if an already-used
 * token is presented again (that is how it detects theft). A single page render can fire a dozen parallel
 * API calls; if each noticed an expired access token and refreshed independently, the first would succeed
 * and the rest would present a spent token — logging the admin out and, worse, looking like an attack in
 * the audit log.
 *
 * So refreshes are deduplicated by the token being spent: everyone who arrives with the same refresh
 * token shares one in-flight request and one result.
 *
 * This map is per server instance. With several replicas two instances could still race, but only if the
 * same admin's requests land on both within the same second AND the access token expired in that window;
 * the loser gets one UNAUTHENTICATED and is sent to the login screen. Middleware refreshing ahead of the
 * render (see src/middleware.ts) is what keeps that from being a routine event.
 */
const inFlight = new Map<string, Promise<Session>>();

interface RefreshResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: SessionUser;
}

export async function refreshSession(session: Session): Promise<Session> {
  const existing = inFlight.get(session.refreshToken);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const { data } = await apiFetch<RefreshResponse>('/auth/refresh', {
        method: 'POST',
        // Body transport, not the cookie: the panel holds the refresh token itself. Sending it in the
        // body also means the API's CSRF origin check does not apply, which is correct for a
        // server-to-server call that no browser can forge.
        body: { refreshToken: session.refreshToken },
        headers: { ...TOKEN_TRANSPORT_HEADER },
        // Never retry a refresh: a second attempt would present a token the first attempt already spent.
        retries: 0,
      });
      return sessionFromAuthResponse(data, session.refreshToken);
    } finally {
      inFlight.delete(session.refreshToken);
    }
  })();

  inFlight.set(session.refreshToken, pending);
  return pending;
}

/** True when the refresh itself was rejected, meaning the admin has to sign in again. */
export function refreshFailedTerminally(error: unknown): boolean {
  return error instanceof ApiError && (error.isSessionExpired || error.isAccountProblem);
}
