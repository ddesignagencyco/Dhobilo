/**
 * What every payment gateway adapter must do (TRD §13.1). Customers always pay on the gateway's own hosted page:
 * card numbers and wallet PINs never reach our servers or logs (PCI scope stays SAQ-A).
 */

export interface PaymentRequest {
  paymentId: string;
  orderId: string;
  orderNo: string;
  /** Two decimals, PKR, e.g. "510.00". */
  amount: string;
  customerPhone: string;
  description: string;
  /** Where the gateway sends the customer's browser afterwards. The result is decided by the webhook, never by this visit. */
  returnUrl: string;
  expiresAt: Date;
}

/** What the app shows or posts to send the customer to the gateway. */
export interface CheckoutInfo {
  gatewayRef: string;
  /** Open this address (GET) or, when `formFields` is present, post the form to it. */
  redirectUrl: string;
  method: 'GET' | 'POST';
  formFields?: Record<string, string>;
}

/** A notification from the gateway, already verified and translated into our words. */
export interface GatewayEvent {
  /** Unique per notification; the same one arriving again is applied once. */
  eventId: string;
  gatewayRef: string;
  status: 'PAID' | 'FAILED';
  /** Two decimals. Compared with what we asked for before we believe it. */
  amount?: string;
  reason?: string;
  /** Safe parts of the payload to keep for support. Never contains secrets, hashes or card data. */
  payload: Record<string, unknown>;
}

export interface GatewayStatus {
  status: 'PENDING' | 'PAID' | 'FAILED';
  amount?: string;
}

export interface RefundResult {
  refundRef: string;
}

export interface PaymentGateway {
  /** Stored in `Payment.gateway` and used in the webhook URL. */
  readonly code: string;
  initiate(request: PaymentRequest): Promise<CheckoutInfo>;
  /**
   * Adds back anything secret that is needed to open the checkout but must not be stored with the payment.
   * Called every time the checkout is handed to the customer.
   */
  hydrateCheckout?(checkout: CheckoutInfo): CheckoutInfo;
  /** Checks the signature on the raw request body. Returns null when it does not match (or the body is malformed). */
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): GatewayEvent | null;
  /** Full refund of a paid payment. */
  refund(gatewayRef: string, amount: string, reason: string): Promise<RefundResult>;
  /** Asks the gateway directly, for payments whose notification never arrived. */
  status(gatewayRef: string): Promise<GatewayStatus>;
}

export const PAYMENT_GATEWAYS = Symbol('PAYMENT_GATEWAYS');
