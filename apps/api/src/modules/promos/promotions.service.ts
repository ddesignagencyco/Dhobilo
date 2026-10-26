import { HttpStatus, Injectable } from '@nestjs/common';
import { DiscountType, Prisma, PromoCode } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { Money, ZERO, fmt, money, round2 } from '../../common/money/money';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreatePromoDto, ListPromosQueryDto, UpdatePromoDto } from './dto/promos.dto';

type Db = PrismaService | Prisma.TransactionClient;

export interface AppliedPromo {
  id: string;
  code: string;
  discount: Money;
}

const normalizeCode = (code: string) => code.trim().toUpperCase();

const promoInclude = {
  owner: { select: { id: true, name: true } },
  _count: { select: { redemptions: true } },
} satisfies Prisma.PromoCodeInclude;

type PromoRow = Prisma.PromoCodeGetPayload<{ include: typeof promoInclude }>;

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * Prices a code against a subtotal. This is the preview path (estimate / promo validation); checkout calls
   * `lockAndValidate` again inside its transaction so two checkouts cannot both take the last use.
   */
  async resolve(db: Db, userId: string, code: string, cityId: number, subtotal: Money, now = this.clock.now()): Promise<AppliedPromo> {
    const promo = await db.promoCode.findFirst({
      where: { code: normalizeCode(code), deletedAt: null },
      select: { id: true, code: true, discountType: true, value: true, maxDiscount: true, minOrderAmount: true, maxUses: true, perUserLimit: true, validFrom: true, validTo: true, cityId: true, ownerUserId: true, isActive: true },
    });
    if (!promo) throw new AppException('PROMO_NOT_FOUND', 'This promo code does not exist.', HttpStatus.UNPROCESSABLE_ENTITY);
    return this.assertEligible(db, promo, userId, cityId, subtotal, now);
  }

  /**
   * Checkout path: takes a row lock on the code, then re-checks every rule and the final discount. Redemptions
   * for the same code are therefore serialized, making maxUses and per-user limits exact under a race.
   */
  async lockAndValidate(
    tx: Prisma.TransactionClient,
    userId: string,
    promoId: string,
    cityId: number,
    subtotal: Money,
    expectedDiscount: Money,
    now = this.clock.now(),
  ): Promise<AppliedPromo> {
    await tx.$queryRaw`SELECT id FROM "PromoCode" WHERE id = ${promoId}::uuid FOR UPDATE`;
    const promo = await tx.promoCode.findUnique({
      where: { id: promoId },
      select: { id: true, code: true, discountType: true, value: true, maxDiscount: true, minOrderAmount: true, maxUses: true, perUserLimit: true, validFrom: true, validTo: true, cityId: true, ownerUserId: true, isActive: true },
    });
    if (!promo) throw new AppException('PROMO_NOT_FOUND', 'This promo code no longer exists.', HttpStatus.UNPROCESSABLE_ENTITY);
    const applied = await this.assertEligible(tx, promo, userId, cityId, subtotal, now);
    if (!applied.discount.equals(expectedDiscount)) {
      throw new AppException('PROMO_CHANGED', 'This promo code changed. Review the new total and try again.', HttpStatus.CONFLICT, {
        discountTotal: fmt(applied.discount),
      });
    }
    return applied;
  }

  async create(dto: CreatePromoDto) {
    const value = money(dto.value);
    this.assertValue(dto.discountType, value, dto.maxDiscount);
    const validFrom = new Date(dto.validFrom);
    const validTo = new Date(dto.validTo);
    if (validTo <= validFrom) throw this.badWindow();

    try {
      const promo = await this.prisma.promoCode.create({
        data: {
          code: normalizeCode(dto.code),
          discountType: dto.discountType,
          value,
          maxDiscount: dto.maxDiscount ? money(dto.maxDiscount) : null,
          minOrderAmount: dto.minOrderAmount ? money(dto.minOrderAmount) : null,
          maxUses: dto.maxUses ?? null,
          perUserLimit: dto.perUserLimit ?? 1,
          validFrom,
          validTo,
          cityId: dto.cityId ?? null,
          isActive: dto.isActive ?? true,
        },
        include: promoInclude,
      });
      return this.view(promo);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException('PROMO_CODE_EXISTS', 'A promo code with this name already exists.', HttpStatus.CONFLICT);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdatePromoDto) {
    const existing = await this.prisma.promoCode.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw this.notFound();

    const value = dto.value ? money(dto.value) : money(existing.value);
    const discountType = existing.discountType;
    this.assertValue(discountType, value, dto.maxDiscount ?? existing.maxDiscount?.toString());
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : existing.validFrom;
    const validTo = dto.validTo ? new Date(dto.validTo) : existing.validTo;
    if (validTo <= validFrom) throw this.badWindow();

    const promo = await this.prisma.promoCode.update({
      where: { id },
      data: {
        ...(dto.value !== undefined ? { value } : {}),
        ...(dto.maxDiscount !== undefined ? { maxDiscount: money(dto.maxDiscount) } : {}),
        ...(dto.minOrderAmount !== undefined ? { minOrderAmount: money(dto.minOrderAmount) } : {}),
        ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
        ...(dto.perUserLimit !== undefined ? { perUserLimit: dto.perUserLimit } : {}),
        ...(dto.validFrom !== undefined ? { validFrom } : {}),
        ...(dto.validTo !== undefined ? { validTo } : {}),
        ...(dto.cityId !== undefined ? { cityId: dto.cityId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: promoInclude,
    });
    return this.view(promo);
  }

  /** Soft delete: past orders keep their promo link and redemption history. */
  async remove(id: string): Promise<void> {
    const changed = await this.prisma.promoCode.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: this.clock.now(), isActive: false } });
    if (changed.count === 0) throw this.notFound();
  }

  async list(q: ListPromosQueryDto) {
    const limit = q.limit ?? 20;
    const where: Prisma.PromoCodeWhereInput = {
      deletedAt: null,
      ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
      ...(q.cityId ? { cityId: q.cityId } : {}),
      ...(q.q
        ? {
            OR: [
              { code: { contains: q.q.toUpperCase(), mode: 'insensitive' } },
              { owner: { name: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.promoCode.findMany({
      where: { AND: [where, beforeCursor(q.cursor)] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: promoInclude,
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return { items: items.map((p) => this.view(p)), nextCursor };
  }

  async detail(id: string) {
    const promo = await this.prisma.promoCode.findFirst({ where: { id, deletedAt: null }, include: promoInclude });
    if (!promo) throw this.notFound();
    const [totals, users] = await Promise.all([
      this.prisma.promoRedemption.aggregate({ where: { promoId: id }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.promoRedemption.groupBy({ by: ['userId'], where: { promoId: id } }),
    ]);
    return {
      ...this.view(promo),
      stats: {
        redemptions: totals._count._all,
        uniqueCustomers: users.length,
        discountTotal: fmt(money(totals._sum.amount ?? ZERO)),
      },
    };
  }

  private async assertEligible(
    db: Db,
    promo: {
      id: string;
      code: string;
      discountType: DiscountType;
      value: Prisma.Decimal;
      maxDiscount: Prisma.Decimal | null;
      minOrderAmount: Prisma.Decimal | null;
      maxUses: number | null;
      perUserLimit: number;
      validFrom: Date;
      validTo: Date;
      cityId: number | null;
      ownerUserId: string | null;
      isActive: boolean;
    },
    userId: string,
    cityId: number,
    subtotal: Money,
    now: Date,
  ): Promise<AppliedPromo> {
    if (!promo.isActive) throw this.unavailable('This promo code is not active.');
    if (now < promo.validFrom) throw this.unavailable('This promo code is not valid yet.');
    if (now > promo.validTo) throw this.unavailable('This promo code has expired.');
    if (promo.cityId !== null && promo.cityId !== cityId) throw this.unavailable('This promo code is not available in your city.');
    if (promo.ownerUserId !== null && promo.ownerUserId !== userId) throw this.unavailable('This promo code belongs to another account.');
    if (promo.minOrderAmount !== null && subtotal.lt(promo.minOrderAmount)) {
      throw new AppException('PROMO_MIN_ORDER', `This promo code needs a minimum order of Rs ${fmt(money(promo.minOrderAmount))}.`, HttpStatus.UNPROCESSABLE_ENTITY, {
        minOrderAmount: fmt(money(promo.minOrderAmount)),
      });
    }

    const [totalUses, userUses] = await Promise.all([
      promo.maxUses === null ? Promise.resolve(0) : db.promoRedemption.count({ where: { promoId: promo.id } }),
      db.promoRedemption.count({ where: { promoId: promo.id, userId } }),
    ]);
    if (promo.maxUses !== null && totalUses >= promo.maxUses) throw this.unavailable('This promo code has reached its usage limit.', 'PROMO_USAGE_LIMIT');
    if (userUses >= promo.perUserLimit) throw this.unavailable('You have already used this promo code.', 'PROMO_USAGE_LIMIT');

    const discount = this.discountFor(promo, subtotal);
    if (discount.lte(0)) throw this.unavailable('This promo code does not save anything on this order.');
    return { id: promo.id, code: promo.code, discount };
  }

  private discountFor(promo: { discountType: DiscountType; value: Prisma.Decimal; maxDiscount: Prisma.Decimal | null }, subtotal: Money): Money {
    const raw = promo.discountType === DiscountType.PERCENT ? subtotal.mul(promo.value).div(100) : money(promo.value);
    const capped = promo.maxDiscount !== null ? Prisma.Decimal.min(raw, promo.maxDiscount) : raw;
    return round2(Prisma.Decimal.min(capped, subtotal));
  }

  private assertValue(type: DiscountType, value: Money, maxDiscount?: string | null): void {
    if (value.lte(0)) throw new AppException('PROMO_INVALID_VALUE', 'The discount must be greater than zero.', HttpStatus.UNPROCESSABLE_ENTITY);
    if (type === DiscountType.PERCENT && value.gt(100)) {
      throw new AppException('PROMO_INVALID_VALUE', 'A percentage discount cannot be more than 100.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (maxDiscount && money(maxDiscount).lte(0)) {
      throw new AppException('PROMO_INVALID_VALUE', 'maxDiscount must be greater than zero.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  private view(p: PromoRow) {
    return {
      id: p.id,
      code: p.code,
      discountType: p.discountType,
      value: fmt(money(p.value)),
      maxDiscount: p.maxDiscount === null ? null : fmt(money(p.maxDiscount)),
      minOrderAmount: p.minOrderAmount === null ? null : fmt(money(p.minOrderAmount)),
      maxUses: p.maxUses,
      perUserLimit: p.perUserLimit,
      validFrom: p.validFrom,
      validTo: p.validTo,
      cityId: p.cityId,
      owner: p.owner,
      isActive: p.isActive,
      redemptions: p._count.redemptions,
      createdAt: p.createdAt,
    };
  }

  private unavailable(message: string, code = 'PROMO_UNAVAILABLE'): AppException {
    return new AppException(code, message, HttpStatus.UNPROCESSABLE_ENTITY);
  }

  private badWindow(): AppException {
    return new AppException('PROMO_INVALID_WINDOW', 'validTo must be after validFrom.', HttpStatus.UNPROCESSABLE_ENTITY);
  }

  private notFound(): AppException {
    return new AppException('PROMO_NOT_FOUND', 'Promo code not found.', HttpStatus.NOT_FOUND);
  }
}
