import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../audit/audit.decorator';
import { CreatePromoDto, ListPromosQueryDto, UpdatePromoDto } from './dto/promos.dto';
import { PromotionsService } from './promotions.service';

@ApiTags('admin-promos')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/promos')
export class AdminPromosController {
  constructor(private readonly promos: PromotionsService) {}

  @Get()
  async list(@Query() q: ListPromosQueryDto) {
    const { items, nextCursor } = await this.promos.list(q);
    return new Paged(items, { nextCursor });
  }

  @Post()
  @Audit({ action: 'PROMO_CREATED', entity: 'PromoCode' })
  create(@Body() dto: CreatePromoDto) {
    return this.promos.create(dto);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.promos.detail(id);
  }

  @Patch(':id')
  @Audit({ action: 'PROMO_UPDATED', entity: 'PromoCode', idParam: 'id' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromoDto) {
    return this.promos.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Audit({ action: 'PROMO_DELETED', entity: 'PromoCode', idParam: 'id' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.promos.remove(id);
  }
}
