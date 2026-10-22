import { Job } from 'bullmq';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService, vendorDecisionMessage } from './notifications.service';

const job = (name: string, data: object) => ({ name, data }) as unknown as Job;

describe('NotificationsProcessor', () => {
  const sms = { send: jest.fn() };
  const mail = { send: jest.fn() };
  const processor = new NotificationsProcessor(sms, mail as never);

  beforeEach(() => jest.clearAllMocks());

  it('delivers send-sms through the SMS provider', async () => {
    await processor.process(job('send-sms', { to: '+923001234567', message: 'hi' }));
    expect(sms.send).toHaveBeenCalledWith('+923001234567', 'hi');
  });

  it('delivers send-email through the mail service', async () => {
    await processor.process(job('send-email', { to: 'a@b.co', subject: 's', text: 't' }));
    expect(mail.send).toHaveBeenCalledWith({ to: 'a@b.co', subject: 's', text: 't' });
  });

  it('fails loudly on unknown jobs so they retry and surface', async () => {
    await expect(processor.process(job('send-pigeon', {}))).rejects.toThrow(/No handler/);
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
