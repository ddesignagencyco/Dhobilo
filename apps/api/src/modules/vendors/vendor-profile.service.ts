import { HttpStatus, Injectable } from '@nestjs/common';
import { Availability, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { HoursEntryDto, UpdateVendorProfileDto } from './dto/vendor.dto';

const profileSelect = {
  id: true,
  businessName: true,
  description: true,
  addressLine: true,
  cityId: true,
  lat: true,
  lng: true,
  status: true,
  rejectionReason: true,
  availability: true,
  serviceRadiusKm: true,
  respondWithinMin: true,
  ratingAvg: true,
  ratingCount: true,
  approvedAt: true,
  createdAt: true,
  documents: { select: { type: true, verifiedAt: true } },
} satisfies Prisma.VendorSelect;

export function assertValidHours(hours: HoursEntryDto[]): void {
  const days = new Set<number>();
  for (const h of hours) {
    if (days.has(h.dayOfWeek)) {
      throw new AppException('INVALID_HOURS', 'Each day can only appear once.', HttpStatus.BAD_REQUEST);
    }
    days.add(h.dayOfWeek);
    if (h.opensAt >= h.closesAt) {
      throw new AppException('INVALID_HOURS', 'Opening time must be before closing time.', HttpStatus.BAD_REQUEST, {
        dayOfWeek: h.dayOfWeek,
      });
    }
  }
}

@Injectable()
export class VendorProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** Own profile with status, rejection reason and which documents were verified (no document URLs, no CNIC). */
  async getProfile(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId }, select: profileSelect });
    if (!vendor) throw new AppException(ErrorCode.NOT_FOUND, 'Vendor not found.', HttpStatus.NOT_FOUND);
    return vendor;
  }

  updateProfile(vendorId: string, dto: UpdateVendorProfileDto) {
    return this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        businessName: dto.businessName,
        description: dto.description,
        serviceRadiusKm: dto.serviceRadiusKm,
        respondWithinMin: dto.respondWithinMin,
      },
      select: profileSelect,
    });
  }

  getHours(vendorId: string) {
    return this.prisma.vendorHours.findMany({
      where: { vendorId },
      select: { dayOfWeek: true, opensAt: true, closesAt: true },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  /** Replaces the whole weekly schedule atomically. */
  async setHours(vendorId: string, hours: HoursEntryDto[]) {
    assertValidHours(hours);
    await this.prisma.$transaction([
      this.prisma.vendorHours.deleteMany({ where: { vendorId } }),
      this.prisma.vendorHours.createMany({
        data: hours.map((h) => ({ vendorId, dayOfWeek: h.dayOfWeek, opensAt: h.opensAt, closesAt: h.closesAt })),
      }),
    ]);
    return this.getHours(vendorId);
  }

  async setAvailability(vendorId: string, availability: Availability) {
    const { id, availability: current } = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { availability },
      select: { id: true, availability: true },
    });
    return { id, availability: current };
  }
}
