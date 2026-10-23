import { Module } from '@nestjs/common';
import { FinanceBootstrap, FinanceProcessor } from './finance.processor';
import { FinanceModule } from './finance.module';

/** The finance queue consumer: posts earnings for delivered, paid orders. */
@Module({ imports: [FinanceModule], providers: [FinanceProcessor], exports: [FinanceProcessor] })
export class FinanceWorkerModule {}

export { FinanceBootstrap };
