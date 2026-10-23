import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { OpsAlertService } from '../delivery/ops-alert.service';
import { FinanceModule } from '../finance/finance.module';
import { NotificationOrchestratorModule } from '../notifications/notification-orchestrator.module';
import { OrderLifecycleModule } from '../orders/lifecycle/order-lifecycle.module';
import { GatewayRegistry } from './gateway/gateway.registry';
import { JazzCashGateway } from './gateway/jazzcash.gateway';
import { MockGateway } from './gateway/mock.gateway';
import { PAYMENT_GATEWAYS, PaymentGateway } from './gateway/payment-gateway';
import { PaymentsListener } from './payments.listener';
import { PaymentsScheduler } from './payments.scheduler';
import { PaymentsService } from './payments.service';

/**
 * Payments engine: gateways, the payment lifecycle, refunds, timers. Imported by the API (which adds the controllers)
 * and by the worker (which adds the queue consumer), because orders change in both.
 */
@Module({
  imports: [FinanceModule, OrderLifecycleModule, NotificationOrchestratorModule],
  providers: [
    MockGateway,
    JazzCashGateway,
    {
      // Add each real adapter here, switched on by its own credentials. The fake one only exists when asked for.
      provide: PAYMENT_GATEWAYS,
      inject: [ConfigService, MockGateway, JazzCashGateway],
      useFactory: (config: ConfigService<Env, true>, mock: MockGateway, jazz: JazzCashGateway): PaymentGateway[] => [
        ...(config.get('PAYMENT_MOCK_GATEWAY', { infer: true }) ? [mock] : []),
        ...(jazz.configured ? [jazz] : []),
      ],
    },
    GatewayRegistry,
    PaymentsScheduler,
    PaymentsService,
    PaymentsListener,
    OpsAlertService,
  ],
  exports: [PaymentsService, GatewayRegistry, PaymentsScheduler, MockGateway],
})
export class PaymentsCoreModule {}
