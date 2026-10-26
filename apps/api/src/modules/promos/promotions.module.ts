import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { ReferralsService } from './referrals.service';

/** Service-only module: cart/checkout/auth/admin import it without pulling HTTP routes or creating a cycle. */
@Module({
  providers: [PromotionsService, ReferralsService],
  exports: [PromotionsService, ReferralsService],
})
export class PromotionsModule {}
