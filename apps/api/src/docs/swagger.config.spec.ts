import { SWAGGER_CUSTOM_JS } from './swagger.config';

/** Runs the page script in a fake browser and returns hooks to poke it. */
function browser(fetchImpl: (url: string) => { ok: boolean; body: unknown | (() => never) }) {
  const toasts: string[] = [];
  const ui = { preauthorizeApiKey: jest.fn(), authActions: { logout: jest.fn() } };
  const document = {
    body: { appendChild: (el: { textContent: string }) => toasts.push(el.textContent) },
    createElement: () => ({ textContent: '', style: {}, remove: () => undefined }),
  };
  const window: Record<string, unknown> = { ui };
  window.fetch = jest.fn(async (input: string | { url: string }) => {
    const url = typeof input === 'string' ? input : input.url;
    const { ok, body } = fetchImpl(url);
    const res = { ok, clone: () => ({ json: async () => (typeof body === 'function' ? (body as () => never)() : body) }) };
    return res;
  });
  new Function('window', 'document', 'setTimeout', SWAGGER_CUSTOM_JS)(window, document, () => 0);
  const flush = () => new Promise((r) => setImmediate(r));
  return { ui, toasts, call: (url: string | { url: string }) => (window.fetch as (u: unknown) => Promise<unknown>)(url), flush };
}

const SIGNED_IN = { data: { accessToken: 'tok-123', user: { name: 'Ayesha Khan', role: 'CUSTOMER', phone: '+923001234567' } } };

describe('Swagger page script (token auto-apply)', () => {
  it.each(['http://localhost:4000/api/v1/auth/otp/verify', '/api/v1/auth/refresh', 'http://x/api/v1/auth/admin/login?x=1'])(
    'applies the access token after a successful call to %s',
    async (url) => {
      const b = browser(() => ({ ok: true, body: SIGNED_IN }));
      await b.call(url);
      await b.flush();
      expect(b.ui.preauthorizeApiKey).toHaveBeenCalledWith('bearer', 'tok-123');
      expect(b.toasts[0]).toContain('Signed in as Ayesha Khan (CUSTOMER)');
    },
  );

  it('also works when fetch is called with a Request-like object', async () => {
    const b = browser(() => ({ ok: true, body: SIGNED_IN }));
    await b.call({ url: 'http://localhost:4000/api/v1/auth/otp/verify' });
    await b.flush();
    expect(b.ui.preauthorizeApiKey).toHaveBeenCalledTimes(1);
  });

  it('clears the token on sign-out', async () => {
    const b = browser(() => ({ ok: true, body: { data: null } }));
    await b.call('http://localhost:4000/api/v1/auth/logout');
    expect(b.ui.authActions.logout).toHaveBeenCalledWith(['bearer']);
    expect(b.ui.preauthorizeApiKey).not.toHaveBeenCalled();
  });

  it('ignores failed sign-ins and unrelated calls, and never breaks the page', async () => {
    const failed = browser(() => ({ ok: false, body: { error: { code: 'INVALID_OTP' } } }));
    await failed.call('http://localhost:4000/api/v1/auth/otp/verify');
    await failed.flush();
    expect(failed.ui.preauthorizeApiKey).not.toHaveBeenCalled();

    const unrelated = browser(() => ({ ok: true, body: SIGNED_IN }));
    for (const url of ['http://x/api/v1/me', 'http://x/api/v1/auth/otp/request', 'http://x/api/v1/orders/auth/refresh/x']) await unrelated.call(url);
    await unrelated.flush();
    expect(unrelated.ui.preauthorizeApiKey).not.toHaveBeenCalled();

    const broken = browser(() => ({ ok: true, body: () => { throw new Error('not json'); } }));
    await expect(broken.call('http://x/api/v1/auth/otp/verify')).resolves.toBeDefined(); // original response still returned
    await broken.flush();
    expect(broken.ui.preauthorizeApiKey).not.toHaveBeenCalled();

    const noToken = browser(() => ({ ok: true, body: { data: {} } }));
    await noToken.call('http://x/api/v1/auth/refresh');
    await noToken.flush();
    expect(noToken.ui.preauthorizeApiKey).not.toHaveBeenCalled();
  });
});
