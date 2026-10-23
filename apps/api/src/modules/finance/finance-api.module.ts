import { Module } from '@nestjs/common';
import { FinanceModule } from './finance.module';
import { AdminFinanceController, RiderCodController, VendorFinanceController } from './finance.controller';

/** API side of finance: vendor earnings and payouts, the rider's cash screen, and the admin finance tools. */
@Module({ imports: [FinanceModule], controllers: [VendorFinanceController, RiderCodController, AdminFinanceController] })
export class FinanceApiModule {}
