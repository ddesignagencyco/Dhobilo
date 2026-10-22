import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Availability, Prisma, Role, VendorStatus } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { FieldCrypto } from '../../common/crypto/field-crypto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, afterCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { CloudinaryService } from '../../infra/cloudinary/cloudinary.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, VendorDecision } from '../notifications/notifications.service';
import { maskCnic } from './cnic.util';
import { CNIC_CONTEXT } from './vendor-registration.service';

export interface ReviewContext {
  admin: AuthUser;
  ip?: string;
  requestId?: string;
}

export interface VendorListFilter {
  status?: VendorStatus;
  cityId?: number;
  q?: string;
  cursor?: string;
  limit?: number;
}

interface Transition {
  from: VendorStatus[];
  to: VendorStatus;
  action: string;
  decision: VendorDecision;
  reason?: string;
  data: Prisma.VendorUpdateManyMutationInput;
}

/** Document links stay valid for this long: long enough to review, short enough not to be shareable. */
const DOC_LINK_TTL_SEC = 600;

const docFormat = (url: string): string => {
  const ext = /\.([a-z0-9]+)(?:\?|$)/i.exec(url)?.[1];
  return ext ?? 'jpg';
};

@Injectable()
export class VendorReviewService {
  private readonly logger = new Logger(VendorReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Review queue: oldest first, so applicants are served in the order they applied. */
  async list(filter: VendorListFilter) {
    const limit = Math.min(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where: Prisma.VendorWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.cityId ? { cityId: filter.cityId } : {}),
      ...(filter.q ? { businessName: { contains: filter.q, mode: 'insensitive' } } : {}),
      ...afterCursor(filter.cursor),
    };
    const rows = await this.prisma.vendor.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: {
        id: true,
        businessName: true,
        status: true,
        cityId: true,
        createdAt: true,
        owner: { select: { phone: true, email: true } },
        _count: { select: { documents: true } },
      },
    });
    return sliceWithCursor(rows, limit);
  }

  /** Full review view. Documents come as short-lived signed links; the CNIC is masked (see revealCnic). */
  async detail(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, phone: true, email: true, name: true } },
        documents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!vendor) throw this.notFound();

    const { cnicEnc, cnicHash: _hash, documents, ...rest } = vendor;
    return {
      ...rest,
      cnicMasked: maskCnic(this.crypto.decrypt(cnicEnc, CNIC_CONTEXT)),
      documents: documents.map((d) => ({
        id: d.id,
        type: d.type,
        verifiedAt: d.verifiedAt,
        signedUrl: this.signedLink(d.publicId, d.url),
      })),
    };
  }

  /** Admin-only plaintext CNIC. Every reveal is written to the audit log before the value is returned. */
  async revealCnic(id: string, ctx: ReviewContext) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id }, select: { id: true, cnicEnc: true } });
    if (!vendor) throw this.notFound();

    const cnic = this.crypto.decrypt(vendor.cnicEnc, CNIC_CONTEXT);
    await this.audit.record({
      action: 'VENDOR_CNIC_VIEWED',
      entity: 'Vendor',
      entityId: id,
      actorId: ctx.admin.id,
      actorRole: Role.ADMIN,
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    // Opportunistic key rotation: data read with a retired key is rewritten with the current one.
    if (this.crypto.needsRotation(vendor.cnicEnc)) {
      await this.prisma.vendor.update({ where: { id }, data: { cnicEnc: this.crypto.encrypt(cnic, CNIC_CONTEXT) } });
    }
    return { cnic: `${cnic.slice(0, 5)}-${cnic.slice(5, 12)}-${cnic.slice(12)}` };
  }

  approve(id: string, ctx: ReviewContext) {
    return this.transition(id, ctx, {
      from: [VendorStatus.PENDING],
      to: VendorStatus.APPROVED,
      action: 'VENDOR_APPROVED',
      decision: 'APPROVED',
      data: { approvedAt: new Date(), approvedById: ctx.admin.id, rejectionReason: null },
    });
  }

  reject(id: string, reason: string, ctx: ReviewContext) {
    return this.transition(id, ctx, {
      from: [VendorStatus.PENDING],
      to: VendorStatus.REJECTED,
      action: 'VENDOR_REJECTED',
      decision: 'REJECTED',
      reason,
      data: { rejectionReason: reason },
    });
  }

  /** Suspended vendors drop out of discovery and cannot act (their status is no longer APPROVED). */
  suspend(id: string, reason: string, ctx: ReviewContext) {
    return this.transition(id, ctx, {
      from: [VendorStatus.APPROVED],
      to: VendorStatus.SUSPENDED,
      action: 'VENDOR_SUSPENDED',
      decision: 'SUSPENDED',
      reason,
      data: { rejectionReason: reason, availability: Availability.CLOSED },
    });
  }

  /** Back to APPROVED but still CLOSED: the vendor chooses when to take orders again. */
  reactivate(id: string, ctx: ReviewContext) {
    return this.transition(id, ctx, {
      from: [VendorStatus.SUSPENDED],
      to: VendorStatus.APPROVED,
      action: 'VENDOR_REACTIVATED',
      decision: 'REACTIVATED',
      data: { rejectionReason: null },
    });
  }

  private async transition(id: string, ctx: ReviewContext, t: Transition) {
    const before = await this.prisma.$transaction(async (tx) => {
      const current = await tx.vendor.findUnique({
        where: { id },
        select: { status: true, rejectionReason: true, businessName: true, owner: { select: { phone: true, email: true } } },
      });
      if (!current) throw this.notFound();

      // Conditional update: of two admins acting at once, only one wins.
      const claimed = await tx.vendor.updateMany({
        where: { id, status: { in: t.from } },
        data: { ...t.data, status: t.to },
      });
      if (claimed.count !== 1) {
        throw new AppException('VENDOR_INVALID_TRANSITION', `A ${current.status.toLowerCase()} vendor cannot be moved to ${t.to.toLowerCase()}.`, HttpStatus.CONFLICT, {
          from: current.status,
          to: t.to,
        });
      }
      if (t.to === VendorStatus.APPROVED && t.from.includes(VendorStatus.PENDING)) {
        await tx.vendorDocument.updateMany({ where: { vendorId: id }, data: { verifiedAt: new Date() } });
      }

      await this.audit.record(
        {
          action: t.action,
          entity: 'Vendor',
          entityId: id,
          actorId: ctx.admin.id,
          actorRole: Role.ADMIN,
          before: { status: current.status, reason: current.rejectionReason },
          after: { status: t.to, reason: t.reason ?? null },
          ip: ctx.ip,
          requestId: ctx.requestId,
        },
        tx,
      );
      return current;
    });

    await this.notifications.notifyVendorDecision(before.owner, before.businessName, t.decision, t.reason, ctx.requestId);

    return this.prisma.vendor.findUniqueOrThrow({
      where: { id },
      select: { id: true, businessName: true, status: true, availability: true, rejectionReason: true, approvedAt: true },
    });
  }

  private signedLink(publicId: string, url: string): string | null {
    try {
      return this.cloudinary.privateDownloadUrl(publicId, docFormat(url), DOC_LINK_TTL_SEC);
    } catch (err) {
      // Review stays usable if media isn't configured; the admin just can't open the files.
      this.logger.warn({ err, publicId }, 'Could not build a signed document link');
      return null;
    }
  }

  private notFound(): AppException {
    return new AppException(ErrorCode.NOT_FOUND, 'Vendor not found.', HttpStatus.NOT_FOUND);
  }
}
