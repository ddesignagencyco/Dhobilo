import { createSign } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PushMessage, PushProvider, PushResult } from './push.provider';

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  /** PEM private key; `\n` escapes (as stored in env files) are accepted. */
  privateKey: string;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const b64u = (v: Buffer | string) => Buffer.from(v).toString('base64url');

/** Error codes in FCM v1 responses that mean "this registration token is dead". */
const DEAD_TOKEN_CODES = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND', 'SENDER_ID_MISMATCH']);

/**
 * Firebase Cloud Messaging via the HTTP v1 API, authenticated with a service-account key (no firebase-admin
 * dependency): a signed JWT is exchanged for a short-lived OAuth token, which is cached until shortly before expiry.
 */
export class FcmPushProvider implements PushProvider {
  private readonly logger = new Logger(FcmPushProvider.name);
  private cached?: { token: string; expiresAt: number };

  constructor(
    private readonly creds: FcmCredentials,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async send(token: string, message: PushMessage): Promise<PushResult> {
    let res = await this.post(token, message, await this.accessToken());
    if (res.status === 401) {
      this.cached = undefined; // token revoked or clock drift: get a fresh one and try once more
      res = await this.post(token, message, await this.accessToken());
    }
    if (res.ok) return { ok: true };

    const body = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } };
    const code = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status ?? String(res.status);
    if (res.status === 404 || (res.status === 400 && DEAD_TOKEN_CODES.has(code)) || DEAD_TOKEN_CODES.has(code)) {
      return { ok: false, invalidToken: true, error: code };
    }
    // 429 / 5xx / auth trouble: let the queue retry with backoff.
    throw new Error(`FCM ${res.status} ${code}: ${body.error?.message ?? ''}`.trim());
  }

  private post(token: string, m: PushMessage, accessToken: string): Promise<Response> {
    return this.fetchFn(`https://fcm.googleapis.com/v1/projects/${this.creds.projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token, notification: { title: m.title, body: m.body }, ...(m.data ? { data: m.data } : {}) } }),
    });
  }

  private async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - 60_000 > this.now()) return this.cached.token;

    const iat = Math.floor(this.now() / 1000);
    const claims = { iss: this.creds.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 };
    const unsigned = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify(claims))}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.creds.privateKey.replace(/\\n/g, '\n'));
    const assertion = `${unsigned}.${b64u(signature)}`;

    const res = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!res.ok) throw new Error(`FCM auth failed: ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.cached = { token: json.access_token, expiresAt: this.now() + json.expires_in * 1000 };
    this.logger.debug('Refreshed FCM access token');
    return json.access_token;
  }
}
