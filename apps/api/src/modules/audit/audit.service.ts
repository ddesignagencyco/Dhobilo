import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId: string;
  actorId?: string | null;
  actorRole?: Role | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
  requestId?: string | null;
}

/** Append-only writer for AuditLog (the table is also guarded by DB triggers). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(entry: AuditEntry, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return tx.auditLog.create({
      data: {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        before: entry.before,
        after: entry.after,
        ip: entry.ip ?? null,
        requestId: entry.requestId ?? null,
      },
    });
  }

  /** For the interceptor: the action already happened, so an audit failure is logged loudly, not rethrown. */
  async recordSafely(entry: AuditEntry): Promise<void> {
    try {
      await this.record(entry);
    } catch (err) {
      this.logger.error({ err, action: entry.action, entityId: entry.entityId }, 'Failed to write audit log');
    }
  }
}
