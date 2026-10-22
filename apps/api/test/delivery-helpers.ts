import { randomUUID } from 'node:crypto';
import { JobType, Role, RiderStatus } from '@prisma/client';
import type request from 'supertest';
import { FieldCrypto } from '../src/common/crypto/field-crypto';
import { RIDER_CNIC_CONTEXT } from '../src/modules/delivery/rider-registration.service';
import { RiderPresenceService } from '../src/modules/delivery/rider-presence.service';
import { Basics, TestApp, createUserWithToken, randomCnic } from './helpers';
import { OrderScenario } from './order-helpers';

export interface RiderOpts {
  status?: RiderStatus;
  /** Where the rider is; omit `online` to leave them offline. */
  lat?: number;
  lng?: number;
  online?: boolean;
  name?: string;
}

/** An approved, online rider (in the scenario city) standing at the given point, created straight in the database. */
export async function createRider(t: TestApp, basics: Basics, opts: RiderOpts = {}) {
  const u = await createUserWithToken(t, Role.RIDER);
  const name = opts.name ?? `Rider ${u.user.phone.slice(-4)}`;
  await t.prisma.user.update({ where: { id: u.user.id }, data: { name } });
  const crypto = t.app.get(FieldCrypto);
  const cnic = randomCnic();
  const lat = opts.lat ?? 31.52;
  const lng = opts.lng ?? 74.35;
  const online = opts.online ?? true;
  const rider = await t.prisma.rider.create({
    data: {
      userId: u.user.id,
      cityId: basics.cityId,
      status: opts.status ?? RiderStatus.APPROVED,
      cnicEnc: crypto.encrypt(cnic, RIDER_CNIC_CONTEXT),
      cnicHash: crypto.hash('cnic', cnic),
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/rider.jpg',
      photoPublicId: 'rider',
      isOnline: online,
      lastLat: lat,
      lastLng: lng,
    },
  });
  if (online) await t.app.get(RiderPresenceService).ping(rider.id, basics.cityId, lat, lng);
  return { ...u, user: { ...u.user, name }, rider, cnic };
}
export type TestRider = Awaited<ReturnType<typeof createRider>>;

/** Places an order and has the vendor accept it, so a pickup job exists. Returns the order and its jobs. */
export async function acceptedOrder<T extends { id: string }>(http: ReturnType<typeof request>, _t: TestApp, s: OrderScenario, place: () => Promise<T>): Promise<T> {
  const order = await place();
  await http.post(`/api/v1/vendor/orders/${order.id}/accept`).set(s.vendor.owner.auth).send({}).expect(200);
  return order;
}

export const jobOf = (t: TestApp, orderId: string, type: JobType) => t.prisma.deliveryJob.findUniqueOrThrow({ where: { orderId_jobType: { orderId, jobType: type } } });

/** A uuid that matches no row. */
export const nobody = () => randomUUID();
