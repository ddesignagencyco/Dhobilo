import { z } from 'zod';
import { VendorStatus } from '../enums';

export const vendorRegistrationSchema = z.object({
  businessName: z.string().min(3, 'Business name must be at least 3 characters'),
  businessType: z.enum(['LAUNDRY', 'DRY_CLEANER']),
  shopPhoneNumber: z.string().regex(/^03\d{9}$/, 'Invalid phone number'),
  shopAddress: z.object({
    address: z.string().min(5, 'Address required'),
    lat: z.number(),
    lng: z.number(),
    city: z.string(),
  }),
  serviceRadiusKm: z.number().min(1).max(50),
  ownerName: z.string().min(3),
  ownerPhone: z.string().regex(/^03\d{9}$/),
  cnicNumber: z.string().length(13, 'CNIC must be 13 digits'),
  cnicPhotoUrl: z.string().url(),
  shopPhotoUrls: z.array(z.string().url()).min(1, 'At least one shop photo required'),
});

export type VendorRegistration = z.infer<typeof vendorRegistrationSchema>;

export const vendorProfileSchema = z.object({
  name: z.string().min(2),
  locale: z.enum(['EN', 'UR']),
});

export const catalogItemSchema = z.object({
  name: z.string().min(1),
  nameUr: z.string().min(1),
  category: z.string(),
  price: z.number().min(0),
  turnaroundHours: z.number().min(1),
  active: z.boolean().default(true),
});

export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const payoutRequestSchema = z.object({
  bankIban: z.string().regex(/^PK\d{2}[A-Z]{4}\d{21}$/),
  amount: z.number().min(1000),
  notes: z.string().max(255).optional(),
});

export type PayoutRequest = z.infer<typeof payoutRequestSchema>;
