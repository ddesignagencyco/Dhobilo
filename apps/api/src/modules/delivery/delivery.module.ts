import { Module } from '@nestjs/common';
import { CitiesModule } from '../cities/cities.module';
import { OrderOwnership } from '../orders/order-ownership';
import { AdminDeliveryController } from './admin-delivery.controller';
import { AdminDeliveryService } from './admin-delivery.service';
import { CourierWebhookController } from './courier/courier-webhook.controller';
import { DeliveryCoreModule } from './delivery-core.module';
import { OrderDeliveryController } from './order-delivery.controller';
import { OrderDeliveryService } from './order-delivery.service';
import { RiderAppService } from './rider-app.service';
import { RiderContextGuard } from './rider-context.guard';
import { RiderController } from './rider.controller';
import { RiderRegistrationService } from './rider-registration.service';
import { RiderReviewService } from './rider-review.service';

/** API side of delivery: the rider app, the admin dispatch board, the customer's tracking, and the courier webhook. */
@Module({
  imports: [DeliveryCoreModule, CitiesModule],
  controllers: [RiderController, AdminDeliveryController, OrderDeliveryController, CourierWebhookController],
  providers: [RiderRegistrationService, RiderReviewService, RiderAppService, AdminDeliveryService, OrderDeliveryService, RiderContextGuard, OrderOwnership],
})
export class DeliveryModule {}
