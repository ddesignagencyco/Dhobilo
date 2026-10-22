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

    const updated = await this.prisma.$transaction(async (tx) => {
      const city = await tx.city.update({
        where: { id },
        data: { deliveryFee: dto.deliveryFee, isActive: dto.isActive, code: dto.code, nameUr: dto.nameUr },
      });
      await this.audit.record(
        {
          action: 'CITY_UPDATED',
          entity: 'City',
          entityId: String(id),
          actorId: ctx.admin.id,
          actorRole: Role.ADMIN,
          before: { deliveryFee: fmt(money(before.deliveryFee)), isActive: before.isActive, code: before.code },
          after: { deliveryFee: fmt(money(city.deliveryFee)), isActive: city.isActive, code: city.code },
          ip: ctx.ip,
          requestId: ctx.requestId,
        },
        tx,
      );
      return city;
    });
    await this.events.emitAsync(DomainEvent.VENDOR_CHANGED, { vendorId: '*' } satisfies VendorChangedEvent);
    return { id: updated.id, name: updated.name, nameUr: updated.nameUr, code: updated.code, isActive: updated.isActive, deliveryFee: fmt(money(updated.deliveryFee)) };
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
