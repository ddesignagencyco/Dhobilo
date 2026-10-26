// Mints long-lived access tokens for load tests, so k6 does not have to go through the (rate-limited) SMS login.
// Never use against a real environment: it needs the signing secret. Usage:
//   DATABASE_URL=... JWT_ACCESS_SECRET=... node ops/perf/mint-tokens.js [out.json] [customers] [vendors] [riders]
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const jwt = require(path.join(__dirname, '../../node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(__dirname, '../../node_modules/@prisma/client'));

const [out = 'ops/perf/tokens.json', nCust = '400', nVend = '60', nRider = '200'] = process.argv.slice(2);
const secret = process.env.JWT_ACCESS_SECRET;
if (!secret) throw new Error('JWT_ACCESS_SECRET is required');

(async () => {
  const prisma = new PrismaClient();
  const mint = (u) => jwt.sign({ sub: u.id, role: u.role, sid: randomUUID() }, secret, { algorithm: 'HS256', expiresIn: '12h' });
  const pick = (where, take) => prisma.user.findMany({ where, take, orderBy: { phone: 'asc' }, select: { id: true, role: true, phone: true } });

  const customers = await prisma.$queryRaw`
    SELECT u."id", u."role", u."phone", a."id" AS "addressId", a."cityId"
    FROM "User" u JOIN "Address" a ON a."userId" = u."id" WHERE u."phone" LIKE '+92322%' ORDER BY u."phone" LIMIT ${Number(nCust)}`;
  const vendors = await prisma.$queryRaw`
    SELECT u."id", u."role", u."phone", v."id" AS "vendorId", v."cityId", v."lat", v."lng"
    FROM "User" u JOIN "Vendor" v ON v."ownerId" = u."id" WHERE u."phone" LIKE '+92311%' ORDER BY u."phone" LIMIT ${Number(nVend)}`;
  const riders = await prisma.$queryRaw`
    SELECT u."id", u."role", u."phone", r."id" AS "riderId", r."cityId"
    FROM "User" u JOIN "Rider" r ON r."userId" = u."id" WHERE u."phone" LIKE '+92333%' ORDER BY u."phone" LIMIT ${Number(nRider)}`;

  const file = {
    customers: customers.map((u) => ({ token: mint(u), addressId: u.addressId, cityId: u.cityId })),
    vendors: vendors.map((u) => ({ token: mint(u), vendorId: u.vendorId, cityId: u.cityId, lat: u.lat, lng: u.lng })),
    riders: riders.map((u) => ({ token: mint(u), riderId: u.riderId, cityId: u.cityId })),
  };
  // vendors a customer can order from (with a price list), per city
  file.catalog = await prisma.$queryRaw`
    SELECT v."id" AS "vendorId", v."cityId", v."lat", v."lng", (SELECT s."id" FROM "ServiceItem" s WHERE s."vendorId" = v."id" ORDER BY s."itemName" LIMIT 1) AS "itemId"
    FROM "Vendor" v WHERE v."businessName" LIKE 'Perf Laundry %' ORDER BY v."businessName" LIMIT 200`;
  fs.writeFileSync(out, JSON.stringify(file));
  console.log(`tokens: ${file.customers.length} customers, ${file.vendors.length} vendors, ${file.riders.length} riders; ${file.catalog.length} catalog vendors -> ${out}`);
  await prisma.$disconnect();
})();
