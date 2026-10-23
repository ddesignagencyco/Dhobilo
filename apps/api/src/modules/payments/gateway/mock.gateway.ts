import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';
import type { Env } from '../../../config/env';
import { REDIS } from '../../../infra/redis/redis.constants';
import { CheckoutInfo, GatewayEvent, GatewayStatus, PaymentGateway, PaymentRequest, RefundResult } from './payment-gateway';

/** How the fake gateway signs the notifications it "sends" (and what tests sign with). */
export const mockSignature = (secret: string, rawBody: string | Buffer) => createHmac('sha256', secret).update(rawBody).digest('hex');
export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

const stateKey = (ref: string) => `mockgw:${ref}`;

/**
 * A stand-in gateway for development and tests: "pays" or "fails" when you call its dev endpoints, signs its
 * notifications with a shared secret, and remembers each payment's state so reconciliation can ask it.
 * Refused in production (see PAYMENT_MOCK_GATEWAY).
 */
@Injectable()
export class MockGateway implements PaymentGateway {
  readonly code = 'mock';
  private readonly logger = new Logger(MockGateway.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private get secret() {
    return this.config.get('PAYMENT_MOCK_SECRET', { infer: true });
  }

  async initiate(req: PaymentRequest): Promise<CheckoutInfo> {
    const gatewayRef = `MOCKPAY-${randomBytes(5).toString('hex').toUpperCase()}`;
    await this.redis.set(stateKey(gatewayRef), JSON.stringify({ status: 'PENDING', amount: req.amount }), 'EX', 86_400);
    const api = this.config.get('API_URL', { infer: true });
    this.logger.warn(`[MOCK GATEWAY] ${req.orderNo} Rs ${req.amount} -> ${gatewayRef}`);
    return { gatewayRef, redirectUrl: `${api}/api/v1/dev/mock-gateway/${gatewayRef}`, method: 'GET' };
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): GatewayEvent | null {
    const secret = this.secret;
    const given = headers[MOCK_SIGNATURE_HEADER];
    if (!secret || typeof given !== 'string') return null;
    const expected = Buffer.from(mockSignature(secret, rawBody));
    const actual = Buffer.from(given);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const b = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      if (typeof b.eventId !== 'string' || typeof b.gatewayRef !== 'string') return null;
      if (b.status !== 'PAID' && b.status !== 'FAILED') return null;
      return {
        eventId: b.eventId,
        gatewayRef: b.gatewayRef,
        status: b.status,
        amount: typeof b.amount === 'string' ? b.amount : undefined,
        reason: typeof b.reason === 'string' ? b.reason : undefined,
        payload: { eventId: b.eventId, gatewayRef: b.gatewayRef, status: b.status, amount: b.amount, reason: b.reason },
      };
    } catch {
      return null;
    }
  }

  async refund(gatewayRef: string, amount: string, reason: string): Promise<RefundResult> {
    this.logger.warn(`[MOCK GATEWAY] refund ${gatewayRef} Rs ${amount} (${reason})`);
    await this.redis.set(stateKey(gatewayRef), JSON.stringify({ status: 'REFUNDED', amount }), 'EX', 86_400);
    return { refundRef: `MOCKREF-${randomBytes(5).toString('hex').toUpperCase()}` };
  }

  async status(gatewayRef: string): Promise<GatewayStatus> {
    const raw = await this.redis.get(stateKey(gatewayRef));
    if (!raw) return { status: 'PENDING' };
    const s = JSON.parse(raw) as { status: string; amount?: string };
    return { status: s.status === 'PAID' || s.status === 'REFUNDED' ? 'PAID' : s.status === 'FAILED' ? 'FAILED' : 'PENDING', amount: s.amount };
  }

  /** Dev endpoints only: what the "customer" did on the fake hosted page. Returns the signed notification to deliver. */
  async simulate(gatewayRef: string, outcome: 'PAID' | 'FAILED', amount: string): Promise<{ rawBody: string; signature: string }> {
    await this.redis.set(stateKey(gatewayRef), JSON.stringify({ status: outcome, amount }), 'EX', 86_400);
    const rawBody = JSON.stringify({ eventId: `evt-${randomBytes(6).toString('hex')}`, gatewayRef, status: outcome, amount, ...(outcome === 'FAILED' ? { reason: 'Declined on the mock gateway' } : {}) });
    return { rawBody, signature: mockSignature(this.secret, rawBody) };
  }
}
