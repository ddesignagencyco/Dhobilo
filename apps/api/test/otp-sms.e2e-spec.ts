// ConfigModule.forRoot() snapshots process.env when AppModule is first imported, so this must run before the imports.
const previousBypass = process.env.OTP_BYPASS;
process.env.OTP_BYPASS = 'false';

import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import { QUEUES } from '../src/infra/queue/queues';
import { otpKey } from '../src/modules/auth/otp.service';
import { TestApp, clearRateLimits, createTestApp, randomPhone } from './helpers';

/** OTP_BYPASS off: real random codes, delivered through the notifications queue (mocked here). */
describe('OTP delivery without bypass (e2e)', () => {
  const add = jest.fn();
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const phones: string[] = [];

  beforeAll(async () => {
    t = await createTestApp({
      customize: (b) => b.overrideProvider(getQueueToken(QUEUES.NOTIFICATIONS)).useValue({ add }),
    });
    http = request(t.app.getHttpServer());
  });

  beforeEach(async () => {
    add.mockReset();
    await clearRateLimits(t.redis);
  });

  afterAll(async () => {
    if (previousBypass === undefined) delete process.env.OTP_BYPASS;
    else process.env.OTP_BYPASS = previousBypass;
    await t.prisma.user.deleteMany({ where: { phone: { in: phones } } });
    await t.prisma.otpCode.deleteMany({ where: { phone: { in: phones } } });
    await t.close();
  });

  const phone = () => {
    const p = randomPhone();
    phones.push(p);
    return p;
  };

  it('queues an SMS with a random 6-digit code that then logs the user in', async () => {
    const p = phone();
    await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);

    expect(add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = add.mock.calls[0];
    expect(name).toBe('send-sms');
    expect(data.to).toBe(p);
    const code = /\b(\d{6})\b/.exec(data.message)![1];
    // The plaintext code lives in the job payload, so the job must not outlive delivery.
    expect(opts.removeOnComplete).toBe(true);

    await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: code === '000000' ? '000001' : '000000' }).expect(400);
    const ok = await http.post('/api/v1/auth/otp/verify').send({ phone: p, code }).expect(200);
    expect(ok.body.data.user.phone).toBe(p);
  });

  it('does not accept the bypass code', async () => {
    const p = phone();
    await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
    const code = /\b(\d{6})\b/.exec(add.mock.calls[0][1].message)![1];
    if (code !== '123456') await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: '123456' }).expect(400);
  });

  it('a new request replaces the previous code and resets attempts', async () => {
    const p = phone();
    await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
    for (let i = 0; i < 3; i++) await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: '999999' });
    await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
    expect(await t.redis.hget(otpKey(p), 'attempts')).toBe('0');
    expect(add).toHaveBeenCalledTimes(2);
  });
});
