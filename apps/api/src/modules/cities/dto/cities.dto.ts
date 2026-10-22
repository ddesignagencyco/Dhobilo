import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class UpdateCityDto {
  /** Flat fee added to every order in this city, in PKR. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5000)
  deliveryFee?: number;

  /** Inactive cities disappear from discovery and new addresses/vendors. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** 2-4 capital letters used in order numbers, e.g. LHR. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2,4}$/, { message: 'code must be 2-4 letters, e.g. LHR' })
  code?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  nameUr?: string;

  /** Courier partner that handles pickups and deliveries in this city (from GET /admin/courier-partners). `null` goes back to our own riders. */
  @IsOptional()
  @IsUUID()
  courierPartnerId?: string | null;
}
