import type { Job } from 'bullmq';
import { NotificationMirror } from './notification-mirror.service';

const job = (name: string, data: object) => ({ name, data }) as unknown as Job;

function setup(target: string, role = 'RIDER') {
  const mail = { send: jest.fn().mockResolvedValue({ messageId: 'm' }) };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ role, name: 'Bilal Ahmed' }) } };
  const config = { get: () => target };
  const mirror = new NotificationMirror(config as never, mail as never, prisma as never);
  return { mail, prisma, mirror };
}

describe('NotificationMirror', () => {
  it('does nothing when no test inbox is configured', async () => {
    const { mail, mirror } = setup('');
    await mirror.mirror(job('send-sms', { to: '+923001234567', message: 'Your Dhoblio code is 482913.' }));
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('emails an OTP code with the account role and phone in the subject', async () => {
    const { mail, mirror } = setup('qa@example.com');
    await mirror.mirror(job('send-sms', { to: '+923001234567', message: 'Your Dhoblio code is 482913. It expires in 5 minutes.' }));
    const sent = mail.send.mock.calls[0][0];
    expect(sent.to).toBe('qa@example.com');
    expect(sent.subject).toBe('[Dhoblio dev] Login code 482913 - Rider +923001234567');
    expect(sent.text).toContain('Account : Rider - Bilal Ahmed');
    expect(sent.text).toContain('482913');
  });

  it('mirrors other SMS, WhatsApp and push notifications', async () => {
    const { mail, mirror } = setup('qa@example.com');
    await mirror.mirror(job('send-sms', { to: '+923001234567', message: 'Order DHB-1 was accepted.' }));
    await mirror.mirror(job('send-whatsapp', { to: '+923001234567', templateName: 'order_accepted_en', language: 'en', params: ['DHB-1'], fallbackText: 'accepted' }));
    await mirror.mirror(job('send-push', { tokens: ['a', 'b'], title: 'Order accepted', body: 'DHB-1' }));
    expect(mail.send.mock.calls.map((c) => c[0].subject)).toEqual([
      '[Dhoblio dev] SMS to +923001234567',
      '[Dhoblio dev] WhatsApp (order_accepted_en) to +923001234567',
      '[Dhoblio dev] Push: Order accepted',
    ]);
  });

  it('does not duplicate an email that already goes to the test inbox', async () => {
    const { mail, mirror } = setup('qa@example.com');
    await mirror.mirror(job('send-email', { to: 'QA@example.com', subject: 's', text: 't' }));
    expect(mail.send).not.toHaveBeenCalled();
    await mirror.mirror(job('send-email', { to: 'vendor@x.pk', subject: 's', text: 't' }));
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('never throws when the mail transport fails', async () => {
    const { mail, mirror } = setup('qa@example.com');
    mail.send.mockRejectedValue(new Error('smtp down'));
    await expect(mirror.mirror(job('send-sms', { to: '+923001234567', message: 'x' }))).resolves.toBeUndefined();
  });
});
