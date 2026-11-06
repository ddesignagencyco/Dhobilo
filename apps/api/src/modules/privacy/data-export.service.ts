import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { FieldCrypto } from '../../common/crypto/field-crypto';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RIDER_CNIC_CONTEXT } from '../delivery/rider-registration.service';
import { maskCnic } from '../vendors/cnic.util';
import { CNIC_CONTEXT } from '../vendors/vendor-registration.service';
import type { RequestContext } from './account-deletion.service';

/** Keeps one response a sensible size; the response says when a list was cut short. */
export const EXPORT_LIMITS = { orders: 500, notifications: 200, reviews: 200, complaints: 100 } as const;

/**
 * "Give me my data" (the access right): everything the platform holds about the signed-in person, as JSON.
 * Passwords, token hashes and other people's data are never included, and the CNIC is shown masked.
 */
@Injectable()
export class DataExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async export(auth: AuthUser, ctx: RequestContext) {
    const userId = auth.id;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, phone: true, email: true, name: true, role: true, locale: true, referralCode: true, notificationPrefs: true, phoneVerifiedAt: true, lastLoginAt: true, createdAt: true },
    });

    const [addresses, orders, reviews, complaints, notifications, devices, sessions, referral] = await Promise.all([
      this.prisma.address.findMany({ where: { userId, deletedAt: null }, select: { label: true, line1: true, line2: true, area: true, cityId: true, lat: true, lng: true, isDefault: true, createdAt: true } }),
      this.prisma.order.findMany({
        where: { customerId: userId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_LIMITS.orders + 1,
        select: { orderNo: true, status: true, placedAt: true, deliveredAt: true, subtotal: true, discountTotal: true, deliveryFee: true, total: true, paymentMethod: true, paymentStatus: true, addressSnapshot: true, customerNote: true, vendor: { select: { businessName: true } }, items: { select: { name: true, qty: true, unitPrice: true } } },
      }),
      this.prisma.review.findMany({ where: { customerId: userId }, orderBy: { createdAt: 'desc' }, take: EXPORT_LIMITS.reviews + 1, select: { targetType: true, rating: true, comment: true, createdAt: true } }),
      this.prisma.complaint.findMany({
        where: { customerId: userId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_LIMITS.complaints + 1,
        select: { type: true, status: true, subject: true, description: true, resolution: true, createdAt: true, messages: { where: { authorId: userId }, select: { body: true, createdAt: true } } },
      }),
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: EXPORT_LIMITS.notifications + 1, select: { channel: true, template: true, status: true, sentAt: true, createdAt: true } }),
      this.prisma.deviceToken.findMany({ where: { userId }, select: { platform: true, createdAt: true } }),
      this.prisma.session.count({ where: { userId, revokedAt: null, expiresAt: { gt: this.clock.now() } } }),
      this.prisma.referral.findFirst({ where: { OR: [{ refereeId: userId }, { referrerId: userId }] }, select: { status: true, createdAt: true } }),
    ]);

    const cut = <T>(rows: T[], limit: number) => ({ items: rows.slice(0, limit), truncated: rows.length > limit });
    const o = cut(orders, EXPORT_LIMITS.orders);
    const r = cut(reviews, EXPORT_LIMITS.reviews);
    const c = cut(complaints, EXPORT_LIMITS.complaints);
    const n = cut(notifications, EXPORT_LIMITS.notifications);

    const data = {
      generatedAt: this.clock.now().toISOString(),
      account: user,
      addresses,
      orders: o.items.map((x) => ({ ...x, vendor: x.vendor.businessName })),
      reviews: r.items,
      complaints: c.items,
      notificationLog: n.items,
      devices,
      activeSessions: sessions,
      referral,
      vendor: auth.role === Role.VENDOR_OWNER ? await this.vendorData(userId) : undefined,
      rider: auth.role === Role.RIDER ? await this.riderData(userId) : undefined,
      truncated: { orders: o.truncated, reviews: r.truncated, complaints: c.truncated, notificationLog: n.truncated },
      notes: [
        'Orders, payments, payouts and ledger entries are kept for the legal retention period even after an account is deleted; they are then anonymised.',
        'Passwords, token hashes and other people\'s personal data are never part of this export.',
      ],
    };
    await this.audit.recordSafely({ action: 'DATA_EXPORT_REQUESTED', entity: 'User', entityId: userId, actorId: userId, actorRole: auth.role, ip: ctx.ip, requestId: ctx.requestId });
    return data;
  }

  private async vendorData(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerId: userId },
      select: {
        businessName: true, description: true, addressLine: true, lat: true, lng: true, status: true, cnicEnc: true, createdAt: true,
        staff: { select: { user: { select: { name: true, phone: true } } } },
        documents: { select: { type: true, createdAt: true, verifiedAt: true } },
        payouts: { select: { amount: true, method: true, accountRef: true, status: true, requestedAt: true }, orderBy: { requestedAt: 'desc' }, take: 100 },
        hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
      },
    });
    if (!vendor) return null;
    const { cnicEnc, ...rest } = vendor;
    return { ...rest, cnicMasked: this.maskedCnic(cnicEnc, CNIC_CONTEXT) };
  }

  private async riderData(userId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { userId },
      select: { status: true, cityId: true, cnicEnc: true, photoUrl: true, createdAt: true, approvedAt: true, lastSeenAt: true },
    });
    if (!rider) return null;
    const { cnicEnc, ...rest } = rider;
    return { ...rest, cnicMasked: this.maskedCnic(cnicEnc, RIDER_CNIC_CONTEXT) };
  }

  private maskedCnic(enc: string, context: string): string | null {
    if (!enc) return null;
    try {
      return maskCnic(this.crypto.decrypt(enc, context));
    } catch {
      return null;
    }
  }
}
