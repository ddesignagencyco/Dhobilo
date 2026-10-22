import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEvent, VendorChangedEvent } from '../../common/events/domain-events';
import { fmt, money } from '../../common/money/money';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateCityDto } from './dto/cities.dto';

@Injectable()
export class CitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /** Admin settings for a city. Changes are audited; discovery is told so cached search pages are dropped. */
  async adminUpdate(id: number, dto: UpdateCityDto, ctx: { admin: AuthUser; ip?: string; requestId?: string }) {
    const before = await this.prisma.city.findUnique({ where: { id } });
    if (!before) throw new AppException(ErrorCode.NOT_FOUND, 'City not found.', HttpStatus.NOT_FOUND);

    if (dto.courierPartnerId && !(await this.prisma.courierPartner.findUnique({ where: { id: dto.courierPartnerId }, select: { id: true } }))) {
      throw new AppException('COURIER_PARTNER_NOT_FOUND', 'That courier partner does not exist.', HttpStatus.BAD_REQUEST);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const city = await tx.city.update({
        where: { id },
        data: { deliveryFee: dto.deliveryFee, isActive: dto.isActive, code: dto.code, nameUr: dto.nameUr, courierPartnerId: dto.courierPartnerId },
      });
      await this.audit.record(
        {
          action: 'CITY_UPDATED',
          entity: 'City',
          entityId: String(id),
          actorId: ctx.admin.id,
          actorRole: Role.ADMIN,
          before: { deliveryFee: fmt(money(before.deliveryFee)), isActive: before.isActive, code: before.code, courierPartnerId: before.courierPartnerId },
          after: { deliveryFee: fmt(money(city.deliveryFee)), isActive: city.isActive, code: city.code, courierPartnerId: city.courierPartnerId },
          ip: ctx.ip,
          requestId: ctx.requestId,
        },
        tx,
      );
      return city;
    });
    await this.events.emitAsync(DomainEvent.VENDOR_CHANGED, { vendorId: '*' } satisfies VendorChangedEvent);
    return { id: updated.id, name: updated.name, nameUr: updated.nameUr, code: updated.code, isActive: updated.isActive, deliveryFee: fmt(money(updated.deliveryFee)), courierPartnerId: updated.courierPartnerId };
  }

  /** Active cities only: a city with isActive=false is "not available yet" for customers. */
  listActive() {
    return this.prisma.city.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nameUr: true, timezone: true },
      orderBy: { name: 'asc' },
    });
  }

  findActive(id: number) {
    return this.prisma.city.findFirst({ where: { id, isActive: true }, select: { id: true } });
  }
}
