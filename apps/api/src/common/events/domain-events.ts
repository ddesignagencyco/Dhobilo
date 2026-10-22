/**
 * In-process domain events (@nestjs/event-emitter, TRD §5). Modules never reach into each other's tables:
 * they announce what happened and interested modules react.
 */
export const DomainEvent = {
  /** Anything a customer can see about a vendor changed (status, availability, hours, radius, catalog, rating). */
  VENDOR_CHANGED: 'vendor.changed',
  /** An order was placed (consumed by timers, notifications and dispatch in later phases). */
  ORDER_PLACED: 'order.placed',
  /** An order moved to a new status (committed). Drives live tracking, notifications and timers. */
  ORDER_STATUS_CHANGED: 'order.status_changed',
} as const;

export interface VendorChangedEvent {
  vendorId: string;
}

export interface OrderPlacedEvent {
  orderId: string;
  vendorId: string;
  customerId: string;
  requestId?: string;
}

export interface OrderStatusChangedEvent {
  orderId: string;
  from: import('@prisma/client').OrderStatus;
  to: import('@prisma/client').OrderStatus;
  /** Position in OrderStatusHistory; strictly increasing, used as the SSE event id. */
  seq: number;
  actor: 'CUSTOMER' | 'VENDOR' | 'RIDER' | 'ADMIN' | 'SYSTEM';
  reason?: string;
  at: string;
  requestId?: string;
}
