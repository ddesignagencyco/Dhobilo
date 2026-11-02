import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Body, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AdminAreaOnly } from '../../common/decorators/admin-area.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged, RawResponse } from '../../common/interceptors/response-envelope.interceptor';
import { Audit } from '../audit/audit.decorator';
import { CreateReportDto, DownloadQueryDto, ListReportsQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('admin-reports')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@AdminAreaOnly('reports')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Starts building a report in the background. Poll `GET /admin/reports/{id}` until `status` is `READY`. */
  @Post()
  @HttpCode(202)
  @Audit({ action: 'REPORT_REQUESTED', entity: 'Report' })
  create(@Body() dto: CreateReportDto, @CurrentUser() admin: AuthUser) {
    return this.reports.create(dto, admin.id);
  }

  @Get()
  async list(@Query() q: ListReportsQueryDto, @CurrentUser() admin: AuthUser) {
    const { items, nextCursor } = await this.reports.list(q, admin.id);
    return new Paged(items, { nextCursor });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.reports.get(id, admin.id);
  }
}

@ApiTags('admin-reports')
@Public()
@Controller('reports')
export class ReportDownloadController {
  constructor(private readonly reports: ReportsService) {}

  /** The file itself. The link comes from `GET /admin/reports/{id}` and stops working after 10 minutes; no sign-in is needed. */
  @Get(':id/download')
  @RawResponse()
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async download(@Param('id', ParseUUIDPipe) id: string, @Query() q: DownloadQueryDto, @Res({ passthrough: true }) res: Response) {
    const file = await this.reports.download(id, q.exp, q.sig);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(file.data);
  }
}
