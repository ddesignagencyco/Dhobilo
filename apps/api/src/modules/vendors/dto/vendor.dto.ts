import { Availability, DocType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export const VENDOR_DOC_TYPES = [DocType.CNIC_FRONT, DocType.CNIC_BACK, DocType.SHOP_PHOTO, DocType.BUSINESS_REG] as const;

export class VendorDocumentDto {
  @IsIn(VENDOR_DOC_TYPES)
  type!: (typeof VENDOR_DOC_TYPES)[number];

  /** Cloudinary public_id returned by the direct upload (POST /media/sign). */
  @IsString()
  @Length(5, 300)
  publicId!: string;
}

export class RegisterVendorDto {
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  businessName!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Contact email for approval decisions and reports. */
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trim)
  @IsString()
  @Length(5, 250)
  addressLine!: string;

  @IsInt()
  @Min(1)
  cityId!: number;

  /** Shop location; must be inside Pakistan. */
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  /** Owner's CNIC (13 digits, dashes optional). Stored encrypted. */
  @IsString()
  @Length(13, 20)
  cnic!: string;

  /** Must include CNIC_FRONT, CNIC_BACK and at least one SHOP_PHOTO. */
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => VendorDocumentDto)
  documents!: VendorDocumentDto[];
}

export class UpdateVendorProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  businessName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  /** How far from the shop the vendor serves, in km. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(50)
  serviceRadiusKm?: number;

  /** Minutes the vendor has to accept or reject a new order before it is auto-rejected. */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  respondWithinMin?: number;
}

export class HoursEntryDto {
  /** 0 = Sunday ... 6 = Saturday */
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  /** Minutes from midnight, e.g. 9:00 = 540 */
  @IsInt()
  @Min(0)
  @Max(1439)
  opensAt!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  closesAt!: number;
}

export class SetHoursDto {
  /** The full weekly schedule; days left out are closed. */
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => HoursEntryDto)
  hours!: HoursEntryDto[];
}

export class SetAvailabilityDto {
  @IsEnum(Availability)
  availability!: Availability;
}

export class InviteStaffDto {
  /** Pakistani mobile number of the staff member. They sign in with an SMS code. */
  @IsString()
  @Length(10, 20)
  phone!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name?: string;
}
