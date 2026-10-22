import { Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { NotificationOrchestratorModule } from '../notifications/notification-orchestrator.module';
import { OrderLifecycleModule } from '../orders/lifecycle/order-lifecycle.module';
import { CourierService } from './courier/courier.service';
import { COURIER_PROVIDERS } from './courier/courier-provider';
import { MockCourierProvider } from './courier/mock-courier.provider';
import { DeliveryEventsListener } from './delivery-events.listener';
import { DeliveryJobsService } from './delivery-jobs.service';
import { DeliveryOtpService } from './delivery-otp.service';
import { DispatchScheduler } from './dispatch.scheduler';
import { DispatchService } from './dispatch.service';
import { OpsAlertService } from './ops-alert.service';
import { RiderPresenceService } from './rider-presence.service';

/**
 * The delivery engine: jobs, dispatch, presence, delivery codes, courier partners. Imported by the API (which adds the
 * controllers) and by the worker (which adds the queue consumer), because orders change in both and jobs follow them.
 */
@Module({
  imports: [OrderLifecycleModule, NotificationOrchestratorModule, CryptoModule],
  providers: [
    DeliveryJobsService,
    DeliveryOtpService,
    DispatchScheduler,
    DispatchService,
    OpsAlertService,
    RiderPresenceService,
    CourierService,
    DeliveryEventsListener,
    MockCourierProvider,
    // Add each courier adapter here; the partner's `code` in the database selects which one is used.
    { provide: COURIER_PROVIDERS, useFactory: (mock: MockCourierProvider) => [mock], inject: [MockCourierProvider] },
  ],
  exports: [DeliveryJobsService, DispatchService, DispatchScheduler, RiderPresenceService, CourierService, DeliveryOtpService, OpsAlertService],
})
export class DeliveryCoreModule {}
