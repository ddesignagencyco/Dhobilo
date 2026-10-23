import { Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { CodService } from './cod.service';
import { CommissionAdminService } from './commission-admin.service';
import { CommissionService } from './commission.service';
import { EarningsPosterService } from './earnings-poster.service';
import { EarningsService } from './earnings.service';
import { FinanceScheduler } from './finance.scheduler';
import { LedgerService } from './ledger.service';
import { PayoutsService } from './payouts.service';

/**
 * Money: commission rules, the vendor ledger, cash-on-delivery settlement, earnings, payouts. Imported wherever money
 * moves (orders, delivery, payments, the API's finance endpoints, and the worker).
 */
@Module({
  imports: [CryptoModule],
  providers: [CommissionService, LedgerService, CodService, EarningsService, PayoutsService, CommissionAdminService, EarningsPosterService, FinanceScheduler],
  exports: [CommissionService, LedgerService, CodService, EarningsService, PayoutsService, CommissionAdminService, EarningsPosterService],
})
export class FinanceModule {}
