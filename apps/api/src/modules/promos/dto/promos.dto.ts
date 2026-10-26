import { DiscountType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CartLineDto } from '../../cart/dto/cart.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const bool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

export class CreatePromoDto {
  /** Case-insensitive; stored uppercase. */
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,32}$/, { message: 'code must be 3-32 letters, numbers, _ or -' })
  code!: string;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  /** Percent (1-100) for PERCENT, or a PKR amount for FLAT. */
  @IsString()
  @Matches(MONEY, { message: 'value must look like 15 or 150.00' })
  value!: string;

  /** Cap for a percentage discount. Ignored for FLAT. */
  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'maxDiscount must look like 150 or 150.00' })
  maxDiscount?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'minOrderAmount must look like 500 or 500.00' })
  minOrderAmount?: string;

  /** Total number of times the code may be used. Omit for unlimited. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxUses?: number;

  /** How many times one customer may use it. Defaults to 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perUserLimit?: number;

  @IsISO8601()
  validFrom!: string;

  @IsISO8601()
  validTo!: string;

  /** Restrict to one city; omit for all cities. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePromoDto {
  @IsOptional()
  @IsString()
  @Matches(MONEY)
  value?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY)
  maxDiscount?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY)
  minOrderAmount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxUses?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perUserLimit?: number;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListPromosQueryDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class ValidatePromoDto {
  @IsUUID()
  vendorId!: string;

  /** Case-insensitive. */
  @Transform(upper)
  @IsString()
  @MaxLength(40)
  code!: string;

  /** The items being priced. Required so the minimum-order and percentage rules are exact. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];
}
