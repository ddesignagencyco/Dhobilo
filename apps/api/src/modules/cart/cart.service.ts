import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { fmt, money, sum } from '../../common/money/money';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PromotionsService } from '../promos/promotions.service';
import { EstimateDto, SetCartDto } from './dto/cart.dto';
import { PricingService, mergeLines, toQuoteView } from './pricing.service';

export const MAX_CARTS_PER_CUSTOMER = 10;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly promotions: PromotionsService,
  ) {}

  /** All of the customer's carts (one per vendor), or just one. Lines whose item was removed show `available: false`. */
  async list(customerId: string, vendorId?: string) {
    const carts = await this.prisma.cart.findMany({
      where: { customerId, ...(vendorId ? { vendorId } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: {
        vendorId: true,
        updatedAt: true,
        vendor: { select: { businessName: true, status: true } },
        items: {
          select: {
            qty: true,
            serviceItem: {
              select: { id: true, itemName: true, itemNameUr: true, serviceType: true, price: true, turnaroundHours: true, isActive: true, deletedAt: true },
            },
          },
        },
      },
    });

    return carts.map((c) => {
      const vendorLive = c.vendor.status === 'APPROVED';
      const items = c.items.map((i) => {
        const available = vendorLive && i.serviceItem.isActive && i.serviceItem.deletedAt === null;
        const unitPrice = money(i.serviceItem.price);
        return {
          serviceItemId: i.serviceItem.id,
          name: i.serviceItem.itemName,
          nameUr: i.serviceItem.itemNameUr,
          serviceType: i.serviceItem.serviceType,
          qty: i.qty,
          unitPrice: fmt(unitPrice),
          lineTotal: fmt(unitPrice.mul(i.qty)),
          turnaroundHours: i.serviceItem.turnaroundHours,
          available,
        };
      });
      return {
        vendorId: c.vendorId,
        vendorName: c.vendor.businessName,
        vendorAvailable: vendorLive,
        updatedAt: c.updatedAt,
        items,
        // Only purchasable lines count; call POST /cart/estimate for delivery fee and the final total.
        subtotal: fmt(sum(items.filter((i) => i.available).map((i) => money(i.lineTotal)))),
        unavailableCount: items.filter((i) => !i.available).length,
      };
    });
  }

  /** Replaces the cart for one vendor (idempotent "set", safe to retry; FR-C5). */
  async set(customerId: string, dto: SetCartDto) {
    if (dto.items.length === 0) {
      await this.prisma.cart.deleteMany({ where: { customerId, vendorId: dto.vendorId } });
      return { vendorId: dto.vendorId, items: [], subtotal: '0.00', unavailableCount: 0 };
    }

    const lines = mergeLines(dto.items);
    await this.pricing.quote(this.prisma, dto.vendorId, lines); // vendor live + every item active and theirs

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.cart.findUnique({ where: { customerId_vendorId: { customerId, vendorId: dto.vendorId } }, select: { id: true } });
      if (!existing && (await tx.cart.count({ where: { customerId } })) >= MAX_CARTS_PER_CUSTOMER) {
        throw new AppException('CART_LIMIT_REACHED', `You can keep up to ${MAX_CARTS_PER_CUSTOMER} open carts.`, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      const cart =
        existing ??
        (await tx.cart.create({ data: { customerId, vendorId: dto.vendorId }, select: { id: true } }));
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cartItem.createMany({ data: lines.map((l) => ({ cartId: cart.id, serviceItemId: l.serviceItemId, qty: l.qty })) });
      await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
    });
    return (await this.list(customerId, dto.vendorId))[0];
  }

  async clear(customerId: string, vendorId?: string): Promise<void> {
    await this.prisma.cart.deleteMany({ where: { customerId, ...(vendorId ? { vendorId } : {}) } });
  }

  /** Server-side price estimate (FR-C5): from the given items, or from the saved cart when none are given. */
  async estimate(customerId: string, dto: EstimateDto) {
    let lines = dto.items;
    if (!lines) {
      const saved = await this.prisma.cartItem.findMany({
        where: { cart: { customerId, vendorId: dto.vendorId } },
        select: { serviceItemId: true, qty: true },
      });
      lines = saved;
    }
    const quote = await this.pricing.quote(this.prisma, dto.vendorId, lines);
    const promo = dto.promoCode
      ? await this.promotions.resolve(this.prisma, customerId, dto.promoCode, quote.vendor.cityId, quote.subtotal)
      : null;
    if (promo) {
      quote.discountTotal = promo.discount;
      quote.total = quote.subtotal.plus(quote.deliveryFee).minus(promo.discount);
    }
    return {
      ...toQuoteView(quote),
      promo: promo ? { code: promo.code, discountTotal: fmt(promo.discount) } : null,
    };
  }
}
