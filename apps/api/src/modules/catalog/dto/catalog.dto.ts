import { PartialType } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MAX_PRICE_PKR = 500_000;
export const MAX_TURNAROUND_HOURS = 720;

class ItemFields {
  /** e.g. Shirt, Trouser, Suit, Bedsheet */
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  itemName!: string;

  /** Urdu name shown to Urdu-language customers. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  itemNameUr?: string;

  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  /** Price per item in PKR, at most 2 decimals. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MAX_PRICE_PKR)
  price!: number;

  /** Hours from pickup until the item is ready. */
  @IsInt()
  @Min(1)
  @Max(MAX_TURNAROUND_HOURS)
  turnaroundHours!: number;

  /** Inactive items are hidden from customers but kept. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateServiceItemDto extends ItemFields {
  @IsInt()
  @Min(1)
  categoryId!: number;
}

export class UpdateServiceItemDto extends PartialType(CreateServiceItemDto) {}

/** One row of a bulk import: the category is given by name so CSV files stay human-editable. */
export class ImportItemDto extends ItemFields {
  /** Category name as listed by GET /service-categories, e.g. "Dry Cleaning". */
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  category!: string;
}

export const IMPORT_MAX_ROWS = 500;
