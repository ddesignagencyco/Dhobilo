import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { CodService } from './cod.service';
import { CommissionRulesService } from './commission-rules.service';
import { CommissionService } from './commission.service';
import { EarningsService } from './earnings.service';
import { FinanceListener } from './finance.listener';
import { LedgerService } from './ledger.service';
import { PayoutsService } from './payouts.service';
import { VendorFinanceController } from './vendor-finance.controller';

/** Money rules and vendor balances shared by checkout, the worker and the admin panel. */
@Module({
  imports: [VendorsModule],
  controllers: [VendorFinanceController],
  providers: [CommissionService, CommissionRulesService, LedgerService, CodService, EarningsService, PayoutsService, FinanceListener],
  exports: [CommissionService, CommissionRulesService, LedgerService, CodService, EarningsService, PayoutsService],
})
export class FinanceModule {}
