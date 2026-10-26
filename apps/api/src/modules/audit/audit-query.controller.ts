import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { ListAuditLogsQueryDto } from './audit-query.dto';
import { AuditQueryService } from './audit-query.service';

@ApiTags('admin-audit')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly audit: AuditQueryService) {}

  /** Who did what to which record, newest first. Combine filters to answer "what happened to this payout?" or "what did this admin do?". */
  @Get()
  async list(@Query() q: ListAuditLogsQueryDto) {
    const { items, nextCursor } = await this.audit.list(q);
    return new Paged(items, { nextCursor });
  }
}
