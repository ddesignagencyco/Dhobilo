import { HttpStatus, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/time/clock';
import { addDays, dayOfWeekOf, localParts, localToUtc } from '../../common/time/zoned';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Slot rules (TRD §20 #8): hourly windows inside vendor hours, capacity-limited per vendor. */
export const SLOT_MINUTES = 60;
/** A pickup can't be booked sooner than this from now, so the vendor/rider can prepare. */
export const MIN_LEAD_MINUTES = 60;
/** Furthest day (counting today as 0) a customer can book. */
export const MAX_DAYS_AHEAD = 7;
/** Orders that no longer occupy a slot. */
const FREE_STATUSES: OrderStatus[] = [OrderStatus.REJECTED, OrderStatus.CANCELLED];

export type SlotType = 'pickup' | 'delivery';

export interface Slot {
  start: Date;
  end: Date;
}

export interface SlotView {
  start: string;
  end: string;
  available: boolean;
  remaining: number;
}

export interface DeliveryConstraint {
  /** When the pickup window ends. */
  pickupEnd: Date;
  /** The longest turnaround among the ordered items. */
  turnaroundHours: number;
}

type Db = PrismaService | Prisma.TransactionClient;

export interface SlotVendor {
  id: string;
  slotCapacity: number;
  city: { timezone: string };
  hours: { dayOfWeek: number; opensAt: number; closesAt: number }[];
}

/** All slots on one local day, back to back from opening time, that start no earlier than `earliest`. */
export function buildDaySlots(opts: {
  date: string;
  tz: string;
  opensAt: number;
  closesAt: number;
  earliest: Date;
  slotMinutes?: number;
}): Slot[] {
  const length = opts.slotMinutes ?? SLOT_MINUTES;
  const slots: Slot[] = [];
  for (let m = opts.opensAt; m + length <= opts.closesAt; m += length) {
    const start = localToUtc(opts.date, m, opts.tz);
    if (start < opts.earliest) continue;
    slots.push({ start, end: localToUtc(opts.date, m + length, opts.tz) });
  }
  return slots;
}

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async forVendor(vendorId: string, date: string, type: SlotType, delivery?: DeliveryConstraint) {
    const vendor = await this.loadVendor(this.prisma, vendorId);
    if (!vendor) throw new AppException(ErrorCode.NOT_FOUND, 'Vendor not found.', HttpStatus.NOT_FOUND);

    const tz = vendor.city.timezone;
    if (!this.dateAllowed(tz, date, type, delivery)) {
      throw new AppException(
        'DATE_OUT_OF_RANGE',
        type === 'pickup'
          ? `Pick a date from today up to ${MAX_DAYS_AHEAD} days ahead.`
          : `Pick a delivery date within ${MAX_DAYS_AHEAD} days of the earliest possible delivery.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const slots = await this.slotsOnDate(this.prisma, vendor, date, type, delivery);
    return { date, timezone: tz, type, slotMinutes: SLOT_MINUTES, capacity: vendor.slotCapacity, slots };
  }

  /**
   * Used while placing an order: the exact slot must be one the vendor really offers right now, still have room,
   * and (for delivery) respect pickup + turnaround. Call it inside the transaction that holds the vendor lock.
   */
  async assertBookable(db: Db, vendor: SlotVendor, type: SlotType, start: Date, delivery?: DeliveryConstraint): Promise<Slot> {
    const date = localParts(start, vendor.city.timezone).date;
    const slots = this.dateAllowed(vendor.city.timezone, date, type, delivery) ? await this.slotsOnDate(db, vendor, date, type, delivery) : [];
    const match = slots.find((s) => s.start === start.toISOString());
    if (!match) {
      throw new AppException(
        'SLOT_UNAVAILABLE',
        type === 'pickup' ? 'That pickup time is not available.' : 'That delivery time is not available.',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { type },
      );
    }
    if (!match.available) {
      throw new AppException('SLOT_FULL', 'That time slot is full. Please pick another.', HttpStatus.CONFLICT, { type });
    }
    return { start: new Date(match.start), end: new Date(match.end) };
  }

  /**
   * How far ahead a window may be booked. Pickup: today up to MAX_DAYS_AHEAD days out. Delivery: no earlier
   * than the turnaround allows (enforced by the slot builder) and at most MAX_DAYS_AHEAD days after that.
   */
  private dateAllowed(tz: string, date: string, type: SlotType, delivery?: DeliveryConstraint): boolean {
    if (type === 'pickup') {
      const today = localParts(this.clock.now(), tz).date;
      return date >= today && date <= addDays(today, MAX_DAYS_AHEAD);
    }
    if (!delivery) return false;
    const earliestDate = localParts(new Date(delivery.pickupEnd.getTime() + delivery.turnaroundHours * 3_600_000), tz).date;
    return date <= addDays(earliestDate, MAX_DAYS_AHEAD);
  }

  async loadVendor(db: Db, vendorId: string): Promise<SlotVendor | null> {
    return db.vendor.findFirst({
      where: { id: vendorId, status: 'APPROVED', city: { isActive: true } },
      select: {
        id: true,
        slotCapacity: true,
        city: { select: { timezone: true } },
        hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
      },
    });
  }

  private async slotsOnDate(db: Db, vendor: SlotVendor, date: string, type: SlotType, delivery?: DeliveryConstraint): Promise<SlotView[]> {
    const tz = vendor.city.timezone;
    const day = vendor.hours.find((h) => h.dayOfWeek === dayOfWeekOf(date));
    if (!day) return [];

    const now = this.clock.now();
    let earliest = new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000);
    if (type === 'delivery') {
      if (!delivery) throw new Error('delivery slots need pickupEnd and turnaroundHours');
      const afterTurnaround = new Date(delivery.pickupEnd.getTime() + delivery.turnaroundHours * 3_600_000);
      if (afterTurnaround > earliest) earliest = afterTurnaround;
    }

    const candidates = buildDaySlots({ date, tz, opensAt: day.opensAt, closesAt: day.closesAt, earliest });
    if (candidates.length === 0) return [];

    const booked = await this.bookedCounts(db, vendor.id, type, candidates[0].start, candidates[candidates.length - 1].start);
    return candidates.map((s) => {
      const remaining = Math.max(vendor.slotCapacity - (booked.get(s.start.getTime()) ?? 0), 0);
      return { start: s.start.toISOString(), end: s.end.toISOString(), available: remaining > 0, remaining };
    });
  }

  /** Orders currently holding a slot, keyed by the slot's start time. */
  private async bookedCounts(db: Db, vendorId: string, type: SlotType, from: Date, to: Date): Promise<Map<number, number>> {
    const field = type === 'pickup' ? 'pickupSlotStart' : 'deliverySlotStart';
    const groups = await db.order.groupBy({
      by: [field],
      where: { vendorId, status: { notIn: FREE_STATUSES }, [field]: { gte: from, lte: to } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [(g[field] as Date).getTime(), g._count._all]));
  }
}
