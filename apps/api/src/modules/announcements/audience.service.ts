import { Injectable } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { resolvePrefs } from '../notifications/notification-prefs';
import { TARGET_ROLES } from './announcements.dto';

export interface Segment {
  roles?: Role[];
  cityId?: number;
  activeWithinDays?: number;
  inactiveForDays?: number;
}

const DAY_MS = 86_400_000;

export const audienceSelect = {
  id: true,
  role: true,
  locale: true,
  phone: true,
  email: true,
  notificationPrefs: true,
  deviceTokens: { select: { token: true } },
} satisfies Prisma.UserSelect;

export type AudienceMember = Prisma.UserGetPayload<{ select: typeof audienceSelect }>;

/** Who an announcement reaches, and how (FR-A7). Only active accounts, never admins. */
@Injectable()
export class AudienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  where(segment: Segment): Prisma.UserWhereInput {
    const now = this.clock.now().getTime();
    const and: Prisma.UserWhereInput[] = [];
    if (segment.cityId) {
      const cityId = segment.cityId;
      and.push({
        OR: [
          { addresses: { some: { cityId } } },
          { orders: { some: { cityId } } },
          { vendorOwned: { is: { cityId } } },
          { vendorStaff: { some: { vendor: { cityId } } } },
          { rider: { is: { cityId } } },
        ],
      });
    }
    const recently = (days: number): Prisma.UserWhereInput => {
      const since = new Date(now - days * DAY_MS);
      return { OR: [{ lastLoginAt: { gte: since } }, { orders: { some: { createdAt: { gte: since } } } }] };
    };
    if (segment.activeWithinDays) and.push(recently(segment.activeWithinDays));
    if (segment.inactiveForDays) and.push({ NOT: recently(segment.inactiveForDays) });
    return {
      status: UserStatus.ACTIVE,
      role: { in: segment.roles?.length ? segment.roles : [...TARGET_ROLES] },
      ...(and.length ? { AND: and } : {}),
    };
  }

  count(segment: Segment): Promise<number> {
    return this.prisma.user.count({ where: this.where(segment) });
  }

  /** The audience in id order, `size` at a time, so memory stays flat for any audience size. */
  async *members(segment: Segment, size: number): AsyncGenerator<AudienceMember[]> {
    const where = this.where(segment);
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.user.findMany({
        where,
        orderBy: { id: 'asc' },
        take: size,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: audienceSelect,
      });
      if (rows.length === 0) return;
      yield rows;
      cursor = rows.at(-1)!.id;
    }
  }

  /** Which of the chosen channels this person can actually be reached on, given their settings. */
  channelsFor(member: AudienceMember, channels: readonly string[]): Array<'PUSH' | 'SMS' | 'EMAIL'> {
    const prefs = resolvePrefs(member.notificationPrefs);
    const out: Array<'PUSH' | 'SMS' | 'EMAIL'> = [];
    if (channels.includes('PUSH') && prefs.push && member.deviceTokens.length > 0) out.push('PUSH');
    if (channels.includes('SMS') && prefs.sms) out.push('SMS');
    if (channels.includes('EMAIL') && prefs.email && member.email) out.push('EMAIL');
    return out;
  }

  async preview(segment: Segment, channels: readonly string[]) {
    const reach = { PUSH: 0, SMS: 0, EMAIL: 0 };
    const byRole: Record<string, number> = {};
    let recipients = 0;
    let reachable = 0;
    for await (const batch of this.members(segment, 1000)) {
      for (const m of batch) {
        recipients++;
        byRole[m.role] = (byRole[m.role] ?? 0) + 1;
        const via = this.channelsFor(m, channels);
        if (via.length) reachable++;
        for (const c of via) reach[c]++;
      }
    }
    return { recipients, reachable, byRole, byChannel: reach };
  }
}
