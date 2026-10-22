import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAddressDto {
  /** e.g. Home, Office */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  label?: string;

  @Transform(trim)
  @IsString()
  @Length(3, 200)
  line1!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  area?: string;

  /** An active city from GET /cities. */
  @IsInt()
  @Min(1)
  cityId!: number;

  /** Map pin. Must fall inside Pakistan. */
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  /** Make this the default address. The first address is always the default. */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
