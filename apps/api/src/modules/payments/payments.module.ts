import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { OrderLifecycleModule } from '../orders/lifecycle/order-lifecycle.module';
import { EasypaisaGateway } from './gateways/easypaisa.gateway';
import { JazzCashGateway } from './gateways/jazzcash.gateway';
import { PayFastGateway } from './gateways/payfast.gateway';
import { RaastGateway } from './gateways/raast.gateway';
import { GatewayRegistry } from './gateway.registry';
import { PaymentsController } from './payments.controller';
import { PaymentsListener } from './payments.listener';
import { PaymentsService } from './payments.service';
import { PaymentWebhooksController } from './webhooks.controller';

@Module({
  imports: [OrderLifecycleModule, FinanceModule],
  controllers: [PaymentsController, PaymentWebhooksController],
  providers: [JazzCashGateway, EasypaisaGateway, PayFastGateway, RaastGateway, GatewayRegistry, PaymentsService, PaymentsListener],
  exports: [PaymentsService, GatewayRegistry],
})
export class PaymentsModule {}
