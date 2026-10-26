import { Module } from '@nestjs/common';
import { ReportsBootstrap, ReportsProcessor } from './reports.processor';
import { ReportsService } from './reports.service';

/** Worker side: builds the files. */
@Module({ providers: [ReportsService, ReportsProcessor, ReportsBootstrap] })
export class ReportsWorkerModule {}
