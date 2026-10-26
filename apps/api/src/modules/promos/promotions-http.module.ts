import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { AdminPromosController } from './admin-promos.controller';
import { PromosController } from './promos.controller';
import { PromotionsModule } from './promotions.module';
import { ReferralController } from './referral.controller';

@Module({
  imports: [PromotionsModule, CartModule],
  controllers: [PromosController, ReferralController, AdminPromosController],
})
export class PromotionsHttpModule {}
