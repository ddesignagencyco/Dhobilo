import { Module } from '@nestjs/common';
import { AdminReportsController, ReportDownloadController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [AdminReportsController, ReportDownloadController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
