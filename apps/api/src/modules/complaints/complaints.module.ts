import { Module } from '@nestjs/common';
import { DeliveryCoreModule } from '../delivery/delivery-core.module';
import { PaymentsModule } from '../payments/payments.module';
import { VendorsModule } from '../vendors/vendors.module';
import { AdminComplaintsController } from './admin-complaints.controller';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';
import { VendorComplaintsController } from './vendor-complaints.controller';

@Module({
  imports: [DeliveryCoreModule, PaymentsModule, VendorsModule],
  controllers: [ComplaintsController, VendorComplaintsController, AdminComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}
