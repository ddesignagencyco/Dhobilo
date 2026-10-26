import { Body, Controller, Get, HttpCode, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, VendorStatus } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import type { AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RegisterVendorDto, SetAvailabilityDto, SetHoursDto, UpdateVendorProfileDto } from './dto/vendor.dto';
import { CurrentVendor, RequireVendorStatus } from './vendor-context';
import type { VendorContext } from './vendor-context';
import { VendorContextGuard } from './vendor-context.guard';
import { VendorProfileService } from './vendor-profile.service';
import { VendorRegistrationService } from './vendor-registration.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';

@ApiTags('vendor')
@ApiBearerAuth()
@Controller('vendor')
export class VendorController {
  constructor(
    private readonly registration: VendorRegistrationService,
    private readonly profile: VendorProfileService,
  ) {}

  /**
   * Apply to join as a vendor. Upload the CNIC and shop photos first (POST /media/sign), then send their
   * public ids here. The account stays PENDING until an admin approves it. A rejected vendor re-submits here.
   */
  @RateLimit({ name: 'vendor-register', limit: 5, windowSec: 86400 })
  @Post('register')
  @Roles(Role.VENDOR_OWNER)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterVendorDto, @Req() req: AuthedRequest) {
    return this.registration.register(user, dto, { ip: req.ip, requestId: req.id });
  }

  /** Own profile and review status (works while PENDING / REJECTED / SUSPENDED too). */
  @Get('profile')
  @Roles(Role.VENDOR_OWNER, Role.VENDOR_STAFF)
  @UseGuards(VendorContextGuard)
  getProfile(@CurrentVendor() vendor: VendorContext) {
    return this.profile.getProfile(vendor.id);
  }

  @Patch('profile')
  @Roles(Role.VENDOR_OWNER)
  @RequireVendorStatus(VendorStatus.APPROVED)
  @UseGuards(VendorContextGuard)
  updateProfile(@CurrentVendor() vendor: VendorContext, @Body() dto: UpdateVendorProfileDto) {
    return this.profile.updateProfile(vendor.id, dto);
  }

  @Get('hours')
  @Roles(Role.VENDOR_OWNER, Role.VENDOR_STAFF)
  @RequireVendorStatus(VendorStatus.APPROVED)
  @UseGuards(VendorContextGuard)
  getHours(@CurrentVendor() vendor: VendorContext) {
    return this.profile.getHours(vendor.id);
  }

  /** Replace the weekly opening hours. Minutes from midnight; days left out are closed. */
  @Put('hours')
  @Roles(Role.VENDOR_OWNER)
  @RequireVendorStatus(VendorStatus.APPROVED)
  @UseGuards(VendorContextGuard)
  setHours(@CurrentVendor() vendor: VendorContext, @Body() dto: SetHoursDto) {
    return this.profile.setHours(vendor.id, dto.hours);
  }

  /** Quick Open / Closed / Busy switch; staff may use it too. */
  @Patch('availability')
  @HttpCode(200)
  @Roles(Role.VENDOR_OWNER, Role.VENDOR_STAFF)
  @RequireVendorStatus(VendorStatus.APPROVED)
  @UseGuards(VendorContextGuard)
  setAvailability(@CurrentVendor() vendor: VendorContext, @Body() dto: SetAvailabilityDto) {
    return this.profile.setAvailability(vendor.id, dto.availability);
  }
}
