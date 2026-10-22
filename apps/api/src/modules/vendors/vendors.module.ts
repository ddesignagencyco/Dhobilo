import { Module } from '@nestjs/common';
import { CitiesModule } from '../cities/cities.module';
import { VendorContextGuard } from './vendor-context.guard';
import { VendorProfileService } from './vendor-profile.service';
import { VendorRegistrationService } from './vendor-registration.service';
import { VendorReviewService } from './vendor-review.service';
import { VendorStaffController } from './vendor-staff.controller';
import { VendorStaffService } from './vendor-staff.service';
import { VendorController } from './vendor.controller';

@Module({
  imports: [CitiesModule],
  controllers: [VendorController, VendorStaffController],
  providers: [VendorRegistrationService, VendorProfileService, VendorReviewService, VendorStaffService, VendorContextGuard],
  // Guard and review service are used by the catalog and admin modules.
  exports: [VendorContextGuard, VendorReviewService],
})
export class VendorsModule {}
