import { generateKeyPairSync, verify } from 'node:crypto';
import { FcmPushProvider } from './fcm-push.provider';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const creds = { projectId: 'dhoblio-test', clientEmail: 'push@dhoblio-test.iam.gserviceaccount.com', privateKey: pem };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const TOKEN_OK = () => json(200, { access_token: 'ya29.token', expires_in: 3600 });
const SENT = () => json(200, { name: 'projects/dhoblio-test/messages/1' });

/** A scripted fetch: each call takes the next handler; records the calls. */
function scripted(...handlers: ((url: string, init?: RequestInit) => Response)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const h = handlers.shift();
    if (!h) throw new Error(`unexpected fetch ${url}`);
    return h(url, init);
  });
  return { fn, calls };
}

describe('FcmPushProvider', () => {
  it('signs a valid RS256 service-account JWT, exchanges it, and sends the message', async () => {
    const { fn, calls } = scripted(TOKEN_OK, SENT);
    const fcm = new FcmPushProvider(creds, fn, () => 1_700_000_000_000);
    expect(await fcm.send('device-token-1', { title: 'Hi', body: 'There', data: { orderId: 'o1' } })).toEqual({ ok: true });

    const form = new URLSearchParams(String(calls[0].init!.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h, c, s] = form.get('assertion')!.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({
      iss: creds.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    expect(verify('RSA-SHA256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, 'base64url'))).toBe(true);

    expect(calls[1].url).toBe('https://fcm.googleapis.com/v1/projects/dhoblio-test/messages:send');
    expect((calls[1].init!.headers as Record<string, string>).Authorization).toBe('Bearer ya29.token');
    expect(JSON.parse(String(calls[1].init!.body))).toEqual({
      message: { token: 'device-token-1', notification: { title: 'Hi', body: 'There' }, data: { orderId: 'o1' } },
    });
  });

  it('caches the access token until a minute before it expires, then refreshes', async () => {
    let now = 1_700_000_000_000;
    const { fn } = scripted(TOKEN_OK, SENT, SENT, TOKEN_OK, SENT);
    const fcm = new FcmPushProvider(creds, fn, () => now);
    await fcm.send('t', { title: 'a', body: 'b' });
    now += 30 * 60_000;
    await fcm.send('t', { title: 'a', body: 'b' });
    expect(fn).toHaveBeenCalledTimes(3); // one token exchange, two sends
    now += 31 * 60_000; // 61 min after the first token: expired
    await fcm.send('t', { title: 'a', body: 'b' });
    expect(fn).toHaveBeenCalledTimes(5); // refreshed + sent
  });

  it('accepts a private key stored with literal \\n escapes (as in .env files)', async () => {
    const { fn } = scripted(TOKEN_OK, SENT);
    const fcm = new FcmPushProvider({ ...creds, privateKey: pem.replace(/\n/g, '\\n') }, fn);
    expect(await fcm.send('t', { title: 'a', body: 'b' })).toEqual({ ok: true });
  });

  it('on 401 gets a fresh token and retries once', async () => {
    const { fn } = scripted(TOKEN_OK, () => json(401, { error: { status: 'UNAUTHENTICATED' } }), () => json(200, { access_token: 'ya29.second', expires_in: 3600 }), SENT);
    const fcm = new FcmPushProvider(creds, fn);
    expect(await fcm.send('t', { title: 'a', body: 'b' })).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['unregistered device', 404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }],
    ['malformed token', 400, { error: { status: 'INVALID_ARGUMENT', message: 'bad token' } }],
    ['plain 404', 404, {}],
  ])('reports a dead token for %s so it can be deleted', async (_label, status, body) => {
    const { fn } = scripted(TOKEN_OK, () => json(status, body));
    const result = await new FcmPushProvider(creds, fn).send('t', { title: 'a', body: 'b' });
    expect(result).toMatchObject({ ok: false, invalidToken: true });
  });

  it.each([
    ['rate limited', 429, { error: { status: 'RESOURCE_EXHAUSTED' } }],
    ['server error', 500, { error: { status: 'INTERNAL' } }],
    ['unavailable', 503, {}],
  ])('throws on %s so the queue retries', async (_label, status, body) => {
    const { fn } = scripted(TOKEN_OK, () => json(status, body));
    await expect(new FcmPushProvider(creds, fn).send('t', { title: 'a', body: 'b' })).rejects.toThrow(/FCM/);
  });

  it('throws when the token exchange fails', async () => {
    const { fn } = scripted(() => json(400, { error: 'invalid_grant' }));
    await expect(new FcmPushProvider(creds, fn).send('t', { title: 'a', body: 'b' })).rejects.toThrow(/auth failed/);
  });
});
