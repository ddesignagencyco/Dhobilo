import { Module } from '@nestjs/common';
import { CitiesModule } from '../cities/cities.module';
import { FinanceModule } from '../finance/finance.module';
import { OrdersModule } from '../orders/orders.module';
import { VendorsModule } from '../vendors/vendors.module';
import { AdminCitiesController } from './admin-cities.controller';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminVendorsController } from './admin-vendors.controller';

@Module({
  imports: [VendorsModule, CitiesModule, OrdersModule, FinanceModule],
  controllers: [AdminVendorsController, AdminCitiesController, AdminOrdersController, AdminFinanceController],
})
export class AdminModule {}
