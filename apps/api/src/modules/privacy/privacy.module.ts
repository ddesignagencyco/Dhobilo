import { Module } from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service';
import { DataExportService } from './data-export.service';
import { PrivacyAdminController, PrivacyController } from './privacy.controller';
import { PrivacyCoreModule } from './privacy-core.module';

@Module({
  imports: [PrivacyCoreModule],
  controllers: [PrivacyController, PrivacyAdminController],
  providers: [AccountDeletionService, DataExportService],
  exports: [AccountDeletionService],
})
export class PrivacyModule {}
