import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { MAX_LINES, MAX_LINE_QTY } from '../pricing.service';

export class CartLineDto {
  @IsUUID()
  serviceItemId!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QTY)
  qty!: number;
}

export class SetCartDto {
  @IsUUID()
  vendorId!: string;

  /** The full cart for this vendor. An empty list removes the cart. */
  @IsArray()
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];
}

export class EstimateDto {
  @IsUUID()
  vendorId!: string;

  /** Items to price. Leave out to price the saved cart for this vendor. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items?: CartLineDto[];

  /** Promo codes are not available yet; sending one is rejected rather than silently ignored. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  promoCode?: string;
}
