-- Realistic volume for performance work (QA-9.1): 500 vendors, 20,000 customers, 100,000 orders over ~120 days,
-- with items, status history, payments, ledger entries and reviews. Run against a SCRATCH database that already has
-- the migrations and the base seed (cities, categories):
--   psql -v ON_ERROR_STOP=1 -v orders=100000 -f ops/perf/seed-volume.sql dhoblio_perf
-- Prisma generates ids and updatedAt in the client, so this script supplies them itself.
\set ON_ERROR_STOP on
\if :{?orders} \else \set orders 100000 \endif
\if :{?vendors} \else \set vendors 500 \endif
\if :{?customers} \else \set customers 20000 \endif

BEGIN;

-- vendors: owner accounts, shops spread over the three cities, hours, price lists
INSERT INTO "User" ("id", "phone", "role", "referralCode", "status", "locale", "createdAt", "updatedAt", "phoneVerifiedAt")
SELECT gen_random_uuid(), '+92311' || lpad(g::text, 7, '0'), 'VENDOR_OWNER', 'PV' || g, 'ACTIVE', 'EN', now(), now(), now()
FROM generate_series(1, :vendors) g;

CREATE TEMP TABLE pv AS
SELECT row_number() OVER (ORDER BY u."phone") AS rn, u."id" AS owner_id, u."phone"
FROM "User" u WHERE u."phone" LIKE '+92311%';

CREATE TEMP TABLE pcity AS SELECT row_number() OVER (ORDER BY "id") AS rn, "id" AS city_id FROM "City" WHERE "code" IN ('LHR', 'KHI', 'ISB');

INSERT INTO "Vendor" ("id", "ownerId", "cityId", "businessName", "addressLine", "lat", "lng", "cnicEnc", "cnicHash", "status",
  "approvedAt", "availability", "serviceRadiusKm", "respondWithinMin", "slotCapacity", "ratingAvg", "ratingCount", "createdAt", "updatedAt")
SELECT gen_random_uuid(), pv.owner_id, c.city_id, 'Perf Laundry ' || pv.rn, (pv.rn % 90 + 1) || ' Test Road',
  CASE c.rn WHEN 1 THEN 31.52 WHEN 2 THEN 24.86 ELSE 33.68 END + (random() - 0.5) * 0.2,
  CASE c.rn WHEN 1 THEN 74.35 WHEN 2 THEN 67.00 ELSE 73.04 END + (random() - 0.5) * 0.2,
  'enc', 'perf-cnic-' || pv.rn, 'APPROVED', now(), 'OPEN', 30, 15, 20, 0, 0, now() - interval '200 days', now()
FROM pv JOIN pcity c ON c.rn = (pv.rn % 3) + 1;

CREATE TEMP TABLE pvend AS
SELECT row_number() OVER (ORDER BY v."businessName") AS rn, v."id" AS vendor_id, v."cityId" AS city_id
FROM "Vendor" v WHERE v."businessName" LIKE 'Perf Laundry %';

INSERT INTO "VendorHours" ("id", "vendorId", "dayOfWeek", "opensAt", "closesAt")
SELECT gen_random_uuid(), v.vendor_id, d, 0, 1440 FROM pvend v, generate_series(0, 6) d;

CREATE TEMP TABLE pcat AS SELECT row_number() OVER (ORDER BY "id") AS rn, "id" AS cat_id FROM "ServiceCategory";

INSERT INTO "ServiceItem" ("id", "vendorId", "categoryId", "itemName", "serviceType", "price", "turnaroundHours", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v.vendor_id, (SELECT cat_id FROM pcat WHERE rn = 1 + (i % (SELECT count(*) FROM pcat))),
  (ARRAY['Shirt','Trouser','Shalwar Kameez','Suit','Bedsheet','Coat'])[i + 1],
  (ARRAY['WASH_IRON','WASH_IRON','WASH_IRON','DRY_CLEAN','WASH_FOLD','DRY_CLEAN'])[i + 1]::"ServiceType",
  (ARRAY[120,140,260,1100,300,900])[i + 1], 48, true, now(), now()
FROM pvend v, generate_series(0, 5) i;

CREATE TEMP TABLE pitem AS
SELECT s."id" AS item_id, s."vendorId" AS vendor_id, s."itemName", s."serviceType", s."price",
  (row_number() OVER (PARTITION BY s."vendorId" ORDER BY s."itemName")) - 1 AS slot
FROM "ServiceItem" s JOIN pvend v ON v.vendor_id = s."vendorId";

-- customers with one saved address each
INSERT INTO "User" ("id", "phone", "role", "referralCode", "status", "locale", "createdAt", "updatedAt", "phoneVerifiedAt")
SELECT gen_random_uuid(), '+92322' || lpad(g::text, 7, '0'), 'CUSTOMER', 'PC' || g, 'ACTIVE', CASE WHEN g % 4 = 0 THEN 'UR'::"Locale" ELSE 'EN'::"Locale" END,
  now() - (random() * interval '200 days'), now(), now()
FROM generate_series(1, :customers) g;

CREATE TEMP TABLE pcust AS
SELECT row_number() OVER (ORDER BY "phone") AS rn, "id" AS user_id FROM "User" WHERE "phone" LIKE '+92322%';

INSERT INTO "Address" ("id", "userId", "label", "line1", "cityId", "lat", "lng", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid(), c.user_id, 'Home', (c.rn % 200) || ' Perf Street', pc.city_id,
  CASE pc.rn WHEN 1 THEN 31.52 WHEN 2 THEN 24.86 ELSE 33.68 END + (random() - 0.5) * 0.2,
  CASE pc.rn WHEN 1 THEN 74.35 WHEN 2 THEN 67.00 ELSE 73.04 END + (random() - 0.5) * 0.2, true, now(), now()
FROM pcust c JOIN pcity pc ON pc.rn = (c.rn % 3) + 1;

-- orders: 80% delivered, 8% cancelled, 4% rejected, 8% still moving; 70% cash, 30% online
CREATE TEMP TABLE porder AS
SELECT g, gen_random_uuid() AS id,
  v.vendor_id, v.city_id, c.user_id AS customer_id,
  now() - (random() * interval '120 days') AS placed,
  (ARRAY['DELIVERED','DELIVERED','DELIVERED','DELIVERED','DELIVERED','DELIVERED','DELIVERED','DELIVERED','CANCELLED','CANCELLED','REJECTED','IN_PROCESS','PLACED','READY'])[1 + (g % 14)] AS status,
  (CASE WHEN g % 10 < 7 THEN 'COD' ELSE 'JAZZCASH' END) AS method,
  (200 + (g % 40) * 25)::numeric AS subtotal
FROM generate_series(1, :orders) g
JOIN pvend v ON v.rn = (g % :vendors) + 1
JOIN pcust c ON c.rn = (g % :customers) + 1;

INSERT INTO "Order" ("id", "orderNo", "customerId", "vendorId", "cityId", "addressSnapshot", "status", "pickupSlotStart", "pickupSlotEnd",
  "deliverySlotStart", "deliverySlotEnd", "subtotal", "discountTotal", "deliveryFee", "total", "commissionRatePct", "commissionAmount",
  "vendorEarning", "paymentMethod", "paymentStatus", "vendorRespondBy", "placedAt", "createdAt", "deliveredAt", "updatedAt")
SELECT o.id, 'P-' || o.g, o.customer_id, o.vendor_id, o.city_id, '{}'::jsonb, o.status::"OrderStatus",
  o.placed + interval '1 day', o.placed + interval '1 day 1 hour', o.placed + interval '3 days', o.placed + interval '3 days 1 hour',
  o.subtotal, 0, 150, o.subtotal + 150, 15, round(o.subtotal * 0.15, 2), o.subtotal - round(o.subtotal * 0.15, 2),
  o.method::"PaymentMethod",
  CASE WHEN o.status = 'DELIVERED' THEN (CASE WHEN o.method = 'COD' THEN 'COD_COLLECTED' ELSE 'PAID' END) WHEN o.method = 'COD' THEN 'COD_PENDING' ELSE 'PENDING' END::"PaymentStatus",
  o.placed + interval '15 minutes', o.placed, o.placed,
  CASE WHEN o.status = 'DELIVERED' THEN o.placed + interval '3 days' END, o.placed + interval '3 days'
FROM porder o;

INSERT INTO "OrderItem" ("id", "orderId", "serviceItemId", "name", "serviceType", "unitPrice", "qty", "lineTotal")
SELECT gen_random_uuid(), o.id, i.item_id, i."itemName", i."serviceType", i.price, 2, i.price * 2
FROM porder o JOIN pitem i ON i.vendor_id = o.vendor_id AND i.slot = (o.g % 6);

INSERT INTO "OrderStatusHistory" ("id", "orderId", "toStatus", "createdAt")
SELECT gen_random_uuid(), o.id, 'PLACED', o.placed FROM porder o;
INSERT INTO "OrderStatusHistory" ("id", "orderId", "fromStatus", "toStatus", "createdAt")
SELECT gen_random_uuid(), o.id, 'PLACED', o.status::"OrderStatus", o.placed + interval '1 hour' FROM porder o WHERE o.status <> 'PLACED';

INSERT INTO "Payment" ("id", "orderId", "method", "gateway", "gatewayRef", "amount", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), o.id, 'JAZZCASH', 'jazzcash', 'PERF-' || o.g, o.subtotal + 150,
  CASE WHEN o.status = 'DELIVERED' THEN 'PAID' ELSE 'PENDING' END::"PaymentStatus", o.placed, o.placed
FROM porder o WHERE o.method = 'JAZZCASH';

INSERT INTO "LedgerEntry" ("id", "vendorId", "orderId", "type", "amount", "note", "createdAt")
SELECT gen_random_uuid(), o.vendor_id, o.id, 'ORDER_EARNING', o.subtotal - round(o.subtotal * 0.15, 2), 'Order earning', o.placed + interval '3 days'
FROM porder o WHERE o.status = 'DELIVERED';
INSERT INTO "LedgerEntry" ("id", "vendorId", "orderId", "type", "amount", "note", "createdAt")
SELECT gen_random_uuid(), o.vendor_id, o.id, 'COMMISSION', -round(o.subtotal * 0.15, 2), 'Platform commission', o.placed + interval '3 days'
FROM porder o WHERE o.status = 'DELIVERED';

INSERT INTO "Review" ("id", "orderId", "customerId", "targetType", "vendorId", "rating", "comment", "createdAt")
SELECT gen_random_uuid(), o.id, o.customer_id, 'VENDOR', o.vendor_id, 3 + (o.g % 3), NULL, o.placed + interval '4 days'
FROM porder o WHERE o.status = 'DELIVERED' AND o.g % 10 < 3;

UPDATE "Vendor" v SET "ratingAvg" = r.avg, "ratingCount" = r.n
FROM (SELECT "vendorId", round(avg("rating")::numeric, 2) AS avg, count(*) AS n FROM "Review" GROUP BY 1) r
WHERE r."vendorId" = v."id";

COMMIT;
ANALYZE;
SELECT 'vendors' AS what, count(*) FROM "Vendor" UNION ALL SELECT 'customers', count(*) FROM "User" WHERE role = 'CUSTOMER'
UNION ALL SELECT 'orders', count(*) FROM "Order" UNION ALL SELECT 'order items', count(*) FROM "OrderItem"
UNION ALL SELECT 'ledger entries', count(*) FROM "LedgerEntry" UNION ALL SELECT 'reviews', count(*) FROM "Review";
