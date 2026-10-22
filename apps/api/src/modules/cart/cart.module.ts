import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { PricingService } from './pricing.service';

@Module({
  controllers: [CartController],
  providers: [CartService, PricingService],
  exports: [PricingService, CartService],
})
export class CartModule {}
