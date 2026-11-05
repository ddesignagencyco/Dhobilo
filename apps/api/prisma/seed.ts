import * as argon2 from 'argon2';
import { AdminRole, Availability, CommissionScope, DocType, PrismaClient, RiderStatus, Role, ServiceType, VendorStatus } from '@prisma/client';
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

/**
 * One demo account per non-admin role so the whole flow (customer → vendor → rider → admin) can be
 * walked through on a fresh database. All of them sign in with phone + the dev OTP bypass; the email
 * is there for identification/reporting and matches the `demo-*@dhoblio.local` pattern.
 */
async function seedDemoAccounts() {
  const crypto = demoCrypto();
  if (!crypto) {
    console.warn('Skipping demo accounts: ENC_KEY_BASE64 / HMAC_KEY_BASE64 are not set in the environment');
    return;
  }
  const lahore = await prisma.city.findFirst({ where: { name: 'Lahore' } });
  if (!lahore) {
    console.warn('Skipping demo accounts: Lahore city is missing');
    return;
  }

  // Customer — the default address makes checkout work without a detour through the profile page.
  const customer = await prisma.user.upsert({
    where: { phone: '+923000000001' },
    update: {},
    create: {
      phone: '+923000000001',
      email: 'customer@dhoblio.local',
      name: 'Demo Customer',
      role: Role.CUSTOMER,
      phoneVerifiedAt: new Date(),
      referralCode: 'DEMOC100',
    },
  });
  const hasAddress = await prisma.address.findFirst({ where: { userId: customer.id, deletedAt: null } });
  if (!hasAddress) {
    await prisma.address.create({
      data: {
        userId: customer.id,
        label: 'Home',
        line1: '12 Gulberg Main Boulevard',
        area: 'Gulberg III',
        cityId: lahore.id,
        lat: CITY_CENTRES.Lahore.lat,
        lng: CITY_CENTRES.Lahore.lng,
        isDefault: true,
      },
    });
  }

  // Vendor staff — attached to the first demo laundry. The owner (demo vendor 1) manages the catalog.
  const staff = await prisma.user.upsert({
    where: { phone: '+923000000031' },
    update: {},
    create: {
      phone: '+923000000031',
      email: 'staff@dhoblio.local',
      name: 'Demo Staff',
      role: Role.VENDOR_STAFF,
      phoneVerifiedAt: new Date(),
      referralCode: 'DEMOS100',
    },
  });
  const vendor = await prisma.vendor.findFirst({ where: { owner: { phone: '+923000000011' } } });
  if (vendor) {
    await prisma.vendorStaff.upsert({
      where: { vendorId_userId: { vendorId: vendor.id, userId: staff.id } },
      update: {},
      create: { vendorId: vendor.id, userId: staff.id },
    });
  }

  // Rider — approved and online in Lahore so dispatch has someone to offer jobs to immediately.
  const riderUser = await prisma.user.upsert({
    where: { phone: '+923000000021' },
    update: {},
    create: {
      phone: '+923000000021',
      email: 'rider@dhoblio.local',
      name: 'Demo Rider',
      role: Role.RIDER,
      phoneVerifiedAt: new Date(),
      referralCode: 'DEMOR100',
    },
  });
  const cnic = '3520200000042'; // 13 digits, not a real CNIC
  await prisma.rider.upsert({
    where: { userId: riderUser.id },
    update: {},
    create: {
      userId: riderUser.id,
      cityId: lahore.id,
      status: RiderStatus.APPROVED,
      cnicEnc: crypto.encrypt(cnic, 'rider.cnic'),
      cnicHash: crypto.hash('cnic', cnic),
      isOnline: true,
      lastLat: CITY_CENTRES.Lahore.lat,
      lastLng: CITY_CENTRES.Lahore.lng,
      lastSeenAt: new Date(),
      approvedAt: new Date(),
    },
  });

  console.log('Demo accounts ready: customer +923000000001, staff +923000000031, rider +923000000021');
}

/** Sub-role admins so each area of the panel (operations, finance, support) can be tested. */
async function seedDemoAdmins(password: string) {
  const demos = [
    { email: 'ops@dhoblio.local', phone: '+920000000001', name: 'Operations Admin', adminRole: AdminRole.OPERATIONS },
    { email: 'finance@dhoblio.local', phone: '+920000000002', name: 'Finance Admin', adminRole: AdminRole.FINANCE },
    { email: 'support@dhoblio.local', phone: '+920000000003', name: 'Support Admin', adminRole: AdminRole.SUPPORT },
  ];
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  for (const admin of demos) {
    await prisma.user.upsert({
      where: { phone: admin.phone },
      update: {},
      create: {
        ...admin,
        role: Role.ADMIN,
        passwordHash,
        phoneVerifiedAt: new Date(),
      },
    });
  }
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
      adminRole: AdminRole.SUPER_ADMIN,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      phoneVerifiedAt: new Date(),
    },
  });

  const hasGlobalRule = await prisma.commissionRule.findFirst({ where: { scope: CommissionScope.GLOBAL } });
  if (!hasGlobalRule) {
    await prisma.commissionRule.create({ data: { scope: CommissionScope.GLOBAL, ratePct: GLOBAL_COMMISSION_PCT } });
  }

  if (process.env.NODE_ENV !== 'production') {
    await seedDemoAdmins(password);
    await seedDemoVendors();
    await seedDemoAccounts();
  }

  console.log(`Seed complete (admin: ${email})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
