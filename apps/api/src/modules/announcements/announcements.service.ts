import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Announcement, AnnouncementStatus, NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import { QUEUES } from '../../infra/queue/queues';
import { CreateAnnouncementDto, ListAnnouncementsQueryDto, PreviewAnnouncementDto, SegmentDto } from './announcements.dto';
import { FANOUT_ANNOUNCEMENT_JOB, FanoutAnnouncementJob } from './announcement-fanout.service';
import { AudienceService, Segment } from './audience.service';

const ANNOUNCEMENTS_PER_HOUR = 5;
const DEFAULT_CHANNELS: NotificationChannel[] = [NotificationChannel.PUSH];

/** Only the fields that define the audience are stored (and the segment is read back from there to send). */
function cleanSegment(s: SegmentDto): Segment {
  if (s.activeWithinDays && s.inactiveForDays) {
    throw new AppException('INVALID_SEGMENT', 'Choose either "active within" or "inactive for", not both', HttpStatus.BAD_REQUEST);
  }
  return {
    ...(s.roles?.length ? { roles: [...s.roles] } : {}),
    ...(s.cityId ? { cityId: s.cityId } : {}),
    ...(s.activeWithinDays ? { activeWithinDays: s.activeWithinDays } : {}),
    ...(s.inactiveForDays ? { inactiveForDays: s.inactiveForDays } : {}),
  };
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AudienceService,
    private readonly limiter: RateLimiter,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  /** Who would receive it: total, by role, and how many can be reached on each channel. Nothing is sent. */
  async preview(dto: PreviewAnnouncementDto) {
    const segment = cleanSegment(dto.segment);
    return { segment, ...(await this.audience.preview(segment, dto.channels ?? DEFAULT_CHANNELS)) };
  }

  async create(dto: CreateAnnouncementDto, adminId: string) {
    if (!!dto.titleUr !== !!dto.bodyUr) {
      throw new AppException('INVALID_ANNOUNCEMENT', 'Give both the Urdu title and the Urdu text, or neither', HttpStatus.BAD_REQUEST);
    }
    const segment = cleanSegment(dto.segment);
    await this.limiter.consume(`rl:announcements:user:${adminId}`, ANNOUNCEMENTS_PER_HOUR, 3600);
    const recipients = await this.audience.count(segment);
    if (recipients !== dto.confirmRecipients) {
      throw new AppException('AUDIENCE_CHANGED', `This would reach ${recipients} people, not ${dto.confirmRecipients}. Preview it again before sending.`, HttpStatus.CONFLICT, { recipients });
    }
    if (recipients === 0) {
      throw new AppException('NO_RECIPIENTS', 'Nobody matches this audience', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        body: dto.body,
        titleUr: dto.titleUr ?? null,
        bodyUr: dto.bodyUr ?? null,
        segment: segment as unknown as Prisma.InputJsonValue,
        channels: dto.channels ?? DEFAULT_CHANNELS,
        sentById: adminId,
        recipientCount: recipients,
      },
    });
    try {
      await this.queue.add(FANOUT_ANNOUNCEMENT_JOB, { announcementId: announcement.id } satisfies FanoutAnnouncementJob, { attempts: 3, backoff: { type: 'exponential', delay: 15_000 } });
    } catch {
      await this.prisma.announcement.update({ where: { id: announcement.id }, data: { status: AnnouncementStatus.FAILED, error: 'Could not queue the announcement' } });
      throw new AppException('ANNOUNCEMENT_NOT_QUEUED', 'Could not queue the announcement. Please try again.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.view(announcement);
  }

  async list(q: ListAnnouncementsQueryDto) {
    const limit = q.limit ?? 20;
    const rows = await this.prisma.announcement.findMany({
      where: beforeCursor(q.cursor),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return { items: items.map((a) => this.view(a)), nextCursor };
  }

  async get(id: string) {
    const a = await this.prisma.announcement.findUnique({ where: { id } });
    if (!a) throw new AppException('ANNOUNCEMENT_NOT_FOUND', 'No such announcement', HttpStatus.NOT_FOUND);
    const groups = await this.prisma.notification.groupBy({ by: ['channel', 'status'], where: { announcementId: id }, _count: { _all: true } });
    const delivery: Record<string, { queued: number; sent: number; failed: number }> = {};
    for (const g of groups) {
      const d = (delivery[g.channel] ??= { queued: 0, sent: 0, failed: 0 });
      if (g.status === NotificationStatus.QUEUED) d.queued = g._count._all;
      else if (g.status === NotificationStatus.SENT) d.sent = g._count._all;
      else d.failed = g._count._all;
    }
    return { ...this.view(a), delivery };
  }

  private view(a: Announcement) {
    return {
      id: a.id,
      title: a.title,
      body: a.body,
      titleUr: a.titleUr,
      bodyUr: a.bodyUr,
      segment: a.segment,
      channels: a.channels,
      status: a.status,
      recipientCount: a.recipientCount,
      messagesQueued: a.sentCount,
      error: a.error,
      sentById: a.sentById,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
    };
  }
}
