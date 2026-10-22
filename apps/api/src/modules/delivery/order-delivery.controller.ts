import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OwnedBy } from '../../common/decorators/owned-by.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrderOwnership } from '../orders/order-ownership';
import { OrderDeliveryService } from './order-delivery.service';

/** The customer's view of delivery for one of their orders. */
@ApiTags('orders')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('orders')
export class OrderDeliveryController {
  constructor(private readonly delivery: OrderDeliveryService) {}

  /** Pickup and delivery legs: status, window, and the rider's name and photo once someone has taken the job. */
  @Get(':id/delivery')
  @OwnedBy(OrderOwnership)
  legs(@Param('id', ParseUUIDPipe) id: string) {
    return this.delivery.legs(id);
  }

  /** Where the rider is right now. 404 unless a rider is on the way to you. */
  @Get(':id/rider-location')
  @OwnedBy(OrderOwnership)
  location(@Param('id', ParseUUIDPipe) id: string) {
    return this.delivery.riderLocation(id);
  }

  /** Send yourself a new delivery code (the old one stops working). At most 3 per hour per order. */
  @Post(':id/delivery-code/resend')
  @HttpCode(200)
  @OwnedBy(OrderOwnership)
  resend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: AuthedRequest) {
    return this.delivery.resendCode(id, user.id, req.id);
  }
}
