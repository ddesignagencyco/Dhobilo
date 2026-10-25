import type { GatewayCode, GatewayPaymentStatus } from './payment-gateway';

export const PAYMENT_WEBHOOK_JOB = 'payment-webhook';
export const PAYMENT_RECONCILE_JOB = 'payment-reconcile';
export const REFUND_ORDER_JOB = 'refund-order';

/** A normalised gateway notification. Money is a string so the job payload is plain JSON. */
export interface PaymentWebhookJob {
  event: {
    gateway: GatewayCode;
    gatewayRef: string;
    status: GatewayPaymentStatus;
    amount?: string;
    eventId?: string;
    payload: Record<string, unknown>;
  };
}

export interface RefundOrderJob {
  orderId: string;
  reason?: string;
}

export const webhookJobId = (event: PaymentWebhookJob['event']): string | undefined => {
  if (!event.eventId) return undefined;
  const safe = event.eventId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 120);
  return `webhook-${event.gateway}-${safe}`;
};

export const refundOrderJobId = (orderId: string) => `refund-order-${orderId}`;
