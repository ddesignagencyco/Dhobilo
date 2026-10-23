import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { FinanceModule } from '../finance/finance.module';
import { SlotsModule } from '../slots/slots.module';
import { VendorsModule } from '../vendors/vendors.module';
import { AdminOrdersService } from './admin-orders.service';
import { OrderEventsHub } from './lifecycle/order-events.hub';
import { OrderLifecycleModule } from './lifecycle/order-lifecycle.module';
import { OrderAccessService } from './order-access.service';
import { PaymentsCoreModule } from '../payments/payments-core.module';
import { OrderOwnership } from './order-ownership';
import { OrderStreamService } from './order-stream.service';
import { OrderViewerGuard } from './order-viewer.guard';
import { OrderTimersScheduler } from './timers/order-timers.scheduler';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { VendorOrdersController } from './vendor-orders.controller';
import { VendorOrdersService } from './vendor-orders.service';

@Module({
  imports: [PaymentsCoreModule, CartModule, FinanceModule, SlotsModule, VendorsModule, OrderLifecycleModule],
  controllers: [OrdersController, VendorOrdersController],
  providers: [OrdersService, VendorOrdersService, AdminOrdersService, OrderOwnership, OrderAccessService, OrderViewerGuard, OrderStreamService, OrderEventsHub, OrderTimersScheduler],
  exports: [OrdersService, VendorOrdersService, AdminOrdersService, OrderLifecycleModule],
})
export class OrdersModule {}
