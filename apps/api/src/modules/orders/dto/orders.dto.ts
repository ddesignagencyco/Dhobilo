import { OrderStatus, PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CartLineDto } from '../../cart/dto/cart.dto';
import { MAX_LINES } from '../../cart/pricing.service';

export class PlaceOrderDto {
  @IsUUID()
  vendorId!: string;

  /** One of the customer's saved addresses; its pin must be inside the vendor's service radius. */
  @IsUUID()
  addressId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];

  /** Start of the chosen pickup window, exactly as returned by GET /vendors/:id/slots. */
  @IsISO8601()
  pickupSlotStart!: string;

  /** Start of the chosen delivery window. */
  @IsISO8601()
  deliverySlotStart!: string;

  /** Only COD is accepted for now. */
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  /** The total the customer saw and agreed to (from POST /cart/estimate). A mismatch is rejected, never charged. */
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, { message: 'expectedTotal must be an amount like 1250 or 1250.50' })
  expectedTotal!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  customerNote?: string;

  /** Promo codes are not available yet; sending one is rejected. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  promoCode?: string;
}

export class ListOrdersQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

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
