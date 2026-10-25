import type { PaymentMethod } from '@prisma/client';
import type { Money } from '../../common/money/money';

/** The provider codes stored on Payment.gateway (and used in webhook paths). */
export const GATEWAY_CODES = ['jazzcash', 'easypaisa', 'payfast', 'raast'] as const;
export type GatewayCode = (typeof GATEWAY_CODES)[number];

export type GatewayPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface CheckoutInput {
  orderId: string;
  orderNo: string;
  amount: Money;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  description: string;
}

export interface CheckoutResult {
  gatewayRef: string;
  /** Where the app should send the customer (hosted checkout). */
  redirectUrl: string;
  /** For gateways that expect a self-submitting HTML form instead of a GET redirect. */
  formFields?: Record<string, string>;
}

export interface VerifiedPaymentEvent {
  gateway: GatewayCode;
  gatewayRef: string;
  status: GatewayPaymentStatus;
  amount?: Money;
  /** Provider id for this notification; repeating it is a duplicate, not a new payment. */
  eventId?: string;
  /** Sanitised payload safe to keep in the database and logs. */
  payload: Record<string, unknown>;
}

export interface GatewayStatus {
  status: GatewayPaymentStatus;
  amount?: Money;
  eventId?: string;
  payload?: Record<string, unknown>;
}

export interface RefundResult {
  refundRef: string;
  status: 'REFUNDED' | 'PENDING';
}

/**
 * One adapter per online payment provider (TRD §13). A gateway only talks to its provider: it never touches the
 * database or changes an order. Signatures are verified by the adapter on the exact raw bytes received.
 */
export interface PaymentGateway {
  readonly code: GatewayCode;
  readonly method: PaymentMethod;
  readonly label: string;
  /** Create a hosted checkout, or rebuild it for the same reference when the customer retries. */
  initiate(input: CheckoutInput, gatewayRef?: string): Promise<CheckoutResult>;
  /** Throws UNAUTHENTICATED when the signature/caller cannot be trusted. */
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): VerifiedPaymentEvent;
  /** Ask the provider what happened (used when a webhook never arrived). */
  status(gatewayRef: string): Promise<GatewayStatus>;
  refund(gatewayRef: string, amount: Money, reason?: string): Promise<RefundResult>;
}

export const PAYMENT_GATEWAYS = Symbol('PAYMENT_GATEWAYS');
