import { HttpStatus } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { money } from '../../../common/money/money';
import type { GatewayCode, GatewayPaymentStatus, VerifiedPaymentEvent } from '../payment-gateway';

export const mockRef = (code: GatewayCode): string => `MOCK-${code.toUpperCase()}-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;

export const hmacHex = (secret: string, value: string | Buffer): string => createHmac('sha256', secret).update(value).digest('hex');

export const signaturesMatch = (expected: string, actual: string): boolean => {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function parseRawBody(rawBody: Buffer, contentType?: string | string[]): Record<string, unknown> {
  const text = rawBody.toString('utf8');
  const type = header({ 'content-type': contentType }, 'content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new AppException(ErrorCode.VALIDATION_FAILED, 'The webhook body is not valid JSON.', HttpStatus.BAD_REQUEST);
  }
}

export function statusFrom(value: unknown): GatewayPaymentStatus | null {
  const s = String(value ?? '').toUpperCase();
  if (['PAID', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'COMPLETE', '000', '00', 'CAPTURED'].includes(s)) return 'PAID';
  if (['FAILED', 'FAILURE', 'DECLINED', 'CANCELLED', 'CANCELED', 'ERROR'].includes(s)) return 'FAILED';
  if (['REFUNDED', 'REFUND'].includes(s)) return 'REFUNDED';
  if (['PENDING', 'INITIATED', 'PROCESSING'].includes(s)) return 'PENDING';
  return null;
}

/** Mock webhooks are JSON signed over the raw bytes with PAYMENT_MOCK_WEBHOOK_SECRET. */
export function verifyMockWebhook(
  gateway: GatewayCode,
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
  secret: string,
): VerifiedPaymentEvent {
  const given = header(headers, 'x-payment-signature');
  if (!secret || !given || !signaturesMatch(hmacHex(secret, rawBody), given)) throw unauthenticated();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new AppException(ErrorCode.VALIDATION_FAILED, 'The webhook body is not valid JSON.', HttpStatus.BAD_REQUEST);
  }
  const status = statusFrom(body.status);
  if (!status || typeof body.gatewayRef !== 'string') {
    throw new AppException(ErrorCode.VALIDATION_FAILED, 'A mock webhook needs `gatewayRef` and `status`.', HttpStatus.BAD_REQUEST);
  }
  return {
    gateway,
    gatewayRef: body.gatewayRef,
    status,
    ...(body.amount !== undefined ? { amount: money(String(body.amount)) } : {}),
    ...(body.eventId !== undefined ? { eventId: String(body.eventId) } : {}),
    payload: { status, ...(body.amount !== undefined ? { amount: String(body.amount) } : {}), ...(body.eventId !== undefined ? { eventId: String(body.eventId) } : {}) },
  };
}

export function unauthenticated(): AppException {
  return new AppException(ErrorCode.UNAUTHENTICATED, 'Invalid webhook signature.', HttpStatus.UNAUTHORIZED);
}

export function sortedSignature(secret: string, fields: Record<string, unknown>, exclude: (key: string) => boolean = () => false): string {
  const value = Object.keys(fields)
    .filter((key) => !exclude(key) && fields[key] !== undefined && fields[key] !== null && String(fields[key]) !== '')
    .sort()
    .map((key) => `${key}=${String(fields[key])}`)
    .join('&');
  return hmacHex(secret, value);
}
