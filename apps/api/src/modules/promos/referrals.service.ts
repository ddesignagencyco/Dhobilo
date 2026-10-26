import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { DiscountType, Prisma, ReferralStatus, UserStatus } from '@prisma/client';
import type { Env } from '../../config/env';
import { AppException } from '../../common/errors/app.exception';
import { DomainEvent } from '../../common/events/domain-events';
import type { OrderStatusChangedEvent } from '../../common/events/domain-events';
import { fmt, money } from '../../common/money/money';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const PROMO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short, unambiguous personal code for a referral reward. */
export function generateRewardCode(length = 8): string {
  let code = 'REF';
  for (let i = 0; i < length; i++) code += PROMO_ALPHABET[randomInt(PROMO_ALPHABET.length)];
  return code;
}

const normalizeCode = (code: string) => code.trim().toUpperCase();

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  /** Called only while creating a new customer, inside the same transaction as the user row. */
  async applyAtSignup(tx: Prisma.TransactionClient, code: string, refereeId: string): Promise<void> {
    const referrer = await tx.user.findFirst({
      where: { referralCode: normalizeCode(code), status: UserStatus.ACTIVE },
      select: { id: true },
    });
    if (!referrer) {
      throw new AppException('INVALID_REFERRAL', 'This referral code is not valid.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    try {
      await tx.referral.create({ data: { referrerId: referrer.id, refereeId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }
  }

  async overview(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
    const rows = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        id: true,
        status: true,
        rewardedAt: true,
        createdAt: true,
        rewardPromo: { select: { code: true, validTo: true } },
        referee: { select: { name: true } },
      },
    });
    return {
      code: user.referralCode,
      rewardAmount: fmt(money(this.config.get('REFERRAL_REWARD_PKR', { infer: true }))),
      pending: rows.filter((r) => r.status === ReferralStatus.PENDING).length,
      rewarded: rows.filter((r) => r.status === ReferralStatus.REWARDED).length,
      referrals: rows.map((r) => ({
        id: r.id,
        status: r.status,
        refereeName: r.referee.name ? r.referee.name.split(/\s+/)[0] : 'Friend',
        createdAt: r.createdAt,
        rewardedAt: r.rewardedAt,
        rewardCode: r.rewardPromo?.code ?? null,
        rewardValidTo: r.rewardPromo?.validTo ?? null,
      })),
    };
  }

  /** The referrer is rewarded once, when the referee's first order is delivered. */
  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: false })
  async onOrderChanged(e: OrderStatusChangedEvent): Promise<void> {
    if (e.to !== 'DELIVERED') return;
    try {
      await this.rewardIfFirstDelivery(e.orderId);
    } catch (err) {
      this.logger.error({ err, orderId: e.orderId }, 'Could not reward a referral');
    }
  }

  private async rewardIfFirstDelivery(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (!order) return;
    const referral = await this.prisma.referral.findUnique({ where: { refereeId: order.customerId } });
    if (!referral || referral.status !== ReferralStatus.PENDING) return;

    const now = this.clock.now();
    const reward = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Referral" WHERE id = ${referral.id}::uuid FOR UPDATE`;
      const current = await tx.referral.findUniqueOrThrow({ where: { id: referral.id } });
      if (current.status !== ReferralStatus.PENDING) return null;

      const delivered = await tx.order.count({ where: { customerId: current.refereeId, status: 'DELIVERED' } });
      if (delivered !== 1) return null;

      const amount = money(this.config.get('REFERRAL_REWARD_PKR', { infer: true }));
      let promo: { id: string; code: string } | null = null;
      for (let attempt = 0; attempt < 5 && !promo; attempt++) {
        try {
          promo = await tx.promoCode.create({
            data: {
              code: generateRewardCode(),
              discountType: DiscountType.FLAT,
              value: amount,
              maxUses: 1,
              perUserLimit: 1,
              validFrom: now,
              validTo: new Date(now.getTime() + this.config.get('REFERRAL_REWARD_VALID_DAYS', { infer: true }) * 86_400_000),
              ownerUserId: current.referrerId,
            },
            select: { id: true, code: true },
          });
        } catch (err) {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
        }
      }
      if (!promo) throw new Error('Could not allocate a referral reward code');

      await tx.referral.update({
        where: { id: current.id },
        data: { status: ReferralStatus.REWARDED, rewardedAt: now, rewardPromoId: promo.id },
      });
      return { promo, referrerId: current.referrerId };
    });

    if (!reward) return;
    const referrer = await this.prisma.user.findUnique({ where: { id: reward.referrerId }, select: { phone: true } });
    if (referrer) {
      const amount = fmt(money(this.config.get('REFERRAL_REWARD_PKR', { infer: true })));
      await this.notifications.notifySms(referrer.phone, `Dhoblio: your friend's first order was delivered. Use code ${reward.promo.code} for Rs ${amount} off your next order.`);
    }
  }
}
