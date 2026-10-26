import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { ComplaintsService } from './complaints.service';
import { ComplaintMessageDto, CreateComplaintDto, ListComplaintsQueryDto } from './dto/complaints.dto';

@ApiTags('complaints')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('orders/:orderId/complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateComplaintDto,
    @Req() req: AuthedRequest,
  ) {
    return this.complaints.create(user.id, orderId, dto, req.id);
  }

  @Get()
  async list(
    @CurrentUser() user: { id: string },
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query() query: ListComplaintsQueryDto,
  ) {
    const { items, nextCursor } = await this.complaints.listForCustomer(user.id, orderId, query);
    return new Paged(items, { nextCursor });
  }

  @Get(':id')
  detail(
    @CurrentUser() user: { id: string },
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.complaints.customerDetail(user.id, orderId, id);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: { id: string },
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ComplaintMessageDto,
    @Req() req: AuthedRequest,
  ) {
    return this.complaints.customerMessage(user.id, orderId, id, dto.body, req.id);
  }
}
