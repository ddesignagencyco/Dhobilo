import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { FinanceModule } from '../finance/finance.module';
import { SlotsModule } from '../slots/slots.module';
import { OrderOwnership } from './order-ownership';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CartModule, FinanceModule, SlotsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderOwnership],
  exports: [OrdersService],
})
export class OrdersModule {}
