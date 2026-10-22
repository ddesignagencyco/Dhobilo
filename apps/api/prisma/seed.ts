import * as argon2 from 'argon2';
import { CommissionScope, PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

// Placeholders from ERD §8; replace with the real pilot cities.
const CITIES = [
  { name: 'Lahore', nameUr: 'لاہور' },
  { name: 'Karachi', nameUr: 'کراچی' },
  { name: 'Islamabad', nameUr: 'اسلام آباد' },
];

const CATEGORIES = [
  { name: 'Wash & Fold', nameUr: 'دھلائی اور تہہ' },
  { name: 'Wash & Iron', nameUr: 'دھلائی اور استری' },
  { name: 'Dry Cleaning', nameUr: 'ڈرائی کلیننگ' },
  { name: 'Ironing', nameUr: 'استری' },
  { name: 'Household', nameUr: 'گھریلو (چادریں، پردے)' },
];

const GLOBAL_COMMISSION_PCT = 15;

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
    await prisma.city.upsert({ where: { name: c.name }, update: { nameUr: c.nameUr }, create: c });
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

  console.log(`Seed complete (admin: ${email})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
