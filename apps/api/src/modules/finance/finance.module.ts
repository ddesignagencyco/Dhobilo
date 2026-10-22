import { Module } from '@nestjs/common';
import { CommissionService } from './commission.service';

/** Money rules. Phase 3 only needs commission resolution; ledger, payouts and COD settlement arrive in Phase 6. */
@Module({
  providers: [CommissionService],
  exports: [CommissionService],
})
export class FinanceModule {}
