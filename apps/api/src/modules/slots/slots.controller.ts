import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsOptional, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../../common/decorators/public.decorator';
import { AppException } from '../../common/errors/app.exception';
import { isValidDateString } from '../../common/time/zoned';
import { SlotsService } from './slots.service';

class SlotsQueryDto {
  /** Local date, YYYY-MM-DD (today up to 7 days ahead). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsIn(['pickup', 'delivery'])
  type!: 'pickup' | 'delivery';

  /** Delivery only: the longest turnaround among the items (hours), from the cart estimate. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  turnaroundHours?: number;

  /** Delivery only: when the chosen pickup slot ends (ISO 8601). */
  @IsOptional()
  @IsISO8601()
  pickupEnd?: string;
}

@ApiTags('slots')
@Public()
@Controller('vendors/:id/slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  /**
   * Hourly pickup or delivery windows for one day, with remaining capacity. Delivery windows start no earlier
   * than the pickup end plus the order's turnaround, so pass `pickupEnd` and `turnaroundHours` for them.
   */
  @Get()
  list(@Param('id', ParseUUIDPipe) id: string, @Query() q: SlotsQueryDto) {
    if (!isValidDateString(q.date)) {
      throw new AppException('VALIDATION_FAILED', 'date must be a real calendar date (YYYY-MM-DD).', HttpStatus.BAD_REQUEST);
    }
    if (q.type === 'delivery') {
      if (!q.pickupEnd || !q.turnaroundHours) {
        throw new AppException('VALIDATION_FAILED', 'Delivery slots need pickupEnd and turnaroundHours.', HttpStatus.BAD_REQUEST);
      }
      return this.slots.forVendor(id, q.date, 'delivery', { pickupEnd: new Date(q.pickupEnd), turnaroundHours: q.turnaroundHours });
    }
    return this.slots.forVendor(id, q.date, 'pickup');
  }
}
