import type { Job } from 'bullmq';
import { NotificationMirror } from './notification-mirror.service';

const job = (name: string, data: object) => ({ name, data }) as unknown as Job;

function setup(target: string, role = 'RIDER', locale = 'EN') {
  const mail = { send: jest.fn().mockResolvedValue({ messageId: 'm' }) };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ role, name: 'Bilal Ahmed', locale }) } };
  const config = { get: (key: string) => (key === 'APP_URL' ? 'http://localhost:3001' : target) };
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
    expect(sent.subject).toBe('[Dhoblio dev] Your Dhoblio sign-in code is 482913 - Rider +923001234567');
    expect(sent.text).toContain('Rider - Bilal Ahmed');
    expect(sent.text).toContain('4 8 2 9 1 3');
    expect(sent.html).toContain('<!DOCTYPE html>');
    expect(sent.html).toContain('Test copy');
  });

  it('sends the sign-in code in Urdu to an Urdu-speaking account', async () => {
    const { mail, mirror } = setup('qa@example.com', 'CUSTOMER', 'UR');
    await mirror.mirror(job('send-sms', { to: '+923001234567', message: 'Your Dhoblio code is 482913. It expires in 5 minutes. Do not share it.' }));
    const sent = mail.send.mock.calls[0][0];
    expect(sent.html).toContain('dir="rtl"');
    expect(sent.html).toContain('lang="ur"');
    expect(sent.subject).toContain('482913');
  });

  it('mirrors other SMS, WhatsApp and push notifications', async () => {
    const { mail, mirror } = setup('qa@example.com');
    await mirror.mirror(job('send-sms', { to: '+923001234567', message: 'Order DHB-1 was accepted.' }));
    await mirror.mirror(job('send-whatsapp', { to: '+923001234567', templateName: 'order_accepted_en', language: 'en', params: ['DHB-1'], fallbackText: 'accepted' }));
    await mirror.mirror(job('send-push', { tokens: ['a', 'b'], title: 'Order accepted', body: 'DHB-1' }));
    expect(mail.send.mock.calls.map((c) => c[0].subject)).toEqual([
      '[Dhoblio dev] SMS to +923001234567',
      '[Dhoblio dev] WhatsApp to +923001234567',
      '[Dhoblio dev] Push to 2 device(s)',
    ]);
    const whatsapp = mail.send.mock.calls[1][0];
    expect(whatsapp.html).toContain('order_accepted_en');
    expect(mail.send.mock.calls[0][0].html).toContain('Order DHB-1 was accepted.');
  });

  it('does not duplicate an email that already goes to the test inbox', async () => {
    const { mail, mirror } = setup('qa@example.com');
    await mirror.mirror(job('send-email', { to: 'QA@example.com', subject: 's', text: 't' }));
    expect(mail.send).not.toHaveBeenCalled();
    await mirror.mirror(job('send-email', { to: 'vendor@x.pk', subject: 's', text: 't' }));
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('forwards a designed email as the same HTML with a test banner', async () => {
    const { mail, mirror } = setup('qa@example.com');
    const html = '<!DOCTYPE html><html><body class="x" style="margin:0"><p>Hello</p></body></html>';
    await mirror.mirror(job('send-email', { to: 'vendor@x.pk', subject: 'Order accepted', text: 'plain', html }));
    const sent = mail.send.mock.calls[0][0];
    expect(sent.subject).toBe('[Dhoblio dev] Email to vendor@x.pk: Order accepted');
    expect(sent.html).toContain('<p>Hello</p>');
    expect(sent.html).toContain('originally sent to vendor@x.pk');
    expect(sent.html.indexOf('Test copy')).toBeLessThan(sent.html.indexOf('<p>Hello</p>'));
  });

  it('never throws when the mail transport fails', async () => {
    const { mail, mirror } = setup('qa@example.com');
    mail.send.mockRejectedValue(new Error('smtp down'));
    await expect(mirror.mirror(job('send-sms', { to: '+923001234567', message: 'x' }))).resolves.toBeUndefined();
  });
});
