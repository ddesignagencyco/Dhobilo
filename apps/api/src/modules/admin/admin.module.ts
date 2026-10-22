import { Module } from '@nestjs/common';
import { CitiesModule } from '../cities/cities.module';
import { VendorsModule } from '../vendors/vendors.module';
import { AdminCitiesController } from './admin-cities.controller';
import { AdminVendorsController } from './admin-vendors.controller';

@Module({
  imports: [VendorsModule, CitiesModule],
  controllers: [AdminVendorsController, AdminCitiesController],
})
export class AdminModule {}
