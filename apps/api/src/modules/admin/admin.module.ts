import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { AdminVendorsController } from './admin-vendors.controller';

@Module({
  imports: [VendorsModule],
  controllers: [AdminVendorsController],
})
export class AdminModule {}
