import { Module } from '@nestjs/common';
import { FinanceModule } from './finance.module';
import { FinanceProcessor } from './finance.processor';

@Module({
  imports: [FinanceModule],
  providers: [FinanceProcessor],
})
export class FinanceWorkerModule {}
