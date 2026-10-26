import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComplaintStatus, ComplaintType, OrderStatus, PaymentMethod, PaymentStatus, Prisma, Role } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { beforeCursor, DEFAULT_PAGE_SIZE, sliceWithCursor } from '../../common/pagination/cursor';
import type { Env } from '../../config/env';
import { CloudinaryService, uploadFolder } from '../../infra/cloudinary/cloudinary.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DeliveryJobsService } from '../delivery/delivery-jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { AssignComplaintDto, CreateComplaintDto, ListComplaintsQueryDto, ResolveComplaintDto } from './dto/complaints.dto';

const OPEN_STATUSES = [ComplaintStatus.OPEN, ComplaintStatus.IN_REVIEW, ComplaintStatus.VENDOR_RESPONDED] as const;
const ACTIVE_ATTACHMENT_TTL_SEC = 10 * 60;

interface Attachment {
  publicId: string;
  url: string;
  format: string;
}

const complaintSelect = {
  id: true,
  orderId: true,
  customerId: true,
  vendorId: true,
  type: true,
  status: true,
  subject: true,
  description: true,
  attachments: true,
  resolution: true,
  assignedToId: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  order: { select: { orderNo: true } },
  vendor: { select: { businessName: true } },
} satisfies Prisma.ComplaintSelect;

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly cloudinary: CloudinaryService,
    private readonly payments: PaymentsService,
    private readonly delivery: DeliveryJobsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** A customer can open one live complaint per delivered order; once it is closed another may be filed. */
  async create(customerId: string, orderId: string, dto: CreateComplaintDto, requestId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNo: true,
        customerId: true,
        vendorId: true,
        status: true,
        vendor: { select: { owner: { select: { phone: true } } } },
      },
    });
    if (!order || order.customerId !== customerId) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Order not found.', HttpStatus.NOT_FOUND);
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new AppException('COMPLAINT_NOT_ALLOWED', 'You can file a complaint after the order is delivered.', HttpStatus.CONFLICT);
    }
    const attachments = await this.verifyAttachments(customerId, dto.attachments?.map((a) => a.publicId) ?? []);
    const complaint = await this.prisma.$transaction(async (tx) => {
      // Serialize complaint creation per order so two simultaneous requests cannot both open one.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const existing = await tx.complaint.findFirst({
        where: { orderId, status: { in: [...OPEN_STATUSES] } },
        select: { id: true },
      });
      if (existing) {
        throw new AppException('COMPLAINT_OPEN', 'This order already has an open complaint.', HttpStatus.CONFLICT, { complaintId: existing.id });
      }
      return tx.complaint.create({
        data: {
          orderId,
          customerId,
          vendorId: order.vendorId,
          type: dto.type ?? ComplaintType.COMPLAINT,
          subject: dto.subject.trim(),
          description: dto.description.trim(),
          attachments: attachments.length ? (attachments as unknown as Prisma.InputJsonValue) : undefined,
        },
        select: complaintSelect,
      });
    });

    const phone = order.vendor.owner.phone;
    if (phone) {
      await this.notifications.notifySms(
        phone,
        `Dhoblio: a customer raised a complaint (${complaint.subject}) on order ${order.orderNo}. Open the vendor panel to reply.`,
        requestId,
      );
    }
    return this.view(complaint);
  }

  async listForCustomer(customerId: string, orderId: string, query: ListComplaintsQueryDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (!order || order.customerId !== customerId) throw this.notFound();
    return this.list({ ...query, customerId, orderId });
  }

  async customerDetail(customerId: string, orderId: string, id: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, orderId, customerId },
      select: complaintSelect,
    });
    if (!complaint) throw this.notFound();
    return this.view(complaint, true);
  }

  async customerMessage(customerId: string, orderId: string, id: string, body: string, requestId?: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, orderId, customerId },
      select: { id: true, status: true, vendor: { select: { ownerId: true } } },
    });
    if (!complaint) throw this.notFound();
    this.assertOpen(complaint.status);
    await this.addMessage(id, customerId, Role.CUSTOMER, body.trim());
    const owner = await this.prisma.user.findUnique({ where: { id: complaint.vendor.ownerId }, select: { phone: true } });
    if (owner?.phone) {
      await this.notifications.notifySms(owner.phone, 'Dhoblio: the customer added a message to a complaint.', requestId);
    }
    return this.view(await this.findForView(id), true);
  }

  async listForVendor(vendorId: string, query: ListComplaintsQueryDto) {
    return this.list({ ...query, vendorId });
  }

  async vendorDetail(vendorId: string, id: string) {
    const complaint = await this.prisma.complaint.findFirst({ where: { id, vendorId }, select: complaintSelect });
    if (!complaint) throw this.notFound();
    return this.view(complaint, true);
  }

  /** A vendor reply moves an OPEN complaint to VENDOR_RESPONDED; admin follow-ups keep it in review. */
  async vendorReply(vendorId: string, id: string, authorId: string, body: string, requestId?: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, vendorId },
      select: { id: true, status: true, customerId: true, order: { select: { orderNo: true } } },
    });
    if (!complaint) throw this.notFound();
    this.assertOpen(complaint.status);

    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.complaint.updateMany({
        where: { id, status: { in: [...OPEN_STATUSES] } },
        data: { ...(complaint.status === ComplaintStatus.OPEN ? { status: ComplaintStatus.VENDOR_RESPONDED } : {}) },
      });
      if (changed.count !== 1) throw this.closed();
      await tx.complaintMessage.create({ data: { complaintId: id, authorId, authorRole: Role.VENDOR_OWNER, body } });
    });

    const customer = await this.prisma.user.findUnique({ where: { id: complaint.customerId }, select: { phone: true } });
    if (customer?.phone) {
      await this.notifications.notifySms(
        customer.phone,
        `Dhoblio: the vendor replied to your complaint on order ${complaint.order.orderNo}.`,
        requestId,
      );
    }
    return this.view(await this.findForView(id), true);
  }

  async listForAdmin(query: ListComplaintsQueryDto) {
    return this.list(query);
  }

  async adminDetail(id: string) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id }, select: complaintSelect });
    if (!complaint) throw this.notFound();
    return this.view(complaint, true);
  }

  /** Assigns the complaint to an admin (defaults to the caller) and starts the review clock. */
  async assign(id: string, callerId: string, dto: AssignComplaintDto) {
    const admin = await this.prisma.user.findFirst({
      where: { id: dto.adminId ?? callerId, role: Role.ADMIN },
      select: { id: true },
    });
    if (!admin) throw new AppException('ADMIN_NOT_FOUND', 'That admin does not exist.', HttpStatus.BAD_REQUEST);

    const complaint = await this.prisma.complaint.findUnique({ where: { id }, select: { status: true } });
    if (!complaint) throw this.notFound();
    this.assertOpen(complaint.status);

    await this.prisma.complaint.updateMany({
      where: { id, status: { in: [...OPEN_STATUSES] } },
      data: { assignedToId: admin.id, status: ComplaintStatus.IN_REVIEW },
    });
    return this.view(await this.findForView(id), true);
  }

  async adminMessage(id: string, adminId: string, body: string) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id }, select: { status: true } });
    if (!complaint) throw this.notFound();
    this.assertOpen(complaint.status);
    await this.addMessage(id, adminId, Role.ADMIN, body.trim());
    return this.view(await this.findForView(id), true);
  }

  /**
   * REFUND calls the online-payment refund path (COD refunds are settled manually); REDO adds a fresh pair of
   * delivery jobs on the same delivered order; REJECT closes it with no further work.
   */
  async resolve(id: string, adminId: string, dto: ResolveComplaintDto, requestId?: string) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        customerId: true,
        status: true,
        order: { select: { orderNo: true, paymentMethod: true } },
      },
    });
    if (!complaint) throw this.notFound();
    this.assertOpen(complaint.status);

    let refunded = 0;
    let redoJobIds: string[] = [];
    if (dto.outcome === 'REFUND') {
      const paidOnline = await this.prisma.payment.count({
        where: { orderId: complaint.orderId, status: PaymentStatus.PAID, gateway: { not: 'cod' } },
      });
      if (paidOnline > 0) {
        refunded = (await this.payments.refundOrder(complaint.orderId, dto.note ?? 'Complaint refund')).refunded;
      } else if (complaint.order.paymentMethod !== PaymentMethod.COD) {
        throw new AppException('COMPLAINT_NOT_REFUNDABLE', 'No refundable online payment exists for this order.', HttpStatus.CONFLICT);
      }
    } else if (dto.outcome === 'REDO') {
      const jobs = await this.delivery.createRedoJobs(complaint.orderId, adminId, requestId);
      redoJobIds = jobs.map((job) => job.id);
    }

    const status = dto.outcome === 'REJECT' ? ComplaintStatus.REJECTED : ComplaintStatus.RESOLVED;
    const resolution = `${dto.outcome}${dto.note ? `: ${dto.note}` : ''}`;
    const closed = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.complaint.updateMany({
        where: { id, status: { in: [...OPEN_STATUSES] } },
        data: { status, resolution, resolvedAt: new Date(), assignedToId: complaint.status === ComplaintStatus.OPEN ? adminId : undefined },
      });
      if (changed.count !== 1) throw this.closed();
      if (dto.note) {
        await tx.complaintMessage.create({
          data: { complaintId: id, authorId: adminId, authorRole: Role.ADMIN, body: `Resolution: ${dto.note}` },
        });
      }
      return true;
    });

    const customer = await this.prisma.user.findUnique({ where: { id: complaint.customerId }, select: { phone: true } });
    if (closed && customer?.phone) {
      const label = dto.outcome === 'REFUND' ? 'refunded' : dto.outcome === 'REDO' ? 'scheduled for a redo' : 'reviewed';
      await this.notifications.notifySms(
        customer.phone,
        `Dhoblio: your complaint on order ${complaint.order.orderNo} has been ${label}.`,
        requestId,
      );
    }
    return { ...(await this.adminDetail(id)), refunded, redoJobIds };
  }

  private async list(query: ListComplaintsQueryDto & { customerId?: string; orderId?: string }) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.complaint.findMany({
      where: {
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.vendorId ? { vendorId: query.vendorId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...beforeCursor(query.cursor),
      },
      select: complaintSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return { items: await Promise.all(items.map((row) => this.view(row))), nextCursor };
  }

  private async findForView(id: string) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id }, select: complaintSelect });
    if (!complaint) throw this.notFound();
    return complaint;
  }

  private async addMessage(complaintId: string, authorId: string, authorRole: Role, body: string) {
    await this.prisma.$transaction(async (tx) => {
      const live = await tx.complaint.updateMany({
        where: { id: complaintId, status: { in: [...OPEN_STATUSES] } },
        data: { updatedAt: new Date() },
      });
      if (live.count !== 1) throw this.closed();
      await tx.complaintMessage.create({ data: { complaintId, authorId, authorRole, body } });
    });
  }

  private async view(
    complaint: Prisma.ComplaintGetPayload<{ select: typeof complaintSelect }>,
    includeThread = false,
  ) {
    const attachments = this.attachments(complaint.attachments);
    if (!includeThread) return { ...complaint, attachments };

    const [messages, customer, assignedTo] = await Promise.all([
      this.prisma.complaintMessage.findMany({
        where: { complaintId: complaint.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, authorId: true, authorRole: true, body: true, createdAt: true, author: { select: { name: true } } },
      }),
      this.prisma.user.findUnique({ where: { id: complaint.customerId }, select: { name: true, phone: true } }),
      complaint.assignedToId
        ? this.prisma.user.findUnique({ where: { id: complaint.assignedToId }, select: { name: true } })
        : Promise.resolve(null),
    ]);
    return {
      ...complaint,
      attachments,
      customer,
      assignedTo,
      messages: messages.map(({ author, ...message }) => ({ ...message, authorName: author.name })),
    };
  }

  private attachments(value: Prisma.JsonValue | null): (Attachment & { signedUrl: string | null })[] {
    if (!Array.isArray(value)) return [];
    return value.map((raw) => {
      const item = raw as unknown as Attachment;
      return { ...item, signedUrl: this.signedUrl(item) };
    });
  }

  private signedUrl(item: Attachment): string | null {
    try {
      return this.cloudinary.privateDownloadUrl(item.publicId, item.format, ACTIVE_ATTACHMENT_TTL_SEC);
    } catch {
      return null;
    }
  }

  private async verifyAttachments(customerId: string, publicIds: string[]): Promise<Attachment[]> {
    if (!publicIds.length) return [];
    if (new Set(publicIds).size !== publicIds.length) {
      throw new AppException('INVALID_ATTACHMENTS', 'The same photo was listed twice.', HttpStatus.BAD_REQUEST);
    }
    const folder = uploadFolder(this.config.get('NODE_ENV', { infer: true }), 'complaint', customerId, this.cloudinary.folderRoot);
    const verified = await Promise.all(publicIds.map((publicId) => this.cloudinary.verifyAsset(publicId, folder, 'authenticated')));
    return verified.map((asset) => ({ publicId: asset.publicId, url: asset.url, format: asset.format }));
  }

  private assertOpen(status: ComplaintStatus) {
    if (!OPEN_STATUSES.includes(status as (typeof OPEN_STATUSES)[number])) throw this.closed();
  }

  private closed() {
    return new AppException('COMPLAINT_CLOSED', 'This complaint is already closed.', HttpStatus.CONFLICT);
  }

  private notFound() {
    return new AppException(ErrorCode.NOT_FOUND, 'Complaint not found.', HttpStatus.NOT_FOUND);
  }
}
