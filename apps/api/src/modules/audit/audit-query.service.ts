import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ListAuditLogsQueryDto } from './audit-query.dto';

/** Read side of the audit trail (SRS §7 Auditability). The table itself is append-only. */
@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListAuditLogsQueryDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    if (from && to && from > to) throw new AppException('INVALID_RANGE', '"from" must not be after "to"', HttpStatus.BAD_REQUEST);
    const limit = q.limit ?? 20;
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.actorRole ? { actorRole: q.actorRole } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...beforeCursor(q.cursor),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { actor: { select: { id: true, name: true, role: true } } },
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return {
      items: items.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        actor: r.actor ? { id: r.actor.id, name: r.actor.name, role: r.actor.role } : null,
        actorRole: r.actorRole,
        before: r.before,
        after: r.after,
        ip: r.ip,
        requestId: r.requestId,
      })),
      nextCursor,
    };
  }
}
