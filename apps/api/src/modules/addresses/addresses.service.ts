import { HttpStatus, Injectable } from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { isInPakistan } from '../../common/geo/pakistan';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CitiesService } from '../cities/cities.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/addresses.dto';

export const MAX_ADDRESSES_PER_USER = 20;

const publicFields = {
  id: true,
  label: true,
  line1: true,
  line2: true,
  area: true,
  cityId: true,
  lat: true,
  lng: true,
  isDefault: true,
  createdAt: true,
} satisfies Prisma.AddressSelect;

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cities: CitiesService,
  ) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      select: publicFields,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    await this.validatePlace(dto.cityId, dto.lat, dto.lng);

    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const existing = await tx.address.count({ where: { userId, deletedAt: null } });
      if (existing >= MAX_ADDRESSES_PER_USER) {
        throw new AppException(
          'ADDRESS_LIMIT_REACHED',
          `You can save up to ${MAX_ADDRESSES_PER_USER} addresses.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const makeDefault = existing === 0 || dto.isDefault === true;
      if (makeDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });

      return tx.address.create({
        data: {
          userId,
          label: dto.label,
          line1: dto.line1,
          line2: dto.line2,
          area: dto.area,
          cityId: dto.cityId,
          lat: dto.lat,
          lng: dto.lng,
          isDefault: makeDefault,
        },
        select: publicFields,
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    const current = await this.findOwned(userId, id);
    await this.validatePlace(dto.cityId ?? current.cityId, dto.lat ?? current.lat, dto.lng ?? current.lng);

    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      // The default can only be moved by making another address the default, never cleared.
      const makeDefault = dto.isDefault === true && !current.isDefault;
      if (makeDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });

      return tx.address.update({
        where: { id },
        data: {
          label: dto.label,
          line1: dto.line1,
          line2: dto.line2,
          area: dto.area,
          cityId: dto.cityId,
          lat: dto.lat,
          lng: dto.lng,
          ...(makeDefault ? { isDefault: true } : {}),
        },
        select: publicFields,
      });
    });
  }

  /** Soft delete. If the default goes, the most recently added remaining address takes over. */
  async remove(userId: string, id: string): Promise<void> {
    const current = await this.findOwned(userId, id);

    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await tx.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
      if (current.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  private async findOwned(userId: string, id: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id, userId, deletedAt: null } });
    if (!address) throw new AppException(ErrorCode.NOT_FOUND, 'Address not found.', HttpStatus.NOT_FOUND);
    return address;
  }

  private async validatePlace(cityId: number, lat: number, lng: number): Promise<void> {
    if (!(await this.cities.findActive(cityId))) {
      throw new AppException('CITY_NOT_AVAILABLE', 'We do not serve this city yet.', HttpStatus.BAD_REQUEST);
    }
    if (!isInPakistan(lat, lng)) {
      throw new AppException('LOCATION_OUT_OF_RANGE', 'The map pin must be inside Pakistan.', HttpStatus.BAD_REQUEST);
    }
  }

  /** Serialises address writes per user so two concurrent requests can't both become the default. */
  private lockUser(tx: Prisma.TransactionClient, userId: string) {
    return tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
  }
}
