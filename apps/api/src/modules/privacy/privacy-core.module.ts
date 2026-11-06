import { Module } from '@nestjs/common';
import { LedgerService } from '../finance/ledger.service';
import { AnonymisationService } from './anonymisation.service';
import { DeletionBlockersService } from './deletion-blockers.service';

/** The parts the worker needs too (anonymisation runs from the nightly job). */
@Module({
  providers: [LedgerService, DeletionBlockersService, AnonymisationService],
  exports: [DeletionBlockersService, AnonymisationService],
})
export class PrivacyCoreModule {}
