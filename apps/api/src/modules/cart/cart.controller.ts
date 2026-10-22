import { Body, Controller, Delete, Get, HttpCode, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CartService } from './cart.service';
import { EstimateDto, SetCartDto } from './dto/cart.dto';

@ApiTags('cart')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  /** The customer's carts, one per vendor (optionally just one with `?vendorId=`). */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('vendorId', new ParseUUIDPipe({ optional: true })) vendorId?: string) {
    return this.cart.list(user.id, vendorId);
  }

  /** Replace the cart for one vendor. Safe to retry. An empty `items` list removes the cart. */
  @Put()
  set(@CurrentUser() user: AuthUser, @Body() dto: SetCartDto) {
    return this.cart.set(user.id, dto);
  }

  /** Remove one cart (`?vendorId=`) or all of them. */
  @Delete()
  @HttpCode(204)
  async clear(@CurrentUser() user: AuthUser, @Query('vendorId', new ParseUUIDPipe({ optional: true })) vendorId?: string) {
    await this.cart.clear(user.id, vendorId);
  }

  /** Instant price: items + delivery fee = total, computed from current prices. */
  @Post('estimate')
  @HttpCode(200)
  estimate(@CurrentUser() user: AuthUser, @Body() dto: EstimateDto) {
    return this.cart.estimate(user.id, dto);
  }
}
