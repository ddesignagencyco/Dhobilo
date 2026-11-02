import { z } from 'zod';

/*
 * Each schema exports two types.
 *
 *   XInput  — what the form holds while it is being filled in. Anything behind `z.coerce` is `unknown`
 *             here, because a number field really does start life as a string in the DOM.
 *   X       — what the schema produces once it parses, which is what goes on the wire.
 *
 * react-hook-form needs both: `useForm<XInput, unknown, X>`. Passing only the output type makes the
 * resolver's generics disagree with the field registrations and the errors are unreadable.
 */
import {
  AdminRole,
  CommissionScope,
  DiscountType,
  NotificationChannel,
  PayoutMethod,
  Role,
} from '../enums';

/**
 * Form schemas for the admin panel, mirroring the API's class-validator DTOs field for field.
 *
 * Why mirror rather than trust the server: the API already validates everything and its errors come back
 * per field, but a round trip to learn "that code needs 3 characters" is a poor experience on a 3G
 * connection. These catch it in the browser; the server is still the authority.
 *
 * Each schema notes the DTO it mirrors. If one drifts, the server rejects the request and the panel shows
 * the server's field errors, so drift degrades to "slower", never to "wrong data accepted".
 */

/** The API's money format: a plain decimal with at most 2 places, matching its MONEY regex. */
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const money = (label: string) =>
  z
    .string()
    .trim()
    .regex(MONEY, { message: `${label} must look like 150 or 150.00` });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a date like 2026-10-24' });

/** apps/api/src/modules/admin/dto/admin-vendors.dto.ts — ReasonDto, shared by vendor and rider actions. */
export const reasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, { message: 'Give a reason of at least 5 characters — the vendor sees this.' })
    .max(500),
});
export type ReasonInput = z.infer<typeof reasonSchema>;
export type ReasonForm = z.input<typeof reasonSchema>;

/** finance.dto.ts — RejectPayoutDto. Shorter minimum than a vendor reason; this one is internal. */
export const rejectPayoutSchema = z.object({
  reason: z.string().trim().min(3, { message: 'Give a short reason.' }).max(300),
});
export type RejectPayoutInput = z.infer<typeof rejectPayoutSchema>;
export type RejectPayoutForm = z.input<typeof rejectPayoutSchema>;

/** finance.dto.ts — PayPayoutDto. */
export const payPayoutSchema = z.object({
  txnRef: z
    .string()
    .trim()
    .min(3, { message: 'Enter the bank or wallet transaction reference.' })
    .max(100),
});
export type PayPayoutInput = z.infer<typeof payPayoutSchema>;
export type PayPayoutForm = z.input<typeof payPayoutSchema>;

/** finance.dto.ts — SettleCodDto. */
export const settleCodSchema = z.object({
  riderId: z.string().uuid(),
  reference: z.string().trim().max(100).optional().or(z.literal('')),
});
export type SettleCodInput = z.infer<typeof settleCodSchema>;
export type SettleCodForm = z.input<typeof settleCodSchema>;

/** finance.dto.ts — CreateCommissionRuleDto. */
export const createCommissionRuleSchema = z
  .object({
    scope: z.enum([CommissionScope.GLOBAL, CommissionScope.CATEGORY, CommissionScope.VENDOR]),
    vendorId: z.string().uuid().optional(),
    categoryId: z.coerce.number().int().min(1).optional(),
    ratePct: z.coerce
      .number()
      .min(0, { message: 'Rate cannot be negative.' })
      .max(100, { message: 'Rate cannot exceed 100%.' })
      .refine((n) => Number.isInteger(n * 100), { message: 'At most 2 decimal places.' }),
    effectiveFrom: z.string().optional(),
  })
  // The API resolves a rate as vendor rule, else category rule, else global, so the scope decides which
  // target field is required. Getting this wrong server-side returns a bare VALIDATION_FAILED.
  .refine((v) => v.scope !== CommissionScope.VENDOR || !!v.vendorId, {
    message: 'Choose a vendor for a vendor-scoped rule.',
    path: ['vendorId'],
  })
  .refine((v) => v.scope !== CommissionScope.CATEGORY || !!v.categoryId, {
    message: 'Choose a service category for a category-scoped rule.',
    path: ['categoryId'],
  });
export type CreateCommissionRuleInput = z.infer<typeof createCommissionRuleSchema>;
export type CreateCommissionRuleForm = z.input<typeof createCommissionRuleSchema>;

export const updateCommissionRuleSchema = z.object({
  ratePct: z.coerce
    .number()
    .min(0)
    .max(100)
    .refine((n) => Number.isInteger(n * 100), { message: 'At most 2 decimal places.' })
    .optional(),
  effectiveFrom: z.string().optional(),
});
export type UpdateCommissionRuleInput = z.infer<typeof updateCommissionRuleSchema>;
export type UpdateCommissionRuleForm = z.input<typeof updateCommissionRuleSchema>;

/** promos.dto.ts — CreatePromoDto. */
export const createPromoSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,32}$/, { message: 'Use 3–32 letters, numbers, _ or -.' }),
    discountType: z.enum([DiscountType.PERCENT, DiscountType.FLAT]),
    value: money('Value'),
    maxDiscount: money('Cap').optional().or(z.literal('')),
    minOrderAmount: money('Minimum order').optional().or(z.literal('')),
    maxUses: z.coerce.number().int().min(1).max(1_000_000).optional(),
    perUserLimit: z.coerce.number().int().min(1).max(100).optional(),
    validFrom: z.string().min(1, { message: 'Choose a start date.' }),
    validTo: z.string().min(1, { message: 'Choose an end date.' }),
    cityId: z.coerce.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => new Date(v.validTo) > new Date(v.validFrom), {
    message: 'The end date must be after the start date.',
    path: ['validTo'],
  })
  // A percentage over 100 is accepted by the MONEY regex but makes no sense as a discount.
  .refine((v) => v.discountType !== DiscountType.PERCENT || Number(v.value) <= 100, {
    message: 'A percentage discount cannot exceed 100.',
    path: ['value'],
  })
  .refine((v) => v.discountType !== DiscountType.PERCENT || Number(v.value) > 0, {
    message: 'A percentage discount must be more than 0.',
    path: ['value'],
  });
export type CreatePromoInput = z.infer<typeof createPromoSchema>;
export type CreatePromoForm = z.input<typeof createPromoSchema>;

/** promos.dto.ts — UpdatePromoDto. `code` and `discountType` are immutable server-side. */
export const updatePromoSchema = z.object({
  value: money('Value').optional().or(z.literal('')),
  maxDiscount: money('Cap').optional().or(z.literal('')),
  minOrderAmount: money('Minimum order').optional().or(z.literal('')),
  maxUses: z.coerce.number().int().min(1).max(1_000_000).optional(),
  perUserLimit: z.coerce.number().int().min(1).max(100).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  cityId: z.coerce.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePromoInput = z.infer<typeof updatePromoSchema>;
export type UpdatePromoForm = z.input<typeof updatePromoSchema>;

/** announcements.dto.ts — SegmentDto. */
export const TARGET_ROLES = [Role.CUSTOMER, Role.VENDOR_OWNER, Role.VENDOR_STAFF, Role.RIDER] as const;
export const ANNOUNCE_CHANNELS = [
  NotificationChannel.PUSH,
  NotificationChannel.SMS,
  NotificationChannel.EMAIL,
] as const;

export const segmentSchema = z
  .object({
    roles: z.array(z.enum(TARGET_ROLES)).max(TARGET_ROLES.length).optional(),
    cityId: z.coerce.number().int().min(1).optional(),
    activeWithinDays: z.coerce.number().int().min(1).max(365).optional(),
    inactiveForDays: z.coerce.number().int().min(1).max(730).optional(),
  })
  // Both at once describes an empty audience, which the API would accept and send to nobody.
  .refine((v) => !(v.activeWithinDays && v.inactiveForDays), {
    message: 'Choose either recently active or inactive, not both.',
    path: ['inactiveForDays'],
  });
export type SegmentInput = z.infer<typeof segmentSchema>;
export type SegmentForm = z.input<typeof segmentSchema>;

/** announcements.dto.ts — CreateAnnouncementDto. */
export const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(1, { message: 'Add a title.' }).max(65),
    body: z.string().trim().min(1, { message: 'Add a message.' }).max(500),
    titleUr: z.string().trim().max(65).optional().or(z.literal('')),
    bodyUr: z.string().trim().max(500).optional().or(z.literal('')),
    segment: segmentSchema,
    channels: z.array(z.enum(ANNOUNCE_CHANNELS)).min(1, { message: 'Choose at least one channel.' }),
    confirmRecipients: z.coerce.number().int().min(0),
  })
  // The DTO comment says "both or neither": a title without a body would send a half-translated push.
  .refine((v) => !!v.titleUr === !!v.bodyUr, {
    message: 'Provide both the Urdu title and the Urdu message, or neither.',
    path: ['bodyUr'],
  });
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type CreateAnnouncementForm = z.input<typeof createAnnouncementSchema>;

/** reports.dto.ts — CreateReportDto. */
export const REPORT_TYPES = ['ORDERS', 'PAYMENTS', 'PAYOUTS', 'COD', 'VENDORS'] as const;
export const REPORT_FORMATS = ['CSV', 'XLSX'] as const;

export const createReportSchema = z
  .object({
    type: z.enum(REPORT_TYPES),
    format: z.enum(REPORT_FORMATS).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    cityId: z.coerce.number().int().min(1).optional(),
    vendorId: z.string().uuid().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'The start date must not be after the end date.',
    path: ['to'],
  });
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type CreateReportForm = z.input<typeof createReportSchema>;

/** complaints.dto.ts — ResolveComplaintDto. */
export const COMPLAINT_OUTCOMES = ['REFUND', 'REDO', 'REJECT'] as const;

export const resolveComplaintSchema = z
  .object({
    outcome: z.enum(COMPLAINT_OUTCOMES),
    note: z.string().trim().min(3).max(1000).optional().or(z.literal('')),
  })
  // Rejecting a customer's complaint without saying why is the kind of thing that ends up in a screenshot.
  .refine((v) => v.outcome !== 'REJECT' || (v.note && v.note.trim().length >= 3), {
    message: 'Explain why the complaint is being rejected.',
    path: ['note'],
  });
export type ResolveComplaintInput = z.infer<typeof resolveComplaintSchema>;
export type ResolveComplaintForm = z.input<typeof resolveComplaintSchema>;

/** admin-users.dto.ts — CreateAdminDto. */
export const createAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: 'Enter a valid email address.' }).max(254),
  name: z.string().trim().min(2, { message: 'Enter a name.' }).max(100),
  password: z.string().min(12, { message: 'Use at least 12 characters.' }).max(200),
  adminRole: z.enum([AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.FINANCE, AdminRole.SUPPORT]),
});
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type CreateAdminForm = z.input<typeof createAdminSchema>;

/** admin-users.dto.ts — UpdateAdminDto. The API only accepts ACTIVE or DEACTIVATED here. */
export const updateAdminSchema = z.object({
  adminRole: z
    .enum([AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.FINANCE, AdminRole.SUPPORT])
    .optional(),
  status: z.enum(['ACTIVE', 'DEACTIVATED']).optional(),
});
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
export type UpdateAdminForm = z.input<typeof updateAdminSchema>;

/** admin-users.dto.ts — ChangeOwnPasswordDto. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: 'Enter your current password.' }).max(200),
    newPassword: z.string().min(12, { message: 'Use at least 12 characters.' }).max(200),
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'Choose a password different from the current one.',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangePasswordForm = z.input<typeof changePasswordSchema>;

/** cities.dto.ts — UpdateCityDto. */
export const updateCitySchema = z.object({
  deliveryFee: z.coerce
    .number()
    .min(0)
    .max(5000, { message: 'The delivery fee cannot exceed Rs 5,000.' })
    .refine((n) => Number.isInteger(n * 100), { message: 'At most 2 decimal places.' })
    .optional(),
  isActive: z.boolean().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,4}$/, { message: 'Use 2–4 letters, e.g. LHR.' })
    .optional(),
  nameUr: z.string().trim().min(1).max(80).optional().or(z.literal('')),
  // null puts the city back on our own riders; a UUID hands it to a courier partner.
  courierPartnerId: z.string().uuid().nullable().optional(),
});
export type UpdateCityInput = z.infer<typeof updateCitySchema>;
export type UpdateCityForm = z.input<typeof updateCitySchema>;

/** The payout method a vendor chose, shown read-only in the admin queue. */
export const PAYOUT_METHODS = [PayoutMethod.BANK, PayoutMethod.WALLET] as const;
