import { Module } from '@nestjs/common';
import { CitiesModule } from '../cities/cities.module';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

@Module({
  imports: [CitiesModule],
  controllers: [AddressesController],
  providers: [AddressesService],
})
export class AddressesModule {}
