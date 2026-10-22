import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, VendorStatus } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { InviteStaffDto } from './dto/vendor.dto';
import { CurrentVendor, RequireVendorStatus } from './vendor-context';
import type { VendorContext } from './vendor-context';
import { VendorContextGuard } from './vendor-context.guard';
import { VendorStaffService } from './vendor-staff.service';

@ApiTags('vendor')
@ApiBearerAuth()
@Roles(Role.VENDOR_OWNER)
@RequireVendorStatus(VendorStatus.APPROVED)
@UseGuards(VendorContextGuard)
@Controller('vendor/staff')
export class VendorStaffController {
  constructor(private readonly staff: VendorStaffService) {}

  @Get()
  list(@CurrentVendor() vendor: VendorContext) {
    return this.staff.list(vendor.id);
  }

  /** Invite a staff member by phone number; they sign in with an SMS code. */
  @Post()
  invite(@CurrentVendor() vendor: VendorContext, @Body() dto: InviteStaffDto) {
    return this.staff.invite(vendor.id, dto);
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(@CurrentVendor() vendor: VendorContext, @Param('userId', ParseUUIDPipe) userId: string) {
    await this.staff.remove(vendor.id, userId);
  }
}
