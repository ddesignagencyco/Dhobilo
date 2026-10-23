import { Module } from '@nestjs/common';
import { OrderOwnership } from '../orders/order-ownership';
import { MockGatewayController } from './mock-gateway.controller';
import { PaymentsAdminService } from './payments-admin.service';
import { PaymentsCoreModule } from './payments-core.module';
import { AdminPaymentsController, OrderPaymentsController, PaymentsController } from './payments.controller';

/** API side of payments: methods, gateway notifications, the customer's payment screen, admin payments. */
@Module({
  imports: [PaymentsCoreModule],
  controllers: [PaymentsController, OrderPaymentsController, AdminPaymentsController, MockGatewayController],
  providers: [PaymentsAdminService, OrderOwnership],
  exports: [PaymentsCoreModule],
})
export class PaymentsModule {}
