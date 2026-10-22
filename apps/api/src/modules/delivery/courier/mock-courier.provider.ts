import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../../config/env';
import { CourierEvent, CourierJobInput, CourierProvider } from './courier-provider';

/** What the mock partner signs: enough to tie the signature to this exact event. */
export const mockWebhookSignature = (secret: string, e: { eventId: string; trackingRef: string; status: string }) =>
  createHmac('sha256', secret).update(`${e.eventId}.${e.trackingRef}.${e.status}`).digest('hex');

/** A stand-in partner for development and tests: accepts everything and signs its webhooks with a shared secret. */
@Injectable()
export class MockCourierProvider implements CourierProvider {
  readonly code = 'mock';
  private readonly logger = new Logger(MockCourierProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async createJob(input: CourierJobInput): Promise<{ partnerRef: string }> {
    const partnerRef = `MOCK-${input.jobId.slice(0, 8).toUpperCase()}`;
    this.logger.warn(`[MOCK COURIER] ${input.jobType} for ${input.orderNo} -> ${partnerRef}`);
    return { partnerRef };
  }

  async cancelJob(partnerRef: string): Promise<void> {
    this.logger.warn(`[MOCK COURIER] cancel ${partnerRef}`);
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, body: unknown): boolean {
    const secret = this.config.get('COURIER_MOCK_WEBHOOK_SECRET', { infer: true });
    const event = this.parseWebhook(body);
    const given = headers['x-courier-signature'];
    // No secret configured means no webhook is trusted, rather than every webhook.
    if (!secret || !event || typeof given !== 'string') return false;
    const expected = Buffer.from(mockWebhookSignature(secret, event));
    const actual = Buffer.from(given);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  parseWebhook(body: unknown): CourierEvent | null {
    const b = body as Partial<Record<keyof CourierEvent, unknown>> | null;
    if (!b || typeof b.eventId !== 'string' || typeof b.trackingRef !== 'string') return null;
    if (b.status !== 'IN_TRANSIT' && b.status !== 'COMPLETED' && b.status !== 'FAILED') return null;
    return { eventId: b.eventId, trackingRef: b.trackingRef, status: b.status, reason: typeof b.reason === 'string' ? b.reason : undefined };
  }
}
