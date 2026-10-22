import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DeviceTokenDto, RemoveDeviceTokenDto, UpdateMeDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  /** Only name and language are editable here. */
  @Patch()
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateProfile(user.id, dto);
  }

  /** Register a push token for this device. */
  @Post('devices')
  @HttpCode(204)
  async registerDevice(@CurrentUser() user: AuthUser, @Body() dto: DeviceTokenDto) {
    await this.users.registerDevice(user.id, dto);
  }

  @Delete('devices')
  @HttpCode(204)
  async removeDevice(@CurrentUser() user: AuthUser, @Body() dto: RemoveDeviceTokenDto) {
    await this.users.removeDevice(user.id, dto.token);
  }
}
