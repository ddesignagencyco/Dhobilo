/**
 * In-process domain events (@nestjs/event-emitter, TRD §5). Modules never reach into each other's tables:
 * they announce what happened and interested modules react.
 */
export const DomainEvent = {
  /** Anything a customer can see about a vendor changed (status, availability, hours, radius, catalog, rating). */
  VENDOR_CHANGED: 'vendor.changed',
  /** An order was placed (consumed by timers, notifications and dispatch in later phases). */
  ORDER_PLACED: 'order.placed',
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
