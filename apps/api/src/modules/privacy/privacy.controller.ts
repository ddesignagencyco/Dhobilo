import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { AdminAreaOnly } from '../../common/decorators/admin-area.decorator';
import { AllowPendingDeletion } from '../../common/decorators/allow-pending-deletion.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { AccountDeletionService } from './account-deletion.service';
import { DataExportService } from './data-export.service';
import { LegalHoldDto, ListDeletionRequestsQueryDto, RequestDeletionDto } from './dto/privacy.dto';

/** The signed-in person's own privacy rights: delete my account, give me my data. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class PrivacyController {
  constructor(
    private readonly deletion: AccountDeletionService,
    private readonly exporter: DataExportService,
  ) {}

  /** Ask for the account to be deleted after the grace period. Needs a fresh phone code. Everyone is signed out. */
  @Post('delete-request')
  @HttpCode(202)
  @RateLimit({ name: 'delete-request', limit: 5, windowSec: 3600, by: 'user' })
  request(@CurrentUser() user: AuthUser, @Body() dto: RequestDeletionDto, @Req() req: AuthedRequest) {
    return this.deletion.request(user, dto, { ip: req.ip, requestId: req.id });
  }

  /** Where the request stands. Also works while the account is scheduled for deletion. */
  @Get('delete-request')
  @AllowPendingDeletion()
  status(@CurrentUser() user: AuthUser) {
    return this.deletion.status(user.id);
  }

  /** Changed your mind? Keeps the account (works until the data has actually been removed). */
  @Delete('delete-request')
  @AllowPendingDeletion()
  @RateLimit({ name: 'delete-cancel', limit: 10, windowSec: 3600, by: 'user' })
  cancel(@CurrentUser() user: AuthUser, @Req() req: AuthedRequest) {
    return this.deletion.cancel(user.id, { ip: req.ip, requestId: req.id });
  }

  /** Everything we hold about you, as JSON. */
  @Get('export')
  @RateLimit({ name: 'data-export', limit: 3, windowSec: 3600, by: 'user' })
  export(@CurrentUser() user: AuthUser, @Req() req: AuthedRequest) {
    return this.exporter.export(user, { ip: req.ip, requestId: req.id });
  }
}

/** Support/admin view of deletion requests and legal holds. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@AdminAreaOnly('privacy')
@Controller('admin')
export class PrivacyAdminController {
  constructor(private readonly deletion: AccountDeletionService) {}

  /** Newest first. Shows role, masked phone and status; never names or addresses. */
  @Get('deletion-requests')
  async list(@Query() query: ListDeletionRequestsQueryDto) {
    const { items, nextCursor } = await this.deletion.list(query);
    return new Paged(items, { nextCursor });
  }

  /** Freeze a person's data (dispute, investigation, legal request). Deletion and clean-up skip them until released. */
  @Put('users/:id/legal-hold')
  setHold(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LegalHoldDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.deletion.setLegalHold(admin, id, dto.reason, { ip: req.ip, requestId: req.id });
  }

  @Delete('users/:id/legal-hold')
  clearHold(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.deletion.clearLegalHold(admin, id, { ip: req.ip, requestId: req.id });
  }
}
