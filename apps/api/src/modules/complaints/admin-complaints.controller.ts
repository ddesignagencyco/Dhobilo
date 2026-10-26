import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { Audit } from '../audit/audit.decorator';
import { ComplaintsService } from './complaints.service';
import {
  AssignComplaintDto,
  ComplaintMessageDto,
  ListComplaintsQueryDto,
  ResolveComplaintDto,
} from './dto/complaints.dto';

@ApiTags('admin-complaints')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/complaints')
export class AdminComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  async list(@Query() query: ListComplaintsQueryDto) {
    const { items, nextCursor } = await this.complaints.listForAdmin(query);
    return new Paged(items, { nextCursor });
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.complaints.adminDetail(id);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @Audit({ action: 'COMPLAINT_ASSIGNED', entity: 'Complaint', idParam: 'id' })
  assign(@CurrentUser() admin: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignComplaintDto) {
    return this.complaints.assign(id, admin.id, dto);
  }

  @Post(':id/messages')
  message(
    @CurrentUser() admin: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ComplaintMessageDto,
  ) {
    return this.complaints.adminMessage(id, admin.id, dto.body);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @Audit({ action: 'COMPLAINT_RESOLVED', entity: 'Complaint', idParam: 'id' })
  resolve(
    @CurrentUser() admin: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveComplaintDto,
    @Req() req: AuthedRequest,
  ) {
    return this.complaints.resolve(id, admin.id, dto, req.id);
  }
}
