import { OrderStatus, Prisma, ReportType } from '@prisma/client';
import { money } from '../../common/money/money';
import { localParts } from '../../common/time/zoned';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Cell, Column } from './report-formats';

export interface ReportParams {
  from: string;
  to: string;
  cityId?: number;
  vendorId?: string;
}

export interface ReportWindow extends ReportParams {
  start: Date;
  end: Date;
}

export interface ReportSource {
  title: string;
  columns: Column[];
  /** Yields rows in batches so memory stays flat however many rows there are. */
  batches(prisma: PrismaService, w: ReportWindow, batchSize: number): AsyncGenerator<Cell[][]>;
}

const TZ = 'Asia/Karachi';
const amount = (v: Prisma.Decimal.Value | null | undefined): number | null => (v === null || v === undefined ? null : Number(money(v).toFixed(2)));

/** "2026-10-24 14:05" in Pakistan time, the way an admin reads a clock. */
function stamp(d: Date | null | undefined): string | null {
  if (!d) return null;
  const p = localParts(d, TZ);
  return `${p.date} ${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`;
}

/**
 * Phones are personal data: reports show the first 4 and last 3 digits only, in the local form people write
 * (03001234567 -> 0300****567). That also keeps the cell from starting with "+", which a spreadsheet reads as a formula.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const local = phone.startsWith('+92') ? `0${phone.slice(3)}` : phone;
  return local.length <= 7 ? '*'.repeat(local.length) : `${local.slice(0, 4)}${'*'.repeat(local.length - 7)}${local.slice(-3)}`;
}

const last4 = (ref: string) => (ref.length > 4 ? `••••${ref.slice(-4)}` : '••••');

const ORDERS: ReportSource = {
  title: 'Orders',
  columns: [
    { header: 'Order no' },
    { header: 'Placed at (PKT)' },
    { header: 'City' },
    { header: 'Vendor' },
    { header: 'Customer phone' },
    { header: 'Status' },
    { header: 'Payment method' },
    { header: 'Payment status' },
    { header: 'Subtotal', kind: 'money' },
    { header: 'Discount', kind: 'money' },
    { header: 'Delivery fee', kind: 'money' },
    { header: 'Total', kind: 'money' },
    { header: 'Commission', kind: 'money' },
    { header: 'Vendor earning', kind: 'money' },
    { header: 'Delivered at (PKT)' },
  ],
  async *batches(prisma, w, size) {
    const where: Prisma.OrderWhereInput = {
      createdAt: { gte: w.start, lt: w.end },
      ...(w.cityId ? { cityId: w.cityId } : {}),
      ...(w.vendorId ? { vendorId: w.vendorId } : {}),
    };
    let cursor: string | undefined;
    for (;;) {
      const rows = await prisma.order.findMany({
        where,
        orderBy: { id: 'asc' },
        take: size,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          orderNo: true,
          createdAt: true,
          status: true,
          paymentMethod: true,
          paymentStatus: true,
          subtotal: true,
          discountTotal: true,
          deliveryFee: true,
          total: true,
          commissionAmount: true,
          vendorEarning: true,
          deliveredAt: true,
          city: { select: { name: true } },
          vendor: { select: { businessName: true } },
          customer: { select: { phone: true } },
        },
      });
      if (rows.length === 0) return;
      yield rows.map((o) => [
        o.orderNo,
        stamp(o.createdAt),
        o.city.name,
        o.vendor.businessName,
        maskPhone(o.customer.phone),
        o.status,
        o.paymentMethod,
        o.paymentStatus,
        amount(o.subtotal),
        amount(o.discountTotal),
        amount(o.deliveryFee),
        amount(o.total),
        amount(o.commissionAmount),
        amount(o.vendorEarning),
        stamp(o.deliveredAt),
      ]);
      cursor = rows.at(-1)!.id;
    }
  },
};

const PAYMENTS: ReportSource = {
  title: 'Payments',
  columns: [
    { header: 'Payment id' },
    { header: 'Order no' },
    { header: 'City' },
    { header: 'Method' },
    { header: 'Gateway' },
    { header: 'Gateway reference' },
    { header: 'Amount', kind: 'money' },
    { header: 'Status' },
    { header: 'Created at (PKT)' },
  ],
  async *batches(prisma, w, size) {
    const where: Prisma.PaymentWhereInput = {
      createdAt: { gte: w.start, lt: w.end },
      order: { ...(w.cityId ? { cityId: w.cityId } : {}), ...(w.vendorId ? { vendorId: w.vendorId } : {}) },
    };
    let cursor: string | undefined;
    for (;;) {
      const rows = await prisma.payment.findMany({
        where,
        orderBy: { id: 'asc' },
        take: size,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { order: { select: { orderNo: true, city: { select: { name: true } } } } },
      });
      if (rows.length === 0) return;
      yield rows.map((p) => [p.id, p.order.orderNo, p.order.city.name, p.method, p.gateway, p.gatewayRef, amount(p.amount), p.status, stamp(p.createdAt)]);
      cursor = rows.at(-1)!.id;
    }
  },
};

const PAYOUTS: ReportSource = {
  title: 'Payouts',
  columns: [
    { header: 'Payout id' },
    { header: 'Vendor' },
    { header: 'City' },
    { header: 'Amount', kind: 'money' },
    { header: 'Method' },
    { header: 'Account' },
    { header: 'Status' },
    { header: 'Requested at (PKT)' },
    { header: 'Processed at (PKT)' },
    { header: 'Transfer reference' },
  ],
  async *batches(prisma, w, size) {
    const where: Prisma.PayoutWhereInput = {
      requestedAt: { gte: w.start, lt: w.end },
      ...(w.vendorId ? { vendorId: w.vendorId } : {}),
      ...(w.cityId ? { vendor: { cityId: w.cityId } } : {}),
    };
    let cursor: string | undefined;
    for (;;) {
      const rows = await prisma.payout.findMany({
        where,
        orderBy: { id: 'asc' },
        take: size,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { vendor: { select: { businessName: true, city: { select: { name: true } } } } },
      });
      if (rows.length === 0) return;
      yield rows.map((p) => [p.id, p.vendor.businessName, p.vendor.city.name, amount(p.amount), p.method, last4(p.accountRef), p.status, stamp(p.requestedAt), stamp(p.processedAt), p.txnRef]);
      cursor = rows.at(-1)!.id;
    }
  },
};

const COD: ReportSource = {
  title: 'Cash collections',
  columns: [
    { header: 'Order no' },
    { header: 'City' },
    { header: 'Rider' },
    { header: 'Amount', kind: 'money' },
    { header: 'Collected at (PKT)' },
    { header: 'Deposited' },
    { header: 'Settlement id' },
    { header: 'Deposited at (PKT)' },
    { header: 'Deposit reference' },
  ],
  async *batches(prisma, w, size) {
    const where: Prisma.CodCollectionWhereInput = {
      collectedAt: { gte: w.start, lt: w.end },
      order: { ...(w.cityId ? { cityId: w.cityId } : {}), ...(w.vendorId ? { vendorId: w.vendorId } : {}) },
    };
    let cursor: string | undefined;
    for (;;) {
      const rows = await prisma.codCollection.findMany({
        where,
        orderBy: { id: 'asc' },
        take: size,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          order: { select: { orderNo: true, city: { select: { name: true } } } },
          rider: { select: { user: { select: { name: true, phone: true } } } },
          settlement: { select: { id: true, settledAt: true, reference: true } },
        },
      });
      if (rows.length === 0) return;
      yield rows.map((c) => [
        c.order.orderNo,
        c.order.city.name,
        c.rider.user.name ?? maskPhone(c.rider.user.phone),
        amount(c.amount),
        stamp(c.collectedAt),
        c.settlement ? 'Yes' : 'No',
        c.settlement?.id ?? null,
        stamp(c.settlement?.settledAt),
        c.settlement?.reference ?? null,
      ]);
      cursor = rows.at(-1)!.id;
    }
  },
};

const VENDORS: ReportSource = {
  title: 'Vendors',
  columns: [
    { header: 'Vendor' },
    { header: 'City' },
    { header: 'Status' },
    { header: 'Owner phone' },
    { header: 'Approved at (PKT)' },
    { header: 'Orders delivered', kind: 'int' },
    { header: 'Sales', kind: 'money' },
    { header: 'Commission', kind: 'money' },
    { header: 'Vendor earnings', kind: 'money' },
    { header: 'Rating' },
    { header: 'Reviews', kind: 'int' },
  ],
  async *batches(prisma, w, size) {
    const where: Prisma.VendorWhereInput = { ...(w.cityId ? { cityId: w.cityId } : {}), ...(w.vendorId ? { id: w.vendorId } : {}) };
    let cursor: string | undefined;
    for (;;) {
      const vendors = await prisma.vendor.findMany({
        where,
        orderBy: { id: 'asc' },
        take: size,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { city: { select: { name: true } }, owner: { select: { phone: true } } },
      });
      if (vendors.length === 0) return;
      const sums = await prisma.order.groupBy({
        by: ['vendorId'],
        where: { vendorId: { in: vendors.map((v) => v.id) }, status: OrderStatus.DELIVERED, deliveredAt: { gte: w.start, lt: w.end } },
        _count: { _all: true },
        _sum: { total: true, commissionAmount: true, vendorEarning: true },
      });
      const byVendor = new Map(sums.map((s) => [s.vendorId, s]));
      yield vendors.map((v) => {
        const s = byVendor.get(v.id);
        return [
          v.businessName,
          v.city.name,
          v.status,
          maskPhone(v.owner.phone),
          stamp(v.approvedAt),
          s?._count._all ?? 0,
          amount(s?._sum.total ?? 0),
          amount(s?._sum.commissionAmount ?? 0),
          amount(s?._sum.vendorEarning ?? 0),
          Number(money(v.ratingAvg).toFixed(2)),
          v.ratingCount,
        ];
      });
      cursor = vendors.at(-1)!.id;
    }
  },
};

export const REPORT_SOURCES: Record<ReportType, ReportSource> = {
  ORDERS,
  PAYMENTS,
  PAYOUTS,
  COD,
  VENDORS,
};
