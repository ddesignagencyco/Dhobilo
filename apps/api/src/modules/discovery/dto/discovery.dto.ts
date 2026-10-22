import { ServiceType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const VENDOR_SORTS = ['distance', 'rating', 'price'] as const;
export type VendorSort = (typeof VENDOR_SORTS)[number];

export class SearchVendorsQueryDto {
  /** Customer location (the search covers vendors whose own service radius reaches this point). */
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  /** Restrict to one city (from GET /cities). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  /** Business name contains (case-insensitive). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  q?: string;

  /** Only vendors offering this service. */
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  /** Only vendors with at least one item priced at or below this (PKR). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(500000)
  maxPrice?: number;

  @IsOptional()
  @IsIn(VENDOR_SORTS)
  sort?: VendorSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(300)
  cursor?: string;
}
