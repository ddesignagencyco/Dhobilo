import { Body, Controller, Param, ParseIntPipe, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateCityDto } from '../cities/dto/cities.dto';
import { CitiesService } from '../cities/cities.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/cities')
export class AdminCitiesController {
  constructor(private readonly cities: CitiesService) {}

  /** Delivery fee, active flag and order-number code for a city. */
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCityDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.cities.adminUpdate(id, dto, { admin, ip: req.ip, requestId: req.id });
  }
}
