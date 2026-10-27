import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { AdminAreaOnly } from '../../common/decorators/admin-area.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminUsersService } from './admin-users.service';
import { ChangeOwnPasswordDto, CreateAdminDto, UpdateAdminDto } from './dto/admin-users.dto';

/** Managing other admins is super-admin only (no @AdminAreaOnly, so it fails closed). */
@ApiTags('admin-users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/admins')
export class AdminUsersController {
  constructor(private readonly admins: AdminUsersService) {}

  @Get()
  list() {
    return this.admins.list();
  }

  /** Create an admin with a sub-role: SUPER_ADMIN, OPERATIONS, FINANCE or SUPPORT. */
  @Post()
  create(@Body() dto: CreateAdminDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.admins.create(dto, { admin, ip: req.ip, requestId: req.id });
  }

  /** Change an admin's role, or deactivate / reactivate them. You cannot change yourself, and the last super admin is protected. */
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.admins.update(id, dto, { admin, ip: req.ip, requestId: req.id });
  }
}

@ApiTags('admin-users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@AdminAreaOnly('self')
@Controller('admin/me')
export class AdminSelfController {
  constructor(private readonly admins: AdminUsersService) {}

  /** Change your own password. Signs you out of every device. */
  @Post('password')
  @HttpCode(200)
  async changePassword(@Body() dto: ChangeOwnPasswordDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    await this.admins.changeOwnPassword(dto, { admin, ip: req.ip, requestId: req.id });
  }
}
