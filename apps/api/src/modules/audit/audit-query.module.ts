import { Module } from '@nestjs/common';
import { AdminAuditController } from './audit-query.controller';
import { AuditQueryService } from './audit-query.service';

/** API only: the admin-facing read side of the audit trail. */
@Module({ controllers: [AdminAuditController], providers: [AuditQueryService] })
export class AuditQueryModule {}
