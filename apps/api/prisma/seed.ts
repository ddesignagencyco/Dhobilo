import * as argon2 from 'argon2';
import { Availability, CommissionScope, DocType, PrismaClient, Role, ServiceType, VendorStatus } from '@prisma/client';
import { FieldCrypto, parseKeyList } from '../src/common/crypto/field-crypto';

const prisma = new PrismaClient();

// Placeholders from ERD §8; replace with the real pilot cities.
const CITIES = [
  { name: 'Lahore', nameUr: 'لاہور', code: 'LHR', deliveryFee: 150 },
  { name: 'Karachi', nameUr: 'کراچی', code: 'KHI', deliveryFee: 150 },
  { name: 'Islamabad', nameUr: 'اسلام آباد', code: 'ISB', deliveryFee: 150 },
];

const CATEGORIES = [
  { name: 'Wash & Fold', nameUr: 'دھلائی اور تہہ' },
  { name: 'Wash & Iron', nameUr: 'دھلائی اور استری' },
  { name: 'Dry Cleaning', nameUr: 'ڈرائی کلیننگ' },
  { name: 'Ironing', nameUr: 'استری' },
  { name: 'Household', nameUr: 'گھریلو (چادریں، پردے)' },
];

const GLOBAL_COMMISSION_PCT = 15;

// ───── Demo vendors (development / staging only) ─────
const CITY_CENTRES: Record<string, { lat: number; lng: number }> = {
  Lahore: { lat: 31.5204, lng: 74.3587 },
  Karachi: { lat: 24.8607, lng: 67.0011 },
  Islamabad: { lat: 33.6844, lng: 73.0479 },
};

// [item, Urdu name, category, service type, price PKR, turnaround hours]
const DEMO_ITEMS: [string, string, string, ServiceType, number, number][] = [
  ['Shirt', 'قمیض', 'Wash & Iron', ServiceType.WASH_IRON, 120, 48],
  ['Trouser', 'پتلون', 'Wash & Iron', ServiceType.WASH_IRON, 140, 48],
  ['Shalwar Kameez', 'شلوار قمیض', 'Wash & Iron', ServiceType.WASH_IRON, 260, 48],
  ['Suit (2 piece)', 'سوٹ (دو پیس)', 'Dry Cleaning', ServiceType.DRY_CLEAN, 1100, 72],
  ['Bedsheet', 'بیڈ شیٹ', 'Household', ServiceType.WASH_FOLD, 300, 72],
  ['Shirt (iron only)', 'قمیض (صرف استری)', 'Ironing', ServiceType.IRON_ONLY, 50, 24],
];

function demoCrypto(): FieldCrypto | null {
  const { ENC_KEY_ID, ENC_KEY_BASE64, HMAC_KEY_BASE64, ENC_PREVIOUS_KEYS } = process.env;
  if (!ENC_KEY_ID || !ENC_KEY_BASE64 || !HMAC_KEY_BASE64) return null;
  const keys = { ...parseKeyList(ENC_PREVIOUS_KEYS), [ENC_KEY_ID]: Buffer.from(ENC_KEY_BASE64, 'base64') };
  return new FieldCrypto({ currentId: ENC_KEY_ID, keys }, Buffer.from(HMAC_KEY_BASE64, 'base64'));
}

/** One approved vendor per city (hours + catalog) plus one pending vendor so the review queue isn't empty. */
async function seedDemoVendors() {
  const crypto = demoCrypto();
  if (!crypto) {
    console.warn('Skipping demo vendors: ENC_KEY_BASE64 / HMAC_KEY_BASE64 are not set in the environment');
    return;
  }
  const categories = new Map((await prisma.serviceCategory.findMany()).map((c) => [c.name, c.id]));
  const cities = await prisma.city.findMany({ where: { name: { in: Object.keys(CITY_CENTRES) } }, orderBy: { id: 'asc' } });

  const demos = [
    ...cities.map((city, i) => ({ city, n: i + 1, status: VendorStatus.APPROVED, name: `Demo Laundry ${city.name}` })),
    { city: cities.find((c) => c.name === 'Lahore') ?? cities[0], n: 9, status: VendorStatus.PENDING, name: 'Demo Pending Laundry' },
  ];

  for (const d of demos) {
    const centre = CITY_CENTRES[d.city.name];
    const approved = d.status === VendorStatus.APPROVED;
    const phone = `+9230000000${10 + d.n}`; // +923000000011, ...
    const cnic = `35202000000${10 + d.n}`; // 13 digits, not a real CNIC
    const owner = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: {
        phone,
        email: `demo-vendor-${d.n}@dhoblio.local`,
        name: `Demo Owner ${d.n}`,
        role: Role.VENDOR_OWNER,
        phoneVerifiedAt: new Date(),
        referralCode: `DEMOV${d.n}00`,
      },
    });
    const vendor = await prisma.vendor.upsert({
      where: { ownerId: owner.id },
      update: {},
      create: {
        ownerId: owner.id,
        cityId: d.city.id,
        businessName: d.name,
        description: 'Demo vendor for local development',
        addressLine: `Main Market, ${d.city.name}`,
        lat: centre.lat + d.n * 0.003,
        lng: centre.lng + d.n * 0.003,
        cnicEnc: crypto.encrypt(cnic, 'vendor.cnic'),
        cnicHash: crypto.hash('cnic', cnic),
        status: d.status,
        ...(approved ? { approvedAt: new Date(), availability: Availability.OPEN } : {}),
      },
    });

    if ((await prisma.vendorDocument.count({ where: { vendorId: vendor.id } })) === 0) {
      await prisma.vendorDocument.createMany({
        data: [DocType.CNIC_FRONT, DocType.CNIC_BACK, DocType.SHOP_PHOTO].map((type) => ({
          vendorId: vendor.id,
          type,
          publicId: `dhoblio/seed/demo/${vendor.id}/${type.toLowerCase()}`,
          url: `https://example.invalid/demo/${type.toLowerCase()}.jpg`,
          ...(approved ? { verifiedAt: new Date() } : {}),
        })),
      });
    }
    if (!approved) continue;

    await prisma.vendorHours.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.vendorHours.createMany({
      // Open around the clock so the demo always shows up in discovery, whatever time you try it.
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ vendorId: vendor.id, dayOfWeek, opensAt: 0, closesAt: 1440 })),
    });
    for (const [itemName, itemNameUr, category, serviceType, price, turnaroundHours] of DEMO_ITEMS) {
      const categoryId = categories.get(category);
      if (!categoryId) continue;
      await prisma.serviceItem.upsert({
        where: { vendorId_itemName_serviceType: { vendorId: vendor.id, itemName, serviceType } },
        update: {},
        create: { vendorId: vendor.id, categoryId, itemName, itemNameUr, serviceType, price, turnaroundHours },
      });
    }
  }
  console.log(`Demo vendors ready (${demos.length}); owners sign in with +923000000011 ... via the OTP bypass code`);
}

function adminCredentials() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production') {
    if (!email || !password) {
      throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required when seeding in production');
    }
    return { email, password };
  }
  return { email: email ?? 'admin@dhoblio.local', password: password ?? 'ChangeMe!12345' };
}

async function main() {
  for (const c of CITIES) {
    await prisma.city.upsert({ where: { name: c.name }, update: { nameUr: c.nameUr, code: c.code }, create: c });
    // Starting fee only: never overwrites a fee an admin already changed.
    await prisma.city.updateMany({ where: { name: c.name, deliveryFee: 0 }, data: { deliveryFee: c.deliveryFee } });
  }

  for (const c of CATEGORIES) {
    await prisma.serviceCategory.upsert({ where: { name: c.name }, update: { nameUr: c.nameUr }, create: c });
  }

  const { email, password } = adminCredentials();
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      // Admins authenticate with email + password; phone is the unique identity column, so use a stable placeholder.
      phone: '+920000000000',
      email,
      name: 'Platform Admin',
      role: Role.ADMIN,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      phoneVerifiedAt: new Date(),
    },
  });

  const hasGlobalRule = await prisma.commissionRule.findFirst({ where: { scope: CommissionScope.GLOBAL } });
  if (!hasGlobalRule) {
    await prisma.commissionRule.create({ data: { scope: CommissionScope.GLOBAL, ratePct: GLOBAL_COMMISSION_PCT } });
  }

  if (process.env.NODE_ENV !== 'production') await seedDemoVendors();

  console.log(`Seed complete (admin: ${email})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
