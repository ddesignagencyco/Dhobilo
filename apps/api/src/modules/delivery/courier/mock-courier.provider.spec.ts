import { ConfigService } from '@nestjs/config';
import { MockCourierProvider, mockWebhookSignature } from './mock-courier.provider';

const provider = (secret: string) => new MockCourierProvider({ get: () => secret } as unknown as ConfigService<never, true>);
const event = { eventId: 'e1', trackingRef: 'MOCK-1', status: 'COMPLETED' };

describe('MockCourierProvider', () => {
  it('accepts a webhook signed with the shared secret', () => {
    const p = provider('s3cret');
    expect(p.verifyWebhook({ 'x-courier-signature': mockWebhookSignature('s3cret', event) }, event)).toBe(true);
  });

  it('refuses every webhook when no secret is configured (rather than trusting everyone)', () => {
    const p = provider('');
    expect(p.verifyWebhook({ 'x-courier-signature': mockWebhookSignature('', event) }, event)).toBe(false);
  });

  it('refuses a wrong, missing, repeated or differently-sized signature', () => {
    const p = provider('s3cret');
    expect(p.verifyWebhook({ 'x-courier-signature': 'abc' }, event)).toBe(false);
    expect(p.verifyWebhook({}, event)).toBe(false);
    expect(p.verifyWebhook({ 'x-courier-signature': ['a', 'b'] }, event)).toBe(false);
    expect(p.verifyWebhook({ 'x-courier-signature': mockWebhookSignature('other', event) }, event)).toBe(false);
  });

  it('ties the signature to the exact event: changing the status or reference breaks it', () => {
    const p = provider('s3cret');
    const sig = mockWebhookSignature('s3cret', event);
    expect(p.verifyWebhook({ 'x-courier-signature': sig }, { ...event, status: 'FAILED' })).toBe(false);
    expect(p.verifyWebhook({ 'x-courier-signature': sig }, { ...event, trackingRef: 'MOCK-2' })).toBe(false);
  });

  it('parses only well-formed payloads with a known status', () => {
    const p = provider('x');
    expect(p.parseWebhook({ ...event, reason: 'late' })).toEqual({ eventId: 'e1', trackingRef: 'MOCK-1', status: 'COMPLETED', reason: 'late' });
    expect(p.parseWebhook({ ...event, status: 'EXPLODED' })).toBeNull();
    expect(p.parseWebhook({ eventId: 'e1' })).toBeNull();
    expect(p.parseWebhook(null)).toBeNull();
    expect(p.parseWebhook('string')).toBeNull();
  });

  it('creates a job with a stable tracking reference', async () => {
    const p = provider('x');
    const input = { jobId: 'abcdef12-0000-4000-8000-000000000000', orderNo: 'DHB-1', jobType: 'PICKUP' as const, from: { name: 'a', address: 'a', lat: 1, lng: 1 }, to: { name: 'b', address: 'b', lat: 1, lng: 1 }, scheduledStart: new Date(), scheduledEnd: new Date() };
    expect(await p.createJob(input)).toEqual({ partnerRef: 'MOCK-ABCDEF12' });
  });
});
