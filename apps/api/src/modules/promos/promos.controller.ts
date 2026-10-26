import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CartService } from '../cart/cart.service';
import { ValidatePromoDto } from './dto/promos.dto';

@ApiTags('promos')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('promos')
export class PromosController {
  constructor(private readonly cart: CartService) {}

  /** Prices a code against the current items. The same rules run again at checkout. */
  @Post('validate')
  @HttpCode(200)
  validate(@CurrentUser() user: AuthUser, @Body() dto: ValidatePromoDto) {
    return this.cart.estimate(user.id, { vendorId: dto.vendorId, items: dto.items, promoCode: dto.code });
  }
}
