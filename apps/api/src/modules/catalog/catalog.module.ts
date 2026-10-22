import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { CatalogController, VendorCatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [VendorsModule],
  controllers: [CatalogController, VendorCatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
