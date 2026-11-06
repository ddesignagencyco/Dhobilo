/**
 * Realistic Lahore data for the LOCAL development database: shops in every named locality, customers, riders and
 * ~300 orders placed and advanced through the running API (so ledger, commission, history and audit rows come from
 * the product's own logic), then spread over the last 60 days.
 *
 *   npm run db:seed:lahore            # API on :4000 and Redis/Postgres up; starts nothing itself except nothing
 *
 * Idempotent: people, shops and addresses are upserted by phone / owner; orders are only added up to SEED_ORDERS.
 * All phone numbers and CNICs are synthetic series, not real people.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { type ChildProcess, spawn } from 'node:child_process';
import * as path from 'node:path';
import { Availability, DocType, OrderStatus, PrismaClient, RiderStatus, Role, VendorStatus } from '@prisma/client';
import Redis from 'ioredis';
import { FieldCrypto, parseKeyList } from '../src/common/crypto/field-crypto';
import {
  AREAS,
  type Area,
  CANCEL_REASONS,
  COMPLAINTS,
  FEMALE_FIRST,
  GARMENTS,
  HOME_STREETS,
  MALE_FIRST,
  PROMOS,
  REJECT_REASONS,
  REVIEW_COMMENTS_BAD,
  REVIEW_COMMENTS_GOOD,
  REVIEW_COMMENTS_OK,
  SHOP_DESCRIPTIONS,
  SHOP_STREETS,
  SURNAMES,
  rng,
  shopName,
} from './seed-lahore-data';

if (process.env.NODE_ENV === 'production') throw new Error('seed-lahore refuses to run when NODE_ENV=production');

const prisma = new PrismaClient();
const API = process.env.SEED_API_URL ?? 'http://localhost:4000/api/v1';
const TARGET_ORDERS = Number(process.env.SEED_ORDERS ?? 300);
const OTP = '123456';
const DAY = 86_400_000;
const pad = (n: number, w: number) => String(n).padStart(w, '0');

// ───────────────────────── crypto + people ─────────────────────────

function fieldCrypto(): FieldCrypto {
  const { ENC_KEY_ID, ENC_KEY_BASE64, HMAC_KEY_BASE64, ENC_PREVIOUS_KEYS } = process.env;
  if (!ENC_KEY_ID || !ENC_KEY_BASE64 || !HMAC_KEY_BASE64) throw new Error('ENC_KEY_* / HMAC_KEY_BASE64 must be set');
  const keys = { ...parseKeyList(ENC_PREVIOUS_KEYS), [ENC_KEY_ID]: Buffer.from(ENC_KEY_BASE64, 'base64') };
  return new FieldCrypto({ currentId: ENC_KEY_ID, keys }, Buffer.from(HMAC_KEY_BASE64, 'base64'));
}
const crypto = fieldCrypto();

const usedEmails = new Set<string>();
interface Person {
  name: string;
  first: string;
  email: string;
  female: boolean;
}
function person(kind: number, i: number, female: boolean): Person {
  const r = rng(kind * 100_003 + i * 7_919 + 11);
  const first = r.pick(female ? FEMALE_FIRST : MALE_FIRST);
  const last = r.pick(SURNAMES);
  const base = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '');
  let email = `${base}@dhoblio.local`;
  let n = 1;
  while (usedEmails.has(email)) email = `${base}${n++}@dhoblio.local`;
  usedEmails.add(email);
  return { name: `${first} ${last}`, first, email, female };
}
const refCode = (p: Person, i: number) =>
  `${p.first
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 4)
    .toUpperCase()}${pad(i, 4)}`.slice(0, 8);
const cnicOf = (prefix: string, i: number, female: boolean) => `${prefix}${pad(i, 7)}${female ? 2 : 1}`;

const phoneVendor = (i: number) => `+92301${pad(1000 + i, 7)}`;
const phoneStaff = (i: number) => `+92302${pad(1000 + i, 7)}`;
const phoneCustomer = (i: number) => `+92321${pad(1000 + i, 7)}`;
const phoneRider = (i: number) => `+92333${pad(1000 + i, 7)}`;

function jitter(r: ReturnType<typeof rng>, lat: number, lng: number, km = 0.6) {
  const d = km / 111;
  return { lat: lat + (r.next() - 0.5) * 2 * d, lng: lng + (r.next() - 0.5) * 2 * d };
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ───────────────────────── phase A: scrub + people + shops ─────────────────────────

/** Existing dev accounts keep their phone numbers (logins keep working) but get real names. */
const RENAMES = [
  { phone: '+923000000001', name: 'Hira Fatima', email: 'hira.fatima@dhoblio.local', ref: 'HIRA0001' },
  { phone: '+923000000011', name: 'Usman Ghani', email: 'usman.ghani@dhoblio.local', ref: 'USMA0011' },
  { phone: '+923000000012', name: 'Syed Asif Raza', email: 'asif.raza@dhoblio.local', ref: 'ASIF0012' },
  { phone: '+923000000013', name: 'Tariq Mehmood', email: 'tariq.mehmood@dhoblio.local', ref: 'TARI0013' },
  { phone: '+923000000019', name: 'Rana Imtiaz Ahmad', email: 'imtiaz.ahmad@dhoblio.local', ref: 'RANA0019' },
  { phone: '+923000000021', name: 'Rizwan Akhtar', email: 'rizwan.akhtar@dhoblio.local', ref: 'RIZW0021' },
  { phone: '+923000000031', name: 'Kashif Ali', email: 'kashif.ali@dhoblio.local', ref: 'KASH0031' },
];
const SHOP_RENAMES = [
  { phone: '+923000000011', name: 'Al-Karam Dry Cleaners', addr: 'Shop 12, Main Boulevard, Gulberg III, Lahore', area: 'Gulberg III' },
  { phone: '+923000000012', name: 'Burns Road Dry Cleaners', addr: 'Shop 5, Burns Road, Saddar, Karachi', area: 'Saddar' },
  { phone: '+923000000013', name: 'F-7 Markaz Laundry', addr: 'Shop 9, Jinnah Super Market, F-7 Markaz, Islamabad', area: 'F-7' },
  { phone: '+923000000019', name: 'Gulshan Steam Press', addr: 'Shop 3, Main Market, Gulberg II, Lahore', area: 'Gulberg II' },
];

async function scrubDemoNames() {
  for (const r of RENAMES) {
    const user = await prisma.user.findUnique({ where: { phone: r.phone } });
    if (!user || !/demo/i.test(`${user.name ?? ''} ${user.email ?? ''} ${user.referralCode ?? ''}`)) continue;
    await prisma.user.update({ where: { id: user.id }, data: { name: r.name, email: r.email, referralCode: r.ref } });
  }
  for (const s of SHOP_RENAMES) {
    const v = await prisma.vendor.findFirst({ where: { owner: { phone: s.phone } } });
    if (!v || !/demo/i.test(`${v.businessName} ${v.description ?? ''}`)) continue;
    await prisma.vendor.update({
      where: { id: v.id },
      data: { businessName: s.name, addressLine: s.addr, description: SHOP_DESCRIPTIONS[s.phone.length % SHOP_DESCRIPTIONS.length] },
    });
    for (const d of await prisma.vendorDocument.findMany({ where: { vendorId: v.id } })) {
      await prisma.vendorDocument.update({
        where: { id: d.id },
        data: {
          publicId: `dhoblio/seed/${v.id}/${d.type.toLowerCase()}`,
          url: `https://res.cloudinary.com/dhoblio/image/upload/seed/${v.id}/${d.type.toLowerCase()}.jpg`,
        },
      });
    }
  }
}

interface ShopPlan {
  idx: number;
  area: Area;
  status: VendorStatus;
  /** Edge-of-city shop: serves a wider radius so outer areas still see several shops. */
  wide?: boolean;
}

function shopPlans(): ShopPlan[] {
  const plans: ShopPlan[] = [];
  let idx = 0;
  for (const area of AREAS) for (let j = 0; j < area.shops; j++) plans.push({ idx: idx++, area, status: VendorStatus.APPROVED });
  const r = rng(424242);
  const extraAreas = r.shuffle(AREAS).slice(0, 8);
  const extraStatuses = [
    VendorStatus.PENDING,
    VendorStatus.PENDING,
    VendorStatus.PENDING,
    VendorStatus.PENDING,
    VendorStatus.PENDING,
    VendorStatus.REJECTED,
    VendorStatus.REJECTED,
    VendorStatus.SUSPENDED,
  ];
  extraAreas.forEach((area, i) => plans.push({ idx: idx++, area, status: extraStatuses[i] }));
  // Appended last so the indices (and therefore phone numbers) of every shop above stay put on re-runs.
  const edge = [
    'Shahdara',
    'Shahdara',
    'Kahna',
    'Kahna',
    'Defence Raya',
    'Park View',
    'Lake City',
    'Raiwind Road',
    'Valencia Town',
    'Hamza Town',
    'Ravi Road',
    'Gulshan-e-Ravi',
    'Bahria Town',
    'Askari 11',
  ];
  for (const name of edge) plans.push({ idx: idx++, area: AREAS.find((a) => a.name === name)!, status: VendorStatus.APPROVED, wide: true });
  return plans;
}

const REJECT_NOTES = [
  'The CNIC photo is blurry. Please upload a clear one.',
  'Shop photos do not show the signboard. Please resubmit with the front of the shop.',
];
const SUSPEND_NOTE = 'Repeated customer complaints about damaged items.';

async function seedShops(categories: Map<string, number>, lahoreId: number) {
  const plans = shopPlans();
  const staffEvery = 5;
  let created = 0;
  for (const p of plans) {
    const r = rng(9_000_000 + p.idx);
    const owner = person(1, p.idx, false);
    const staffPerson = p.idx % staffEvery === 0 ? person(2, p.idx, false) : null;
    const phone = phoneVendor(p.idx);
    const exists = await prisma.user.findUnique({ where: { phone }, include: { vendorOwned: true } });
    if (exists?.vendorOwned) continue;
    const userRow =
      exists ??
      (await prisma.user.create({
        data: {
          phone,
          email: owner.email,
          name: owner.name,
          role: Role.VENDOR_OWNER,
          phoneVerifiedAt: new Date(),
          referralCode: refCode(owner, 2000 + p.idx),
          locale: r.chance(0.2) ? 'UR' : 'EN',
        },
      }));
    created++;
    const pos = jitter(r, p.area.lat, p.area.lng);
    const cnic = cnicOf('35201', p.idx + 1, false);
    const approved = p.status === VendorStatus.APPROVED;
    const hourKind = r.next();
    const vendor = await prisma.vendor.create({
      data: {
        ownerId: userRow.id,
        cityId: lahoreId,
        businessName: shopName(p.idx, p.area.name, r),
        description: r.pick(SHOP_DESCRIPTIONS),
        addressLine: `Shop ${r.int(1, 48)}, ${r.pick(SHOP_STREETS)}, ${p.area.name}, Lahore`,
        lat: pos.lat,
        lng: pos.lng,
        cnicEnc: crypto.encrypt(cnic, 'vendor.cnic'),
        cnicHash: crypto.hash('cnic', cnic),
        status: p.status,
        rejectionReason:
          p.status === VendorStatus.REJECTED
            ? REJECT_NOTES[p.idx % REJECT_NOTES.length]
            : p.status === VendorStatus.SUSPENDED
              ? SUSPEND_NOTE
              : null,
        ...(approved || p.status === VendorStatus.SUSPENDED ? { approvedAt: new Date(Date.now() - r.int(20, 200) * DAY) } : {}),
        availability: approved ? Availability.OPEN : Availability.CLOSED,
        serviceRadiusKm: p.wide ? 6 : r.pick([4, 5, 5, 5, 6]),
        respondWithinMin: r.pick([10, 15, 15, 20, 30]),
        slotCapacity: r.pick([6, 8, 10, 10, 12]),
        createdAt: new Date(Date.now() - r.int(25, 220) * DAY),
      },
    });
    await prisma.vendorDocument.createMany({
      data: [DocType.CNIC_FRONT, DocType.CNIC_BACK, DocType.SHOP_PHOTO].map((type) => ({
        vendorId: vendor.id,
        type,
        publicId: `dhoblio/seed/${vendor.id}/${type.toLowerCase()}`,
        url: `https://res.cloudinary.com/dhoblio/image/upload/seed/${vendor.id}/${type.toLowerCase()}.jpg`,
        ...(approved ? { verifiedAt: new Date() } : {}),
      })),
    });
    if (!approved) continue;

    const hours =
      hourKind < 0.12
        ? { o: 0, c: 1440 }
        : hourKind < 0.45
          ? { o: 540, c: 1260 }
          : hourKind < 0.75
            ? { o: 600, c: 1320 }
            : { o: 480, c: 1200 };
    await prisma.vendorHours.createMany({
      data: [0, 1, 2, 3, 4, 5, 6]
        .filter((d) => !(d === 0 && hours.o !== 0 && r.chance(0.35)))
        .map((d) =>
          d === 5 && hours.o !== 0 && r.chance(0.5)
            ? { vendorId: vendor.id, dayOfWeek: d, opensAt: 870, closesAt: hours.c }
            : { vendorId: vendor.id, dayOfWeek: d, opensAt: hours.o, closesAt: hours.c },
        ),
    });

    const picks = r.shuffle(GARMENTS).slice(0, r.int(12, 18));
    await prisma.serviceItem.createMany({
      data: picks.map((g) => ({
        vendorId: vendor.id,
        categoryId: categories.get(g.category)!,
        itemName: g.name,
        itemNameUr: g.nameUr,
        serviceType: g.type,
        price: Math.max(30, Math.round((g.price * p.area.tier * (0.9 + r.next() * 0.25)) / 10) * 10),
        turnaroundHours: g.hours,
      })),
      skipDuplicates: true,
    });

    if (staffPerson) {
      const sp = staffPerson;
      const staff = await prisma.user.create({
        data: {
          phone: phoneStaff(p.idx),
          email: sp.email,
          name: sp.name,
          role: Role.VENDOR_STAFF,
          phoneVerifiedAt: new Date(),
          referralCode: refCode(sp, 3000 + p.idx),
        },
      });
      await prisma.vendorStaff.create({ data: { vendorId: vendor.id, userId: staff.id } });
    }
  }
  return created;
}

const HOME_LABELS = ['Home', 'Home', 'Office', 'Parents'];

function homeAddress(area: Area, r: ReturnType<typeof rng>) {
  const house = `${r.int(1, 480)}${r.pick(['', '', '-A', '-B', '-C'])}`;
  const street = `${r.pick(HOME_STREETS)} ${r.int(1, 40)}`;
  const block = /Phase|DHA|Bahria|Town|Society|Housing/.test(area.name) ? `Block ${r.pick(['A', 'B', 'C', 'D', 'E', 'F', 'K'])}, ` : '';
  const pos = jitter(r, area.lat, area.lng, 0.8);
  return { line1: `House ${house}, ${street}`, line2: block ? block.replace(/, $/, '') : null, area: area.name, ...pos };
}

async function seedCustomers(lahoreId: number) {
  const weighted: Area[] = AREAS.flatMap((a) => Array.from({ length: a.weight }, () => a));
  let created = 0;
  for (let i = 0; i < 80; i++) {
    const phone = phoneCustomer(i);
    const r = rng(7_000_000 + i);
    const female = r.chance(0.5);
    const p = person(3, i, female);
    if (await prisma.user.findUnique({ where: { phone } })) continue;
    const user = await prisma.user.create({
      data: {
        phone,
        name: p.name,
        email: r.chance(0.55) ? p.email : null,
        role: Role.CUSTOMER,
        phoneVerifiedAt: new Date(),
        referralCode: refCode(p, 4000 + i),
        locale: r.chance(0.25) ? 'UR' : 'EN',
        createdAt: new Date(Date.now() - r.int(10, 150) * DAY),
      },
    });
    const home = r.pick(weighted);
    const n = r.chance(0.4) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const area = k === 0 ? home : r.pick(weighted);
      const a = homeAddress(area, r);
      await prisma.address.create({
        data: {
          userId: user.id,
          label: k === 0 ? 'Home' : r.pick(HOME_LABELS.slice(2)),
          line1: a.line1,
          line2: a.line2,
          area: a.area,
          cityId: lahoreId,
          lat: a.lat,
          lng: a.lng,
          isDefault: k === 0,
        },
      });
    }
    created++;
  }
  return created;
}

async function seedRiders(lahoreId: number) {
  let created = 0;
  for (let i = 0; i < 20; i++) {
    const phone = phoneRider(i);
    const r = rng(5_000_000 + i);
    const p = person(4, i, false);
    if (await prisma.user.findUnique({ where: { phone } })) continue;
    const user = await prisma.user.create({
      data: { phone, name: p.name, email: p.email, role: Role.RIDER, phoneVerifiedAt: new Date(), referralCode: refCode(p, 5000 + i) },
    });
    const area = r.pick(AREAS);
    const pos = jitter(r, area.lat, area.lng, 1.2);
    const status = i >= 18 ? RiderStatus.PENDING : i === 17 ? RiderStatus.SUSPENDED : RiderStatus.APPROVED;
    const cnic = cnicOf('35202', i + 1, false);
    await prisma.rider.create({
      data: {
        userId: user.id,
        cityId: lahoreId,
        status,
        cnicEnc: crypto.encrypt(cnic, 'rider.cnic'),
        cnicHash: crypto.hash('cnic', cnic),
        isOnline: status === RiderStatus.APPROVED && r.chance(0.8),
        lastLat: pos.lat,
        lastLng: pos.lng,
        lastSeenAt: new Date(),
        ...(status === RiderStatus.APPROVED ? { approvedAt: new Date(Date.now() - r.int(10, 120) * DAY) } : {}),
        rejectionReason: status === RiderStatus.SUSPENDED ? 'Customer reports of late deliveries.' : null,
      },
    });
    created++;
  }
  // The long-standing dev rider keeps working and sits in a real area.
  await prisma.rider.updateMany({ where: { user: { phone: '+923000000021' } }, data: { lastLat: 31.5125, lastLng: 74.3455 } });
  return created;
}

// ───────────────────────── phase B: API driver ─────────────────────────

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
let calls = 0;
async function clearRateLimits() {
  const keys = await redis.keys('rl:*');
  if (keys.length) await redis.del(...keys);
}

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: unknown,
  ) {
    super(`${status} ${code}: ${message}`);
  }
}
async function http<T = any>(
  method: string,
  p: string,
  o: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ data: T; meta?: any }> {
  if (++calls % 60 === 0) await clearRateLimits();
  const res = await fetch(`${API}${p}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-token-transport': 'body',
      ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
      ...o.headers,
    },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'ERR', json?.error?.message ?? res.statusText, json);
  return { data: json?.data, meta: json?.meta };
}

const tokens = new Map<string, { token: string; at: number }>();
async function login(phone: string, role: string): Promise<string> {
  const c = tokens.get(phone);
  if (c && Date.now() - c.at < 9 * 60_000) return c.token;
  await clearRateLimits();
  await http('POST', '/auth/otp/request', { body: { phone } });
  const { data } = await http<{ accessToken: string }>('POST', '/auth/otp/verify', { body: { phone, code: OTP, role } });
  tokens.set(phone, { token: data.accessToken, at: Date.now() });
  return data.accessToken;
}
async function adminToken(): Promise<string> {
  const c = tokens.get('admin');
  if (c && Date.now() - c.at < 9 * 60_000) return c.token;
  const { data } = await http<{ accessToken: string }>('POST', '/auth/admin/login', {
    body: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@dhoblio.local', password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!12345' },
    headers: { 'x-token-transport': 'body' },
  });
  tokens.set('admin', { token: data.accessToken, at: Date.now() });
  return data.accessToken;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function localDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

let worker: ChildProcess | null = null;
function startWorker() {
  const root = path.resolve(__dirname, '..');
  worker = spawn('node', ['--env-file=../../.env', 'dist/worker.js'], { cwd: root, stdio: 'ignore', env: { ...process.env } });
  worker.on('error', (e) => console.warn('worker failed to start', e));
}
function stopWorker() {
  worker?.kill('SIGTERM');
  worker = null;
}

// ── Opening hours: ordering needs the shop open *now*, so hours are widened to 24h while the seed runs and put
// back from a snapshot afterwards. Slots are still only chosen inside each shop's real hours.
const HOURS_SNAPSHOT = path.join(os.tmpdir(), 'dhoblio-seed-lahore-hours.json');
type DayHours = Record<number, { o: number; c: number }>;
const realHours = new Map<string, DayHours>();

async function widenHours() {
  const rows = await prisma.vendorHours.findMany({ where: { vendor: { owner: { phone: { startsWith: '+92301' } } } } });
  if (!fs.existsSync(HOURS_SNAPSHOT)) fs.writeFileSync(HOURS_SNAPSHOT, JSON.stringify(rows));
  const snap: typeof rows = JSON.parse(fs.readFileSync(HOURS_SNAPSHOT, 'utf8'));
  for (const h of snap) {
    const d = realHours.get(h.vendorId) ?? {};
    d[h.dayOfWeek] = { o: h.opensAt, c: h.closesAt };
    realHours.set(h.vendorId, d);
  }
  const ids = [...new Set(snap.map((h) => h.vendorId))];
  await prisma.vendorHours.deleteMany({ where: { vendorId: { in: ids } } });
  await prisma.vendorHours.createMany({
    data: ids.flatMap((vendorId) => [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ vendorId, dayOfWeek, opensAt: 0, closesAt: 1440 }))),
  });
}

async function restoreHours() {
  if (!fs.existsSync(HOURS_SNAPSHOT)) return;
  const snap: { vendorId: string; dayOfWeek: number; opensAt: number; closesAt: number }[] = JSON.parse(
    fs.readFileSync(HOURS_SNAPSHOT, 'utf8'),
  );
  const ids = [...new Set(snap.map((h) => h.vendorId))];
  await prisma.vendorHours.deleteMany({ where: { vendorId: { in: ids } } });
  await prisma.vendorHours.createMany({
    data: snap.map((h) => ({ vendorId: h.vendorId, dayOfWeek: h.dayOfWeek, opensAt: h.opensAt, closesAt: h.closesAt })),
  });
  fs.unlinkSync(HOURS_SNAPSHOT);
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function localMinutes(d: Date): { day: number; min: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)!.value;
  return { day: WEEKDAY[get('weekday')], min: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}
/** True when the whole slot sits inside the shop's real opening hours that day. */
function insideRealHours(vendorId: string, slot: Slot): boolean {
  const h = realHours.get(vendorId);
  if (!h) return true;
  const a = localMinutes(new Date(slot.start));
  const b = localMinutes(new Date(slot.end));
  const day = h[a.day];
  return !!day && a.min >= day.o && (b.min === 0 ? 1440 : b.min) <= day.c && a.min >= 600 && a.min <= 1140;
}

type Target =
  | 'DELIVERED'
  | 'CANCELLED_PLACED'
  | 'CANCELLED_ACCEPTED'
  | 'REJECTED'
  | 'PLACED'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'IN_PROCESS'
  | 'READY'
  | 'OUT_FOR_DELIVERY';
interface Plan {
  n: number;
  target: Target;
  /** Days ago the order finished (terminal) or reached its current stage (in flight). */
  daysAgo: number;
}

function buildPlan(total: number): Plan[] {
  const r = rng(123456);
  const mix: [Target, number][] = [
    ['DELIVERED', 0.633],
    ['CANCELLED_PLACED', 0.04],
    ['CANCELLED_ACCEPTED', 0.027],
    ['REJECTED', 0.047],
    ['PLACED', 0.033],
    ['ACCEPTED', 0.04],
    ['PICKED_UP', 0.05],
    ['IN_PROCESS', 0.05],
    ['READY', 0.04],
    ['OUT_FOR_DELIVERY', 0.04],
  ];
  const plans: Plan[] = [];
  for (const [target, share] of mix) {
    const count = Math.max(1, Math.round(total * share));
    for (let i = 0; i < count; i++) {
      const terminal = target === 'DELIVERED' || target.startsWith('CANCELLED') || target === 'REJECTED';
      const daysAgo = terminal ? Math.max(1, Math.floor(60 * Math.pow(r.next(), 1.5))) : 0;
      plans.push({ n: 0, target, daysAgo });
    }
  }
  plans.sort((a, b) => b.daysAgo - a.daysAgo);
  plans.forEach((p, i) => (p.n = i));
  return plans.slice(0, total);
}

interface Ctx {
  vendors: {
    id: string;
    ownerPhone: string;
    lat: number;
    lng: number;
    radius: number;
    name: string;
    items: { id: string; price: number; turnaround: number }[];
  }[];
  customers: { id: string; phone: string; addr: { id: string; lat: number; lng: number } }[];
  riders: { id: string; userId: string; phone: string; lat: number; lng: number }[];
}

async function loadCtx(): Promise<Ctx> {
  const vendors = await prisma.vendor.findMany({
    where: {
      status: VendorStatus.APPROVED,
      city: { name: 'Lahore' },
      owner: { phone: { startsWith: '+92301' } },
      items: { some: {} },
      hours: { some: {} },
    },
    include: { owner: true, items: { where: { isActive: true, deletedAt: null } } },
  });
  const demo = await prisma.vendor.findMany({
    where: { status: VendorStatus.APPROVED, city: { name: 'Lahore' }, owner: { phone: { in: ['+923000000011'] } }, items: { some: {} } },
    include: { owner: true, items: { where: { isActive: true, deletedAt: null } } },
  });
  const all = [...vendors, ...demo];
  await prisma.vendor.updateMany({ where: { id: { in: all.map((v) => v.id) } }, data: { availability: Availability.OPEN } });
  const customers = await prisma.user.findMany({
    where: { role: Role.CUSTOMER, OR: [{ phone: { startsWith: '+92321' } }, { phone: '+923000000001' }] },
    include: { addresses: { where: { deletedAt: null }, orderBy: { isDefault: 'desc' } } },
  });
  await prisma.rider.updateMany({
    where: { status: RiderStatus.APPROVED, user: { OR: [{ phone: { startsWith: '+92333' } }, { phone: '+923000000021' }] } },
    data: { isOnline: true, lastSeenAt: new Date() },
  });
  const riders = await prisma.rider.findMany({
    where: {
      status: RiderStatus.APPROVED,
      user: { OR: [{ phone: { startsWith: '+92333' } }, { phone: '+923000000021' }] },
      lastLat: { not: null },
    },
    include: { user: true },
  });
  return {
    vendors: all.map((v) => ({
      id: v.id,
      ownerPhone: v.owner.phone,
      lat: v.lat,
      lng: v.lng,
      radius: Number(v.serviceRadiusKm) - 0.2,
      name: v.businessName,
      items: v.items.map((i) => ({ id: i.id, price: Number(i.price), turnaround: i.turnaroundHours })),
    })),
    customers: customers
      .filter((c) => c.addresses.length)
      .map((c) => ({ id: c.id, phone: c.phone, addr: { id: c.addresses[0].id, lat: c.addresses[0].lat, lng: c.addresses[0].lng } })),
    riders: riders.map((x) => ({ id: x.id, userId: x.userId, phone: x.user.phone, lat: x.lastLat!, lng: x.lastLng! })),
  };
}

interface Slot {
  start: string;
  end: string;
  available: boolean;
}
async function slotsFor(vendorId: string, qs: string): Promise<Slot[]> {
  const { data } = await http<{ slots: Slot[] }>('GET', `/vendors/${vendorId}/slots?${qs}`);
  return data.slots.filter((s) => s.available);
}

interface PlacedOrder {
  id: string;
  orderNo: string;
  vendorId: string;
  ownerPhone: string;
  customerPhone: string;
  customerId: string;
  pickupStart: Date;
  pickupEnd: Date;
  deliveryStart: Date;
  deliveryEnd: Date;
}

async function placeOrder(ctx: Ctx, r: ReturnType<typeof rng>): Promise<PlacedOrder | null> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const cust = r.pick(ctx.customers);
    const near = ctx.vendors.filter((v) => haversineKm(v.lat, v.lng, cust.addr.lat, cust.addr.lng) <= v.radius);
    if (!near.length) continue;
    const vendor = r.pick(near);
    const lines: { serviceItemId: string; qty: number }[] = [];
    let running = 0;
    for (const it of r.shuffle(vendor.items).slice(0, r.int(1, 4))) {
      const qty = r.int(1, it.price > 1000 ? 2 : 4);
      if (running + it.price * qty > 6500) continue;
      running += it.price * qty;
      lines.push({ serviceItemId: it.id, qty });
    }
    if (!lines.length) continue;
    const token = await login(cust.phone, 'CUSTOMER');
    try {
      const est = await http<{ total: string; maxTurnaroundHours: number; warnings?: string[] }>('POST', '/cart/estimate', {
        token,
        body: { vendorId: vendor.id, items: lines },
      });
      if (est.data.warnings?.length) continue;
      const today = new Date();
      let pickup: Slot | undefined;
      for (const off of r.shuffle([0, 1, 2, 3])) {
        const day = localDate(new Date(today.getTime() + off * DAY));
        const open = (await slotsFor(vendor.id, `date=${day}&type=pickup`)).filter((s) => insideRealHours(vendor.id, s));
        if (open.length) {
          pickup = r.pick(open);
          break;
        }
      }
      if (!pickup) continue;
      const earliest = new Date(new Date(pickup.end).getTime() + est.data.maxTurnaroundHours * 3_600_000);
      let delivery: Slot | undefined;
      for (const off of r.shuffle([0, 1, 2])) {
        const day = localDate(new Date(earliest.getTime() + off * DAY));
        const open = (
          await slotsFor(
            vendor.id,
            `date=${day}&type=delivery&turnaroundHours=${est.data.maxTurnaroundHours}&pickupEnd=${encodeURIComponent(pickup.end)}`,
          )
        ).filter((s) => insideRealHours(vendor.id, s));
        if (open.length) {
          delivery = r.pick(open);
          break;
        }
      }
      if (!delivery) continue;
      const placed = await http<{ id: string; orderNo: string }>('POST', '/orders', {
        token,
        headers: { 'idempotency-key': randomUUID() },
        body: {
          vendorId: vendor.id,
          addressId: cust.addr.id,
          items: lines,
          pickupSlotStart: pickup.start,
          deliverySlotStart: delivery.start,
          paymentMethod: 'COD',
          expectedTotal: est.data.total,
          ...(r.chance(0.18)
            ? {
                customerNote: r.pick([
                  'Please call before arriving.',
                  'Handle the embroidered dupatta with care.',
                  'Ring the bell twice, thanks.',
                  'Fold the shirts, do not hang.',
                ]),
              }
            : {}),
        },
      });
      return {
        id: placed.data.id,
        orderNo: placed.data.orderNo,
        vendorId: vendor.id,
        ownerPhone: vendor.ownerPhone,
        customerPhone: cust.phone,
        customerId: cust.id,
        pickupStart: new Date(pickup.start),
        pickupEnd: new Date(pickup.end),
        deliveryStart: new Date(delivery.start),
        deliveryEnd: new Date(delivery.end),
      };
    } catch (e) {
      if (
        e instanceof ApiError &&
        ['SLOT_FULL', 'SLOT_UNAVAILABLE', 'PRICE_CHANGED', 'OUT_OF_RADIUS', 'VENDOR_UNAVAILABLE'].includes(e.code)
      )
        continue;
      if (e instanceof ApiError && e.status === 422) continue;
      throw e;
    }
  }
  return null;
}

async function waitForJob(orderId: string, type: 'PICKUP' | 'DROP') {
  for (let i = 0; i < 40; i++) {
    const job = await prisma.deliveryJob.findFirst({
      where: { orderId, jobType: type, status: { in: ['UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'IN_TRANSIT'] } },
    });
    if (job) return job;
    await sleep(150);
  }
  throw new Error(`no ${type} job appeared for order ${orderId}`);
}

function nearestRiders(ctx: Ctx, lat: number, lng: number) {
  return [...ctx.riders].sort((a, b) => haversineKm(a.lat, a.lng, lat, lng) - haversineKm(b.lat, b.lng, lat, lng)).slice(0, 4);
}

/** Runs one delivery leg (claim -> start -> complete) as a rider, honouring an offer the dispatcher already made. */
async function runLeg(ctx: Ctx, order: PlacedOrder, type: 'PICKUP' | 'DROP', r: ReturnType<typeof rng>, finish: boolean) {
  let job = await waitForJob(order.id, type);
  const vendor = ctx.vendors.find((v) => v.id === order.vendorId)!;
  let rider = job.riderId ? ctx.riders.find((x) => x.id === job.riderId) : undefined;
  if (!rider) rider = r.pick(nearestRiders(ctx, vendor.lat, vendor.lng));
  const token = await login(rider.phone, 'RIDER');
  const fresh = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: job.id } });
  if (fresh.status === 'UNASSIGNED') await http('POST', `/rider/jobs/${job.id}/claim`, { token });
  else if (fresh.status === 'ASSIGNED') await http('POST', `/rider/jobs/${job.id}/accept`, { token });
  if (!finish) return;
  await http('POST', `/rider/jobs/${job.id}/start`, { token, body: { lat: rider.lat, lng: rider.lng } });
  if (type === 'DROP') {
    const code = String(r.int(1000, 9999));
    await prisma.deliveryJob.update({
      where: { id: job.id },
      data: {
        proofOtpHash: crypto.hash('delivery-otp', `${job.id}:${code}`),
        proofOtpExpiresAt: new Date(Date.now() + DAY),
        proofOtpAttempts: 0,
      },
    });
    await http('POST', `/rider/jobs/${job.id}/complete`, { token, body: { otp: code } });
  } else {
    await http('POST', `/rider/jobs/${job.id}/complete`, { token, body: {} });
  }
  job = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: job.id } });
}

async function vendorStatus(order: PlacedOrder, status: string) {
  const token = await login(order.ownerPhone, 'VENDOR_OWNER');
  await http('POST', `/vendor/orders/${order.id}/status`, { token, body: { status } });
}

async function drive(ctx: Ctx, order: PlacedOrder, target: Target, r: ReturnType<typeof rng>) {
  const ownerToken = await login(order.ownerPhone, 'VENDOR_OWNER');
  if (target === 'PLACED') return;
  if (target === 'REJECTED') {
    await http('POST', `/vendor/orders/${order.id}/reject`, { token: ownerToken, body: { reason: r.pick(REJECT_REASONS) } });
    return;
  }
  if (target === 'CANCELLED_PLACED') {
    const t = await login(order.customerPhone, 'CUSTOMER');
    await http('POST', `/orders/${order.id}/cancel`, { token: t, body: { reason: r.pick(CANCEL_REASONS) } });
    return;
  }
  await http('POST', `/vendor/orders/${order.id}/accept`, { token: ownerToken, body: {} });
  if (target === 'ACCEPTED') return;
  if (target === 'CANCELLED_ACCEPTED') {
    const t = await login(order.customerPhone, 'CUSTOMER');
    await http('POST', `/orders/${order.id}/cancel`, { token: t, body: { reason: r.pick(CANCEL_REASONS) } });
    return;
  }
  await runLeg(ctx, order, 'PICKUP', r, true);
  if (target === 'PICKED_UP') return;
  await vendorStatus(order, 'IN_PROCESS');
  if (target === 'IN_PROCESS') return;
  await vendorStatus(order, 'READY');
  if (target === 'READY') return;
  if (target === 'OUT_FOR_DELIVERY') {
    await runLeg(ctx, order, 'DROP', r, false);
    const job = await prisma.deliveryJob.findFirstOrThrow({ where: { orderId: order.id, jobType: 'DROP' } });
    const rider = ctx.riders.find((x) => x.id === job.riderId)!;
    await http('POST', `/rider/jobs/${job.id}/start`, {
      token: await login(rider.phone, 'RIDER'),
      body: { lat: rider.lat, lng: rider.lng },
    });
    return;
  }
  await runLeg(ctx, order, 'DROP', r, true);
}

// ───────────────────────── backdating ─────────────────────────

const rnd = (r: ReturnType<typeof rng>, a: number, b: number) => a + r.next() * (b - a);
const min = (n: number) => n * 60_000;

/** Spread a set of rows (already in creation order) evenly-ish between two instants, keeping their order. */
function spread(count: number, from: Date, to: Date): Date[] {
  const span = Math.max(to.getTime() - from.getTime(), count * 1000);
  return Array.from({ length: count }, (_, i) => new Date(from.getTime() + (span * (i + 1)) / (count + 1)));
}

/**
 * Shifts one finished order (and everything the API wrote for it) back in time by whole days, then lays its events
 * out realistically around the slots. Runs with triggers off for this transaction only: the history, ledger and
 * audit tables are append-only for the app, and a seed that must create history is the one legitimate exception.
 */
async function backdate(order: PlacedOrder, shiftDays: number, r: ReturnType<typeof rng>) {
  const full = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: {
      history: { orderBy: { seq: 'asc' } },
      jobs: true,
      vendor: { select: { respondWithinMin: true } },
      cod: true,
      payments: true,
    },
  });
  const sh = shiftDays * DAY;
  const pStart = new Date(full.pickupSlotStart.getTime() - sh);
  const pEnd = new Date(full.pickupSlotEnd.getTime() - sh);
  const dStart = new Date(full.deliverySlotStart.getTime() - sh);
  const dEnd = new Date(full.deliverySlotEnd.getTime() - sh);
  const now = Date.now();
  const placed = new Date(pStart.getTime() - rnd(r, 1.5, 20) * 3_600_000);
  const accepted = new Date(placed.getTime() + min(rnd(r, 3, 12)));
  const pickupStarted = new Date(pStart.getTime() + min(rnd(r, 5, 30)));
  const pickedUp = new Date(pickupStarted.getTime() + min(rnd(r, 8, 25)));
  const inProcess = new Date(pickedUp.getTime() + min(rnd(r, 20, 90)));
  const readyCand = dStart.getTime() - rnd(r, 1.5, 6) * 3_600_000;
  const ready = new Date(Math.max(readyCand, inProcess.getTime() + 3_600_000));
  const dropStarted = new Date(dStart.getTime() + min(rnd(r, 3, 25)));
  const delivered = new Date(dropStarted.getTime() + min(rnd(r, 10, 40)));
  const at: Record<string, Date> = {
    PLACED: placed,
    ACCEPTED: accepted,
    REJECTED: new Date(placed.getTime() + min(rnd(r, 4, 14))),
    CANCELLED: new Date(placed.getTime() + min(rnd(r, 10, 240))),
    PICKED_UP: pickedUp,
    IN_PROCESS: inProcess,
    READY: ready,
    OUT_FOR_DELIVERY: dropStarted,
    DELIVERED: delivered,
  };
  const cap = (d: Date) => new Date(Math.min(d.getTime(), now - 60_000));
  const lastEvent = cap(at[full.status] ?? placed);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.order.update({
        where: { id: full.id },
        data: {
          pickupSlotStart: pStart,
          pickupSlotEnd: pEnd,
          deliverySlotStart: dStart,
          deliverySlotEnd: dEnd,
          placedAt: placed,
          createdAt: placed,
          vendorRespondBy: new Date(placed.getTime() + full.vendor.respondWithinMin * 60_000),
          acceptedAt: full.acceptedAt ? accepted : null,
          pickedUpAt: full.pickedUpAt ? pickedUp : null,
          readyAt: full.readyAt ? ready : null,
          deliveredAt: full.deliveredAt ? delivered : null,
          updatedAt: lastEvent,
        },
      });
      for (const h of full.history) {
        const t = h.toStatus === 'PLACED' ? placed : (at[h.toStatus] ?? placed);
        await tx.orderStatusHistory.update({ where: { id: h.id }, data: { createdAt: cap(t) } });
      }
      for (const j of full.jobs) {
        const isPick = j.jobType === 'PICKUP';
        const created = isPick ? accepted : new Date(ready.getTime());
        const assigned = new Date(created.getTime() + min(rnd(r, 4, 18)));
        await tx.deliveryJob.update({
          where: { id: j.id },
          data: {
            scheduledStart: isPick ? pStart : dStart,
            scheduledEnd: isPick ? pEnd : dEnd,
            createdAt: cap(created),
            assignedAt: j.assignedAt ? cap(assigned) : null,
            startedAt: j.startedAt ? cap(isPick ? pickupStarted : dropStarted) : null,
            completedAt: j.completedAt ? cap(isPick ? pickedUp : delivered) : null,
            updatedAt: cap(isPick ? pickedUp : delivered),
            ...(j.proofOtpExpiresAt ? { proofOtpExpiresAt: new Date(delivered.getTime() + DAY) } : {}),
          },
        });
      }
      for (const pay of full.payments)
        await tx.payment.update({
          where: { id: pay.id },
          data: { createdAt: placed, updatedAt: cap(full.deliveredAt ? delivered : placed) },
        });
      if (full.cod) await tx.codCollection.update({ where: { id: full.cod.id }, data: { collectedAt: cap(delivered) } });

      const audits = await tx.auditLog.findMany({ where: { entityId: full.id }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      const auditTimes = spread(audits.length, placed, lastEvent);
      for (let i = 0; i < audits.length; i++) await tx.auditLog.update({ where: { id: audits[i].id }, data: { createdAt: auditTimes[i] } });

      const notes = await tx.notification.findMany({
        where: { payload: { path: ['orderNo'], equals: full.orderNo } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, sentAt: true },
      });
      const noteTimes = spread(notes.length, placed, lastEvent);
      for (let i = 0; i < notes.length; i++)
        await tx.notification.update({
          where: { id: notes[i].id },
          data: { createdAt: noteTimes[i], ...(notes[i].sentAt ? { sentAt: noteTimes[i] } : {}) },
        });
    },
    { timeout: 60_000 },
  );
  return { delivered: cap(delivered), placed, lastEvent };
}

// ───────────────────────── reviews / complaints / settlements / payouts ─────────────────────────

async function review(order: PlacedOrder, deliveredAt: Date, r: ReturnType<typeof rng>) {
  const t = await login(order.customerPhone, 'CUSTOMER');
  const roll = r.next();
  const rating = roll < 0.62 ? 5 : roll < 0.86 ? 4 : roll < 0.95 ? 3 : roll < 0.98 ? 2 : 1;
  const comment = rating >= 4 ? r.pick(REVIEW_COMMENTS_GOOD) : rating === 3 ? r.pick(REVIEW_COMMENTS_OK) : r.pick(REVIEW_COMMENTS_BAD);
  const body: Record<string, { rating: number; comment?: string }> = { vendor: { rating, ...(r.chance(0.75) ? { comment } : {}) } };
  if (r.chance(0.7)) body.rider = { rating: Math.min(5, Math.max(3, rating + r.int(-1, 1))) };
  await http('POST', `/orders/${order.id}/reviews`, { token: t, body });
  const when = new Date(Math.min(deliveredAt.getTime() + rnd(r, 2, 60) * 3_600_000, Date.now() - 60_000));
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.review.updateMany({ where: { orderId: order.id }, data: { createdAt: when } });
  });
}

async function complaint(order: PlacedOrder, deliveredAt: Date, idx: number, r: ReturnType<typeof rng>) {
  const c = COMPLAINTS[idx % COMPLAINTS.length];
  const t = await login(order.customerPhone, 'CUSTOMER');
  const made = await http<{ id: string }>('POST', `/orders/${order.id}/complaints`, {
    token: t,
    body: { type: c.type, subject: c.subject, description: c.description },
  });
  const vt = await login(order.ownerPhone, 'VENDOR_OWNER');
  await http('POST', `/vendor/complaints/${made.data.id}/reply`, { token: vt, body: { body: c.reply } });
  const at = await adminToken();
  if (idx % 4 !== 3) {
    await http('POST', `/admin/complaints/${made.data.id}/resolve`, { token: at, body: { outcome: c.outcome, note: c.note } }).catch(
      () => undefined,
    );
  }
  const when = new Date(Math.min(deliveredAt.getTime() + rnd(r, 3, 50) * 3_600_000, Date.now() - 120_000));
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.complaint.update({
      where: { id: made.data.id },
      data: { createdAt: when, updatedAt: new Date(when.getTime() + min(r.int(30, 600))), resolvedAt: undefined },
    });
    const msgs = await tx.complaintMessage.findMany({ where: { complaintId: made.data.id }, orderBy: { createdAt: 'asc' } });
    for (let i = 0; i < msgs.length; i++)
      await tx.complaintMessage.update({ where: { id: msgs[i].id }, data: { createdAt: new Date(when.getTime() + min(20 * (i + 1))) } });
    await tx.complaint.updateMany({
      where: { id: made.data.id, resolvedAt: { not: null } },
      data: { resolvedAt: new Date(when.getTime() + min(r.int(120, 1500))) },
    });
  });
}

/** Records cash deposits for riders (posts vendor ledger credits), then dates them at `when`. */
async function settleCash(riderIds: string[], when: Date, r: ReturnType<typeof rng>) {
  const at = await adminToken();
  for (const riderId of riderIds) {
    const open = await prisma.codCollection.count({ where: { riderId, settlementId: null } });
    if (!open) continue;
    try {
      const res = await http<{ id: string }>('POST', '/admin/cod/settlements', {
        token: at,
        body: { riderId, reference: `DEP-${localDate(when).replace(/-/g, '')}-${pad(r.int(1, 99), 2)}` },
      });
      const t = new Date(when.getTime() + min(r.int(0, 300)));
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
        await tx.codSettlement.update({ where: { id: res.data.id }, data: { settledAt: t } });
        const cols = await tx.codCollection.findMany({ where: { settlementId: res.data.id }, select: { orderId: true } });
        await tx.ledgerEntry.updateMany({
          where: { orderId: { in: cols.map((c) => c.orderId) }, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
          data: { createdAt: t },
        });
      });
    } catch (e) {
      console.warn(`settlement for rider ${riderId} skipped: ${(e as Error).message}`);
    }
  }
}

async function payouts(when: Date, count: number, payShare: number, r: ReturnType<typeof rng>) {
  const vendors = await prisma.vendor.findMany({
    where: { status: VendorStatus.APPROVED, ledger: { some: {} } },
    include: { owner: true },
  });
  let made = 0;
  for (const v of r.shuffle(vendors)) {
    if (made >= count) break;
    const sum = await prisma.ledgerEntry.aggregate({ where: { vendorId: v.id, type: { not: 'COMMISSION' } }, _sum: { amount: true } });
    const out = await prisma.payout.aggregate({
      where: { vendorId: v.id, status: { in: ['REQUESTED', 'APPROVED', 'PAID'] } },
      _sum: { amount: true },
    });
    const avail = Number(sum._sum.amount ?? 0) - Number(out._sum.amount ?? 0);
    if (avail < 1500) continue;
    const amount = Math.floor((avail * (0.6 + r.next() * 0.35)) / 100) * 100;
    if (amount < 1000) continue;
    try {
      const token = await login(v.owner.phone, 'VENDOR_OWNER');
      const iban = `PK${pad(r.int(10, 99), 2)}${r.pick(['HABB', 'MUCB', 'UNIL', 'ALFH', 'MEZN', 'BKIP'])}${pad(r.int(0, 9_999_999), 8)}${pad(r.int(0, 99_999_999), 8)}`;
      const p = await http<{ id: string }>('POST', '/vendor/payouts', {
        token,
        body: { amount: amount.toFixed(2), method: 'BANK', accountRef: iban, note: 'Weekly withdrawal' },
      });
      const at = await adminToken();
      const stage = r.next();
      let processed: Date | null = null;
      if (stage < payShare) {
        await http('POST', `/admin/payouts/${p.data.id}/approve`, { token: at, body: {} });
        await http('POST', `/admin/payouts/${p.data.id}/pay`, { token: at, body: { txnRef: `BANK-${r.int(100000, 999999)}` } });
        processed = new Date(when.getTime() + rnd(r, 1, 2.2) * DAY);
      } else if (stage < payShare + 0.15) {
        await http('POST', `/admin/payouts/${p.data.id}/approve`, { token: at, body: {} });
      }
      const requested = new Date(when.getTime() + min(r.int(30, 600)));
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
        await tx.payout.update({
          where: { id: p.data.id },
          data: {
            requestedAt: requested,
            ...(processed ? { processedAt: new Date(Math.min(processed.getTime(), Date.now() - 60_000)) } : {}),
          },
        });
        if (processed)
          await tx.ledgerEntry.updateMany({
            where: { payoutId: p.data.id },
            data: { createdAt: new Date(Math.min(processed.getTime(), Date.now() - 60_000)) },
          });
      });
      made++;
    } catch (e) {
      console.warn(`payout for ${v.businessName} skipped: ${(e as Error).message}`);
    }
  }
  return made;
}

async function seedPromos() {
  const at = await adminToken();
  const existing = new Set((await prisma.promoCode.findMany({ select: { code: true } })).map((p) => p.code));
  for (const p of PROMOS) {
    if (existing.has(p.code)) continue;
    await http('POST', '/admin/promos', {
      token: at,
      body: {
        code: p.code,
        discountType: p.discountType,
        value: p.value,
        ...(p.maxDiscount ? { maxDiscount: p.maxDiscount } : {}),
        minOrderAmount: p.minOrderAmount,
        maxUses: 2000,
        perUserLimit: 1,
        validFrom: new Date(Date.now() - 30 * DAY).toISOString(),
        validTo: new Date(Date.now() + 60 * DAY).toISOString(),
        isActive: true,
      },
    }).catch((e) => console.warn(`promo ${p.code}: ${(e as Error).message}`));
  }
}

async function waitForCollections(expected: number) {
  for (let i = 0; i < 120; i++) {
    const have = await prisma.codCollection.count({ where: { order: { status: OrderStatus.DELIVERED } } });
    if (have >= expected) return;
    await sleep(500);
  }
  console.warn('COD collections did not all appear in time');
}

/** Clears everything the order phase creates (keeps the four original starter orders) so the phase can be redone. */
async function resetOrders() {
  const keep = ['DHB-LHR-000001', 'DHB-LHR-000002', 'DHB-LHR-000003', 'DHB-LHR-000004'];
  const doomed = await prisma.order.findMany({ where: { orderNo: { notIn: keep } }, select: { id: true, orderNo: true } });
  const ids = doomed.map((o) => o.id);
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      for (const t of [
        'LedgerEntry',
        'Payout',
        'CodCollection',
        'CodSettlement',
        'Review',
        'ComplaintMessage',
        'Complaint',
        'PromoRedemption',
        'DailyCityStat',
        'DailyVendorStat',
      ]) {
        await tx.$executeRawUnsafe(`DELETE FROM "${t}"`);
      }
      if (ids.length) {
        const list = ids.map((i) => `'${i}'`).join(',');
        for (const [t, col] of [
          ['Payment', 'orderId'],
          ['OrderItem', 'orderId'],
          ['OrderStatusHistory', 'orderId'],
          ['DeliveryJob', 'orderId'],
          ['AuditLog', 'entityId'],
          ['Order', 'id'],
        ]) {
          await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "${col}"::text IN (${list})`);
        }
        await tx.$executeRawUnsafe(
          `DELETE FROM "Notification" WHERE payload->>'orderNo' IN (${doomed.map((o) => `'${o.orderNo}'`).join(',')})`,
        );
      }
      await tx.$executeRawUnsafe(`UPDATE "City" SET "orderSeq" = 4 WHERE name = 'Lahore'`);
      await tx.$executeRawUnsafe(`UPDATE "Vendor" SET "ratingAvg" = 0, "ratingCount" = 0`);
      await tx.$executeRawUnsafe(`UPDATE "Rider" SET "ratingAvg" = 0, "ratingCount" = 0`);
    },
    { timeout: 120_000 },
  );
  console.log(`Reset: removed ${ids.length} generated orders and their money, review and complaint rows`);
}

/** Asks the worker to recompute the daily stats for the last 75 days and waits until every day is stored. */
async function rollupAll(now: number) {
  const at = await adminToken();
  await http('POST', '/admin/analytics/rollup', {
    token: at,
    body: { from: localDate(new Date(now - 75 * DAY)), to: localDate(new Date(now - DAY)) },
  }).catch((e) => console.warn(`rollup: ${(e as Error).message}`));
  const cities = await prisma.city.count();
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 240 && stable < 6; i++) {
    const n = await prisma.dailyCityStat.count();
    stable = n === last && n >= cities * 70 ? stable + 1 : 0;
    last = n;
    await sleep(1000);
  }
  console.log(`  daily stats stored: ${last} city rows, ${await prisma.dailyVendorStat.count()} shop rows`);
}

async function orderPhase() {
  const existing = await prisma.order.count({
    where: { customer: { OR: [{ phone: { startsWith: '+92321' } }, { phone: '+923000000001' }] } },
  });
  if (existing >= TARGET_ORDERS) {
    console.log(`Orders: ${existing} already seeded (target ${TARGET_ORDERS}); skipping the order phase`);
    return;
  }
  try {
    await fetch(`${API.replace(/\/api\/v1$/, '')}/api/v1/health/ready`).then((x) => x.ok || Promise.reject(new Error('API not ready')));
  } catch {
    throw new Error(`The API is not reachable at ${API}. Start it first (npm run api:dev).`);
  }
  await clearRateLimits();
  await widenHours();
  const ctx = await loadCtx();
  if (!ctx.vendors.length || !ctx.customers.length || !ctx.riders.length)
    throw new Error('No vendors/customers/riders to place orders with');
  startWorker();
  await sleep(4000);
  const r = rng(777);
  const remaining = buildPlan(TARGET_ORDERS).slice(existing);
  console.log(`Placing ${remaining.length} orders through the API...`);
  await seedPromos();

  const rounds = [40, 20, 7];
  const settled = new Set<number>();
  let deliveredSoFar = await prisma.order.count({ where: { status: OrderStatus.DELIVERED } });
  let complaintIdx = 0;
  let lastSettledCount = deliveredSoFar;
  const now = Date.now();
  let done = 0;
  for (const p of remaining) {
    for (const th of rounds) {
      if (!settled.has(th) && p.daysAgo <= th && p.daysAgo > 0 && p.target === 'DELIVERED') {
        settled.add(th);
        if (deliveredSoFar === lastSettledCount) continue;
        lastSettledCount = deliveredSoFar;
        await waitForCollections(deliveredSoFar);
        await settleCash(
          ctx.riders.map((x) => x.id),
          new Date(now - (th - 0.5) * DAY),
          r,
        );
        console.log(
          `  cash settled for orders older than ${th} days; payouts: ${await payouts(new Date(now - (th - 1) * DAY), th === 40 ? 6 : 10, 0.8, r)}`,
        );
      }
    }
    const placed = await placeOrder(ctx, r);
    if (!placed) {
      console.warn(`  could not place order #${p.n}`);
      continue;
    }
    try {
      await drive(ctx, placed, p.target, r);
    } catch (e) {
      console.warn(`  ${placed.orderNo} (${p.target}) stopped: ${(e as Error).message}`);
    }
    const final = await prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    // How far to shift: finished orders land `daysAgo` days back; in-flight ones keep their pickup in the recent past.
    let shift = 0;
    if (final.status === 'DELIVERED' || final.status === 'CANCELLED' || final.status === 'REJECTED') {
      const anchor = final.status === 'DELIVERED' ? final.deliverySlotStart.getTime() : final.pickupSlotStart.getTime();
      shift = Math.max(0, Math.ceil((anchor - (now - p.daysAgo * DAY)) / DAY));
    } else if (['PICKED_UP', 'IN_PROCESS'].includes(final.status)) {
      shift = Math.max(0, Math.ceil((final.pickupSlotStart.getTime() - (now - r.int(2, 30) * 3_600_000)) / DAY));
    } else if (['READY', 'OUT_FOR_DELIVERY'].includes(final.status)) {
      shift = Math.max(0, Math.round((final.deliverySlotStart.getTime() - (now + rnd(r, -3, 18) * 3_600_000)) / DAY));
    }
    const keepRealTimes = shift === 0 && (final.status === 'PLACED' || final.status === 'ACCEPTED');
    const t = keepRealTimes ? null : await backdate(placed, shift, r);
    if (final.status === 'DELIVERED') {
      deliveredSoFar++;
      if (t) {
        if (r.chance(0.62)) await review(placed, t.delivered, r).catch((e) => console.warn(`  review: ${(e as Error).message}`));
        if (complaintIdx < 10 && r.chance(0.05))
          await complaint(placed, t.delivered, complaintIdx++, r).catch((e) => console.warn(`  complaint: ${(e as Error).message}`));
      }
    }
    if (++done % 25 === 0) console.log(`  ${done}/${remaining.length} orders done`);
  }

  await waitForCollections(deliveredSoFar);
  const open = ctx.riders.filter(() => r.chance(0.55)).map((x) => x.id);
  await settleCash(open, new Date(now - 1.5 * DAY), r);
  console.log(`  final cash settlement for ${open.length} riders; payouts: ${await payouts(new Date(now - 1.2 * DAY), 8, 0.35, r)}`);

  await rollupAll(now);
  stopWorker();
}

/** Earlier hand-made test rows carried "(test data)" in their notes; real-looking notes replace them. */
async function scrubTestNotes() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.$executeRawUnsafe(
      `UPDATE "LedgerEntry" SET note = CASE type WHEN 'ORDER_EARNING' THEN 'Order earning' WHEN 'PAYOUT' THEN 'Payout' WHEN 'ADJUSTMENT' THEN 'Adjustment for a pressing claim' ELSE 'Platform commission' END WHERE note ILIKE '%test%'`,
    );
    await tx.$executeRawUnsafe(`UPDATE "Payout" SET note = 'Weekly withdrawal' WHERE note ILIKE '%test%'`);
  });
}

async function main() {
  await restoreHours(); // a previous run that died halfway leaves the 24h hours behind
  const lahore = await prisma.city.findFirstOrThrow({ where: { name: 'Lahore' } });
  const categories = new Map((await prisma.serviceCategory.findMany()).map((c) => [c.name, c.id]));
  if (!categories.size) throw new Error('Run `npm run db:seed` first (cities and categories are missing)');
  await scrubDemoNames();
  await scrubTestNotes();
  const shops = await seedShops(categories, lahore.id);
  const customers = await seedCustomers(lahore.id);
  const riders = await seedRiders(lahore.id);
  console.log(`People and shops: +${shops} shops, +${customers} customers, +${riders} riders (already-present ones left alone)`);
  if (process.argv.includes('--reset-orders')) await resetOrders();
  if (process.argv.includes('--rollup-only')) {
    startWorker();
    await sleep(4000);
    await rollupAll(Date.now());
    stopWorker();
    console.log('Lahore seed complete');
    return;
  }
  if (!process.argv.includes('--no-orders')) await orderPhase();
  console.log('Lahore seed complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    stopWorker();
    await restoreHours().catch((e) => console.error('could not restore opening hours', e));
    redis.disconnect();
    await prisma.$disconnect();
  });
