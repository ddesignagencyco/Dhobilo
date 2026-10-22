import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { VendorReviewService } from '../vendors/vendor-review.service';
import { ListVendorsQueryDto, ReasonDto } from './dto/admin-vendors.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/vendors')
export class AdminVendorsController {
  constructor(private readonly review: VendorReviewService) {}

  /** Review queue, oldest first. Filter by status, city or business name; page with `meta.nextCursor`. */
  @Get()
  async list(@Query() query: ListVendorsQueryDto) {
    const { items, nextCursor } = await this.review.list(query);
    return new Paged(items, { nextCursor });
  }

  /** Vendor detail with owner, masked CNIC and short-lived signed document links. */
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.review.detail(id);
  }

  /** Plaintext CNIC. Each call is written to the audit log. */
  @Get(':id/cnic')
  revealCnic(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.review.revealCnic(id, this.ctx(admin, req));
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.review.approve(id, this.ctx(admin, req));
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.review.reject(id, dto.reason, this.ctx(admin, req));
  }

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.review.suspend(id, dto.reason, this.ctx(admin, req));
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.review.reactivate(id, this.ctx(admin, req));
  }

  private ctx(admin: AuthUser, req: AuthedRequest) {
    return { admin, ip: req.ip, requestId: req.id };
  }
}
