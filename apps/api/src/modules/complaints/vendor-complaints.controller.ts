import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, VendorStatus } from '@prisma/client';
import type { AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { CurrentVendor, RequireVendorStatus } from '../vendors/vendor-context';
import type { VendorContext } from '../vendors/vendor-context';
import { VendorContextGuard } from '../vendors/vendor-context.guard';
import { ComplaintsService } from './complaints.service';
import { ComplaintMessageDto, ListComplaintsQueryDto } from './dto/complaints.dto';

@ApiTags('vendor-complaints')
@ApiBearerAuth()
@Roles(Role.VENDOR_OWNER, Role.VENDOR_STAFF)
@UseGuards(VendorContextGuard)
@Controller('vendor/complaints')
export class VendorComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @RequireVendorStatus(VendorStatus.APPROVED, VendorStatus.SUSPENDED)
  async list(@CurrentVendor() vendor: VendorContext, @Query() query: ListComplaintsQueryDto) {
    const { items, nextCursor } = await this.complaints.listForVendor(vendor.id, query);
    return new Paged(items, { nextCursor });
  }

  @Get(':id')
  @RequireVendorStatus(VendorStatus.APPROVED, VendorStatus.SUSPENDED)
  detail(@CurrentVendor() vendor: VendorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.complaints.vendorDetail(vendor.id, id);
  }

  @Post(':id/reply')
  @RequireVendorStatus(VendorStatus.APPROVED, VendorStatus.SUSPENDED)
  reply(
    @CurrentUser() user: { id: string },
    @CurrentVendor() vendor: VendorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ComplaintMessageDto,
    @Req() req: AuthedRequest,
  ) {
    return this.complaints.vendorReply(vendor.id, id, user.id, dto.body, req.id);
  }
}
