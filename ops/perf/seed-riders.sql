-- riders for the dispatch load test: 200 approved riders spread over the three cities
INSERT INTO "User" ("id", "phone", "name", "role", "referralCode", "status", "locale", "createdAt", "updatedAt", "phoneVerifiedAt")
SELECT gen_random_uuid(), '+92333' || lpad(g::text, 7, '0'), 'Perf Rider ' || g, 'RIDER', 'PR' || g, 'ACTIVE', 'EN', now(), now(), now()
FROM generate_series(1, 200) g;
INSERT INTO "Rider" ("id", "userId", "cityId", "status", "cnicEnc", "cnicHash", "photoUrl", "photoPublicId", "isOnline", "approvedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u."id", c."id", 'APPROVED', 'enc', 'perf-rider-' || u."phone", 'https://example.test/p.jpg', 'p', false, now(), now(), now()
FROM (SELECT *, row_number() OVER (ORDER BY "phone") AS rn FROM "User" WHERE "phone" LIKE '+92333%') u
JOIN (SELECT "id", row_number() OVER (ORDER BY "id") AS rn FROM "City" WHERE "code" IN ('LHR', 'KHI', 'ISB')) c ON c.rn = (u.rn % 3) + 1;
