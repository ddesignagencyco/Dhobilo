import { OrderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const csv = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value);

export class VendorOrdersQueryDto {
  /** One or more statuses, comma separated, e.g. `ACCEPTED,PICKED_UP`. Leave out for every status. */
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(9)
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(300)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class RejectOrderDto {
  /** Shown to the customer, so keep it clear and polite. */
  @Transform(trim)
  @IsString()
  @Length(5, 300)
  reason!: string;
}

/** The hand-off and work steps a vendor performs after accepting. */
export const VENDOR_STEPS = ['PICKED_UP', 'IN_PROCESS', 'READY', 'OUT_FOR_DELIVERY'] as const;

export class AdvanceOrderDto {
  /** PICKED_UP = laundry received, IN_PROCESS = work started, READY = finished, OUT_FOR_DELIVERY = handed to the rider. */
  @IsIn(VENDOR_STEPS)
  status!: (typeof VENDOR_STEPS)[number];
}

export class AdminOrdersQueryDto {
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(9)
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Order number contains, e.g. `LHR-0001`. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  orderNo?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(300)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminCancelOrderDto {
  /** Recorded in the order history and shown to the customer and vendor. */
  @Transform(trim)
  @IsString()
  @Length(5, 300)
  reason!: string;
}
