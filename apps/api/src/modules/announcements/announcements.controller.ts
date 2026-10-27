import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminAreaOnly } from '../../common/decorators/admin-area.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { Audit } from '../audit/audit.decorator';
import { CreateAnnouncementDto, ListAnnouncementsQueryDto, PreviewAnnouncementDto } from './announcements.dto';
import { AnnouncementsService } from './announcements.service';

@ApiTags('admin-announcements')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@AdminAreaOnly('announcements')
@Controller('admin/announcements')
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  /** How many people an audience reaches, before anything is sent. */
  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: PreviewAnnouncementDto) {
    return this.announcements.preview(dto);
  }

  /** Sends to everyone in the audience, spread over time. Pass the preview's `recipients` as `confirmRecipients`. */
  @Post()
  @HttpCode(202)
  @Audit({ action: 'ANNOUNCEMENT_SENT', entity: 'Announcement' })
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() admin: AuthUser) {
    return this.announcements.create(dto, admin.id);
  }

  @Get()
  async list(@Query() q: ListAnnouncementsQueryDto) {
    const { items, nextCursor } = await this.announcements.list(q);
    return new Paged(items, { nextCursor });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.get(id);
  }
}
