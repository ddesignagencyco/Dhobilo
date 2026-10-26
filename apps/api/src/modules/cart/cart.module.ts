import { Module } from '@nestjs/common';
import { PromotionsModule } from '../promos/promotions.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { PricingService } from './pricing.service';

@Module({
  imports: [PromotionsModule],
  controllers: [CartController],
  providers: [CartService, PricingService],
  exports: [PricingService, CartService],
})
export class CartModule {}
