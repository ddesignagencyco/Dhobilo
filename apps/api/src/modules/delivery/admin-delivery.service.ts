import { HttpStatus, Injectable } from '@nestjs/common';
import { JobStatus, Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, afterCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListJobsQueryDto } from './dto/rider.dto';
import { jobInclude, toAdminJobView } from './job-view';

/** The ops side of delivery: the dispatch board, courier partners. (Moves on jobs live in DeliveryJobsService.) */
@Injectable()
export class AdminDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Oldest first, so the jobs that have waited longest are at the top. */
  async list(q: ListJobsQueryDto) {
    const limit = Math.min(q.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const rows = await this.prisma.deliveryJob.findMany({
      where: {
        ...(q.status?.length ? { status: { in: q.status } } : {}),
        ...(q.jobType ? { jobType: q.jobType } : {}),
        ...(q.riderId ? { riderId: q.riderId } : {}),
        ...(q.scheduledBefore ? { scheduledStart: { lte: new Date(q.scheduledBefore) } } : {}),
        ...(q.cityId || q.orderNo
          ? { order: { ...(q.cityId ? { cityId: q.cityId } : {}), ...(q.orderNo ? { orderNo: { contains: q.orderNo, mode: 'insensitive' as const } } : {}) } }
          : {}),
        ...afterCursor(q.cursor),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: jobInclude,
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return { items: items.map(toAdminJobView), nextCursor };
  }

  async detail(id: string) {
    const job = await this.prisma.deliveryJob.findUnique({
      where: { id },
      include: { ...jobInclude, partner: { select: { id: true, code: true, name: true } } },
    });
    if (!job) throw new AppException(ErrorCode.NOT_FOUND, 'Delivery job not found.', HttpStatus.NOT_FOUND);
    const { partner, ...row } = job;
    return { ...toAdminJobView(row), partner, proofPhotoUrl: job.proofPhotoUrl, declinedRiderIds: job.declinedRiderIds };
  }

  /** The numbers at the top of the dispatch board. */
  async summary(cityId?: number) {
    const city: Prisma.DeliveryJobWhereInput = cityId ? { order: { cityId } } : {};
    const [byStatus, alerted, online] = await Promise.all([
      this.prisma.deliveryJob.groupBy({ by: ['status'], where: city, _count: { _all: true } }),
      this.prisma.deliveryJob.count({ where: { ...city, status: JobStatus.UNASSIGNED, unassignedAlertedAt: { not: null } } }),
      this.prisma.rider.count({ where: { status: 'APPROVED', isOnline: true, ...(cityId ? { cityId } : {}) } }),
    ]);
    const counts = Object.fromEntries(Object.values(JobStatus).map((s) => [s, byStatus.find((b) => b.status === s)?._count._all ?? 0]));
    return { jobs: counts, needAttention: alerted + (counts[JobStatus.FAILED] ?? 0), onlineRiders: online };
  }

  async partners() {
    const rows = await this.prisma.courierPartner.findMany({ orderBy: { code: 'asc' }, include: { cities: { select: { id: true, name: true } } } });
    return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, isActive: p.isActive, cities: p.cities }));
  }

  async setPartnerActive(id: string, isActive: boolean, admin: AuthUser, requestId?: string) {
    const before = await this.prisma.courierPartner.findUnique({ where: { id } });
    if (!before) throw new AppException(ErrorCode.NOT_FOUND, 'Courier partner not found.', HttpStatus.NOT_FOUND);
    const partner = await this.prisma.courierPartner.update({ where: { id }, data: { isActive } });
    await this.audit.record({
      action: 'COURIER_PARTNER_TOGGLED',
      entity: 'CourierPartner',
      entityId: id,
      actorId: admin.id,
      actorRole: Role.ADMIN,
      before: { isActive: before.isActive },
      after: { isActive },
      requestId,
    });
    return { id: partner.id, code: partner.code, name: partner.name, isActive: partner.isActive };
  }
}
