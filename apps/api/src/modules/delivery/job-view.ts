import { Prisma } from '@prisma/client';
import { fmt, money } from '../../common/money/money';
import { maskPhone } from '../orders/vendor-orders.service';
import { nextJobStatuses } from './job-state-machine';

/** Everything a view of a job needs from the database. */
export const jobInclude = {
  order: {
    select: {
      id: true,
      orderNo: true,
      status: true,
      cityId: true,
      addressSnapshot: true,
      customer: { select: { name: true, phone: true } },
      vendor: { select: { businessName: true, addressLine: true, lat: true, lng: true, owner: { select: { phone: true } } } },
    },
  },
  rider: { select: { id: true, user: { select: { name: true, phone: true } } } },
} satisfies Prisma.DeliveryJobInclude;

export type JobRow = Prisma.DeliveryJobGetPayload<{ include: typeof jobInclude }>;

export interface Stop {
  role: 'CUSTOMER' | 'VENDOR';
  name: string | null;
  /** Masked: riders see enough to recognise the person, not a number to keep. */
  phone: string;
  address: string;
  lat: number;
  lng: number;
}

/** Where the rider collects and where they take it: customer -> shop for a pickup, shop -> customer for a delivery. */
export function stopsOf(job: JobRow): { from: Stop; to: Stop } {
  const o = job.order;
  const snap = o.addressSnapshot as { line1: string; line2?: string | null; area?: string | null; lat: number; lng: number };
  const customer: Stop = {
    role: 'CUSTOMER',
    name: o.customer.name,
    phone: maskPhone(o.customer.phone),
    address: [snap.line1, snap.line2, snap.area].filter(Boolean).join(', '),
    lat: snap.lat,
    lng: snap.lng,
  };
  const shop: Stop = { role: 'VENDOR', name: o.vendor.businessName, phone: maskPhone(o.vendor.owner.phone), address: o.vendor.addressLine, lat: o.vendor.lat, lng: o.vendor.lng };
  return job.jobType === 'PICKUP' ? { from: customer, to: shop } : { from: shop, to: customer };
}

/** What the rider app shows for a job. */
export function toRiderJobView(job: JobRow, extra: { offerExpiresAt?: Date | null; distanceKm?: number | null } = {}) {
  const { from, to } = stopsOf(job);
  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    order: { id: job.order.id, orderNo: job.order.orderNo, status: job.order.status },
    scheduledStart: job.scheduledStart,
    scheduledEnd: job.scheduledEnd,
    riderFee: job.riderFee ? fmt(money(job.riderFee)) : null,
    currency: 'PKR',
    from,
    to,
    ...(extra.distanceKm !== undefined ? { distanceKm: extra.distanceKm } : {}),
    offerExpiresAt: extra.offerExpiresAt ?? null,
    proof: { required: job.jobType === 'DROP', types: job.jobType === 'DROP' ? ['OTP', 'PHOTO'] : ['PHOTO'], used: job.proofType },
    failureReason: job.failureReason,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    nextActions: nextJobStatuses(job.status, 'RIDER'),
  };
}

/** What support sees on the dispatch board. */
export function toAdminJobView(job: JobRow) {
  const { from, to } = stopsOf(job);
  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    order: { id: job.order.id, orderNo: job.order.orderNo, status: job.order.status, cityId: job.order.cityId },
    rider: job.rider ? { id: job.rider.id, name: job.rider.user.name, phone: job.rider.user.phone } : null,
    partnerId: job.partnerId,
    partnerRef: job.partnerRef,
    scheduledStart: job.scheduledStart,
    scheduledEnd: job.scheduledEnd,
    riderFee: job.riderFee ? fmt(money(job.riderFee)) : null,
    from,
    to,
    dispatchAttempts: job.dispatchAttempts,
    declinedBy: job.declinedRiderIds.length,
    unassignedAlertedAt: job.unassignedAlertedAt,
    failureReason: job.failureReason,
    proofType: job.proofType,
    assignedAt: job.assignedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    nextActions: nextJobStatuses(job.status, 'ADMIN'),
  };
}
