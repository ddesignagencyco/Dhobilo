import { z } from 'zod';

/**
 * Discovery filters for vendor search.
 */
export const discoveryFiltersSchema = z.object({
  serviceType: z.string().optional(),
  minRating: z.number().min(1).max(5).optional(),
  maxPrice: z.number().min(0).optional(),
  sortBy: z.enum(['distance', 'rating', 'price']).default('distance'),
});

export type DiscoveryFilters = z.infer<typeof discoveryFiltersSchema>;

/**
 * Cart item schema.
 */
export const cartItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().min(1),
});

export type CartItem = z.infer<typeof cartItemSchema>;

/**
 * Cart schema.
 */
export const cartSchema = z.object({
  vendorId: z.string(),
  items: z.array(cartItemSchema),
});

export type Cart = z.infer<typeof cartSchema>;

/**
 * Slot schema for pickup and delivery.
 */
export const slotSchema = z.object({
  date: z.string(), // ISO date string
  startTime: z.string(), // HH:MM format
  endTime: z.string(), // HH:MM format
});

export type Slot = z.infer<typeof slotSchema>;

/**
 * Checkout draft schema - persisted to IndexedDB.
 */
export const checkoutDraftSchema = z.object({
  cart: cartSchema,
  address: z.object({ id: z.string() }),
  pickupSlot: slotSchema,
  deliverySlot: slotSchema,
  paymentMethod: z.enum(['COD']),
  notes: z.string().max(200).optional(),
  idempotencyKey: z.string().optional(),
});

export type CheckoutDraft = z.infer<typeof checkoutDraftSchema>;
