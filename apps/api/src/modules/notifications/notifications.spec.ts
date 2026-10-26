import { Job, UnrecoverableError } from 'bullmq';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService, vendorDecisionMessage } from './notifications.service';

const job = (name: string, data: object, attemptsMade = 0, attempts = 5) => ({ name, data, attemptsMade, opts: { attempts } }) as unknown as Job;

function setup() {
  const sms = { send: jest.fn().mockResolvedValue(undefined) };
  const mail = { send: jest.fn().mockResolvedValue({ messageId: 'm1' }) };
  const whatsapp = { send: jest.fn().mockResolvedValue(undefined) };
  const push = { send: jest.fn().mockResolvedValue({ ok: true }) };
  const prisma = {
    notification: { update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: 'fallback-row' }) },
    deviceToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const queue = { add: jest.fn().mockResolvedValue({}) };
  const processor = new NotificationsProcessor(sms, mail as never, whatsapp, push, prisma as never, queue as never, { run: jest.fn() } as never);
  return { sms, mail, whatsapp, push, prisma, queue, processor };
}

const lastUpdate = (p: ReturnType<typeof setup>) => p.prisma.notification.update.mock.calls.at(-1)![0];

describe('NotificationsProcessor', () => {
  it('delivers SMS and email, and marks the log row SENT', async () => {
    const p = setup();
    await p.processor.process(job('send-sms', { notificationId: 'n1', to: '+923001234567', message: 'hi' }));
    expect(p.sms.send).toHaveBeenCalledWith('+923001234567', 'hi');
    expect(lastUpdate(p)).toMatchObject({ where: { id: 'n1' }, data: { status: 'SENT', attempts: 1, error: null } });

    await p.processor.process(job('send-email', { notificationId: 'n2', to: 'a@b.co', subject: 's', text: 't' }));
    expect(p.mail.send).toHaveBeenCalledWith({ to: 'a@b.co', subject: 's', text: 't' });
  });

  it('delivers WhatsApp template messages', async () => {
    const p = setup();
    const data = { notificationId: 'n1', to: '+923001234567', templateName: 'order_accepted_en', language: 'en', params: ['DHB-1', 'V'], fallbackText: 'accepted' };
    await p.processor.process(job('send-whatsapp', data));
    expect(p.whatsapp.send).toHaveBeenCalledWith({ to: '+923001234567', templateName: 'order_accepted_en', language: 'en', params: ['DHB-1', 'V'], fallbackText: 'accepted' });
  });

  it('jobs without a log row (OTP codes) deliver without touching the notification table', async () => {
    const p = setup();
    await p.processor.process(job('send-sms', { to: '+923001234567', message: '123456' }));
    expect(p.sms.send).toHaveBeenCalled();
    expect(p.prisma.notification.update).not.toHaveBeenCalled();
  });

  it('a failed attempt keeps the row QUEUED with the error and lets the queue retry', async () => {
    const p = setup();
    p.sms.send.mockRejectedValue(new Error('gateway timeout'));
    await expect(p.processor.process(job('send-sms', { notificationId: 'n1', to: '+9230', message: 'x' }, 1))).rejects.toThrow('gateway timeout');
    expect(lastUpdate(p).data).toMatchObject({ status: 'QUEUED', attempts: 2, error: 'gateway timeout' });
    expect(p.queue.add).not.toHaveBeenCalled();
  });

  it('after the last attempt the row is FAILED', async () => {
    const p = setup();
    p.sms.send.mockRejectedValue(new Error('gateway down'));
    await expect(p.processor.process(job('send-sms', { notificationId: 'n1', to: '+9230', message: 'x' }, 4))).rejects.toThrow();
    expect(lastUpdate(p).data).toMatchObject({ status: 'FAILED', attempts: 5 });
  });

  describe('WhatsApp -> SMS fallback on final failure', () => {
    const data = { notificationId: 'n1', userId: 'u1', to: '+923001234567', templateName: 't', language: 'en', params: [], fallbackText: 'Order DHB-1 accepted', fallbackSms: true };

    it('queues the same text by SMS, with its own log row', async () => {
      const p = setup();
      p.whatsapp.send.mockRejectedValue(new Error('BSP down'));
      await expect(p.processor.process(job('send-whatsapp', data, 4))).rejects.toThrow('BSP down');
      expect(p.prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', channel: 'SMS' }) }));
      expect(p.queue.add).toHaveBeenCalledWith('send-sms', expect.objectContaining({ notificationId: 'fallback-row', to: '+923001234567', message: 'Order DHB-1 accepted' }));
    });

    it('does not fall back while retries remain, or when the user switched SMS off', async () => {
      const early = setup();
      early.whatsapp.send.mockRejectedValue(new Error('x'));
      await expect(early.processor.process(job('send-whatsapp', data, 2))).rejects.toThrow();
      expect(early.queue.add).not.toHaveBeenCalled();

      const optedOut = setup();
      optedOut.whatsapp.send.mockRejectedValue(new Error('x'));
      await expect(optedOut.processor.process(job('send-whatsapp', { ...data, fallbackSms: false }, 4))).rejects.toThrow();
      expect(optedOut.queue.add).not.toHaveBeenCalled();
    });
  });

  describe('push', () => {
    const data = { notificationId: 'n1', tokens: ['good-1', 'invalid-2', 'good-3'], title: 'T', body: 'B', data: { orderId: 'o1' } };

    it('sends to every device and deletes dead tokens straight away', async () => {
      const p = setup();
      p.push.send.mockImplementation(async (t: string) => (t.startsWith('invalid-') ? { ok: false, invalidToken: true, error: 'UNREGISTERED' } : { ok: true }));
      await p.processor.process(job('send-push', data));
      expect(p.push.send).toHaveBeenCalledTimes(3);
      expect(p.push.send).toHaveBeenCalledWith('good-1', { title: 'T', body: 'B', data: { orderId: 'o1' } });
      expect(p.prisma.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['invalid-2'] } } });
      expect(lastUpdate(p).data).toMatchObject({ status: 'SENT' });
    });

    it('counts as delivered if at least one device got it, even when another hit a transient error', async () => {
      const p = setup();
      p.push.send.mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('FCM 503')).mockResolvedValueOnce({ ok: true });
      await p.processor.process(job('send-push', data));
      expect(lastUpdate(p).data).toMatchObject({ status: 'SENT' });
    });

    it('retries when every device failed transiently', async () => {
      const p = setup();
      p.push.send.mockRejectedValue(new Error('FCM 503'));
      await expect(p.processor.process(job('send-push', data))).rejects.toThrow('FCM 503');
      expect(lastUpdate(p).data).toMatchObject({ status: 'QUEUED', attempts: 1 });
    });

    it('gives up immediately (no retries) when every token is dead', async () => {
      const p = setup();
      p.push.send.mockResolvedValue({ ok: false, invalidToken: true, error: 'UNREGISTERED' });
      await expect(p.processor.process(job('send-push', data))).rejects.toBeInstanceOf(UnrecoverableError);
      expect(p.prisma.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['good-1', 'invalid-2', 'good-3'] } } });
      expect(lastUpdate(p).data).toMatchObject({ status: 'FAILED' });
    });
  });

  it('fails unknown jobs for good instead of retrying them', async () => {
    const p = setup();
    await expect(p.processor.process(job('send-pigeon', {}))).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('a broken log write never fails a delivered message', async () => {
    const p = setup();
    p.prisma.notification.update.mockRejectedValue(new Error('db blip'));
    await expect(p.processor.process(job('send-sms', { notificationId: 'n1', to: '+9230', message: 'x' }))).resolves.toBeUndefined();
  });
});

describe('NotificationsService.notifyVendorDecision', () => {
  it('queues an SMS and, when an email is known, an email', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const service = new NotificationsService({ add } as never);
    await service.notifyVendorDecision({ phone: '+923001234567', email: 'v@x.pk' }, 'Clean Co', 'REJECTED', 'Blurry photo');
    expect(add.mock.calls.map((c) => c[0]).sort()).toEqual(['send-email', 'send-sms']);
    expect(add.mock.calls.find((c) => c[0] === 'send-email')![1].text).toContain('Blurry photo');
  });

  it('skips email without an address and never throws when the queue is down', async () => {
    const add = jest.fn().mockRejectedValue(new Error('redis down'));
    const service = new NotificationsService({ add } as never);
    await expect(service.notifyVendorDecision({ phone: '+923001234567' }, 'Clean Co', 'APPROVED')).resolves.toBeUndefined();
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('has a message for every decision', () => {
    for (const d of ['APPROVED', 'REJECTED', 'SUSPENDED', 'REACTIVATED'] as const) {
      const m = vendorDecisionMessage('Clean Co', d, 'why');
      expect(m.subject && m.text && m.sms).toBeTruthy();
    }
  });
});

describe('NotificationsProcessor: announcements', () => {
  it('hands an announcement fan-out job to the fan-out service and writes no log row of its own', async () => {
    const run = jest.fn().mockResolvedValue({ queued: 3 });
    const prisma = { notification: { update: jest.fn() } };
    const processor = new NotificationsProcessor({ send: jest.fn() } as never, { send: jest.fn() } as never, { send: jest.fn() } as never, { send: jest.fn() } as never, prisma as never, { add: jest.fn() } as never, { run } as never);
    await processor.process({ name: 'fan-out-announcement', data: { announcementId: 'a1' }, attemptsMade: 0, opts: { attempts: 3 } } as never);
    expect(run).toHaveBeenCalledWith('a1');
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('lets a failing fan-out reach the queue so it is retried', async () => {
    const run = jest.fn().mockRejectedValue(new Error('redis went away'));
    const processor = new NotificationsProcessor({ send: jest.fn() } as never, { send: jest.fn() } as never, { send: jest.fn() } as never, { send: jest.fn() } as never, { notification: { update: jest.fn() } } as never, { add: jest.fn() } as never, { run } as never);
    await expect(processor.process({ name: 'fan-out-announcement', data: { announcementId: 'a1' }, attemptsMade: 0, opts: { attempts: 3 } } as never)).rejects.toThrow('redis went away');
  });
});
