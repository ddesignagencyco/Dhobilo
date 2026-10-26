import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { getQueueToken } from '@nestjs/bullmq';
import { Prisma, ReportStatus } from '@prisma/client';
import type { Queue } from 'bullmq';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { QUEUES } from '../src/infra/queue/queues';
import { REPORT_SOURCES } from '../src/modules/reports/report-sources';
import { ReportsService } from '../src/modules/reports/reports.service';
import { createRider } from './delivery-helpers';
import { Basics, TestApp, clearRateLimits, createAdmin, createCustomer, createLiveVendor, createTestApp, fixedClock, prepareReferenceData } from './helpers';

const NOW = new Date('2020-02-20T07:00:00Z');
const hour = 3_600_000;

/** Minimal RFC 4180 reader for the files we write (quotes, doubled quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(cell), (cell = ''));
    else if (c === '\r') continue;
    else if (c === '\n') (row.push(cell), rows.push(row), (row = []), (cell = ''));
    else cell += c;
  }
  if (cell || row.length) (row.push(cell), rows.push(row));
  return rows;
}

describe('Reports (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let service: ReportsService;
  let queue: Queue;
  let vendor: Awaited<ReturnType<typeof createLiveVendor>>;
  let customer: Awaited<ReturnType<typeof createCustomer>>;
  const orderIds: string[] = [];

  const post = (body: object, auth = admin.auth) => http.post('/api/v1/admin/reports').set(auth).send(body);
  const get = (path: string, auth = admin.auth) => http.get(`/api/v1${path}`).set(auth);

  /** Requests a report through the API, then lets the "worker" build it. */
  async function build(body: object, final = true) {
    const created = await post(body).expect(202);
    await service.generate(created.body.data.id, final);
    const ready = await get(`/admin/reports/${created.body.data.id}`).expect(200);
    return ready.body.data as { id: string; status: string; rowCount: number; fileName: string; download: { url: string } | null; error: string | null; byteSize: number };
  }

  const fetchFile = (url: string) =>
    http
      .get(url)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  async function order(d: { placed: string; total: number; commission: number; status?: 'DELIVERED' | 'PLACED' | 'CANCELLED'; method?: 'COD' | 'CARD'; vendorId?: string; customerId?: string; delivered?: string }) {
    const placed = new Date(d.placed);
    const created = await t.prisma.order.create({
      data: {
        orderNo: `R-${randomUUID().slice(0, 8)}`,
        customerId: d.customerId ?? customer.user.id,
        vendorId: d.vendorId ?? vendor.vendor.id,
        cityId: basics.cityId,
        addressSnapshot: {},
        status: d.status ?? 'DELIVERED',
        pickupSlotStart: placed,
        pickupSlotEnd: new Date(placed.getTime() + hour),
        deliverySlotStart: placed,
        deliverySlotEnd: new Date(placed.getTime() + hour),
        subtotal: d.total,
        deliveryFee: 0,
        total: d.total,
        commissionRatePct: 15,
        commissionAmount: d.commission,
        vendorEarning: d.total - d.commission,
        paymentMethod: d.method ?? 'COD',
        paymentStatus: d.method === 'CARD' ? 'PAID' : 'COD_PENDING',
        vendorRespondBy: placed,
        createdAt: placed,
        placedAt: placed,
        deliveredAt: d.delivered ? new Date(d.delivered) : (d.status ?? 'DELIVERED') === 'DELIVERED' ? new Date(placed.getTime() + 2 * hour) : null,
      },
    });
    orderIds.push(created.id);
    return created;
  }

  beforeAll(async () => {
    clock = fixedClock(NOW);
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    service = t.app.get(ReportsService);
    queue = t.app.get<Queue>(getQueueToken(QUEUES.EXPORTS));
    // A shop name that a spreadsheet would run as a formula if we let it.
    vendor = await createLiveVendor(t, basics, { name: '=HYPERLINK("http://evil.example","Open")' });
    customer = await createCustomer(t);
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
    await queue.obliterate({ force: true });
  });
  afterAll(() => t.close());

  describe('orders report', () => {
    let e1: Awaited<ReturnType<typeof order>>;
    let e2: Awaited<ReturnType<typeof order>>;

    beforeAll(async () => {
      e1 = await order({ placed: '2020-02-10T06:00:00Z', total: 1000, commission: 150 });
      e2 = await order({ placed: '2020-02-11T07:00:00Z', total: 250.5, commission: 37.58, method: 'CARD' });
      await order({ placed: '2020-02-11T08:00:00Z', total: 300, commission: 45, status: 'CANCELLED' });
      await order({ placed: '2020-02-20T01:00:00Z', total: 999, commission: 1 }); // outside the range asked for
    });

    it('is queued by the request, built by the worker, and the CSV totals equal the orders table', async () => {
      const created = await post({ type: 'ORDERS', from: '2020-02-10', to: '2020-02-12' }).expect(202);
      expect(created.body.data).toMatchObject({ type: 'ORDERS', format: 'CSV', status: 'QUEUED', download: null, rowCount: null });
      const jobs = await queue.getJobs(['waiting', 'delayed']);
      expect(jobs.map((j) => [j.name, j.data])).toEqual([['generate-report', { reportId: created.body.data.id }]]);

      await service.generate(created.body.data.id, true);
      const ready = (await get(`/admin/reports/${created.body.data.id}`).expect(200)).body.data;
      expect(ready).toMatchObject({ status: 'READY', rowCount: 3, fileName: 'dhoblio-orders-2020-02-10_to_2020-02-12.csv' });
      expect(ready.download.url).toMatch(new RegExp(`^/api/v1/reports/${created.body.data.id}/download\\?exp=\\d+&sig=[0-9a-f]{64}$`));

      const file = await fetchFile(ready.download.url).expect(200);
      expect(file.headers['content-type']).toContain('text/csv');
      expect(file.headers['content-disposition']).toBe('attachment; filename="dhoblio-orders-2020-02-10_to_2020-02-12.csv"');
      const text = (file.body as Buffer).toString('utf8');
      expect(text.charCodeAt(0)).toBe(0xfeff); // byte-order mark so Excel reads Urdu names
      const [header, ...rows] = parseCsv(text.slice(1));
      expect(header.slice(0, 3)).toEqual(['Order no', 'Placed at (PKT)', 'City']);
      expect(rows).toHaveLength(3);

      const sql = await t.prisma.order.aggregate({
        where: { createdAt: { gte: new Date('2020-02-09T19:00:00Z'), lt: new Date('2020-02-12T19:00:00Z') }, vendorId: vendor.vendor.id },
        _sum: { total: true, commissionAmount: true },
        _count: { _all: true },
      });
      expect(rows.length).toBe(sql._count._all);
      const col = (name: string) => header.indexOf(name);
      const sum = (name: string) => rows.reduce((n, r) => n.plus(r[col(name)]), new Prisma.Decimal(0));
      expect(sum('Total').toFixed(2)).toBe(new Prisma.Decimal(sql._sum.total!).toFixed(2));
      expect(sum('Commission').toFixed(2)).toBe(new Prisma.Decimal(sql._sum.commissionAmount!).toFixed(2));
      expect(sum('Total').toFixed(2)).toBe('1550.50');
    });

    it('writes money with two decimals, masks the phone and shows times in Pakistan time', async () => {
      const r = await build({ type: 'ORDERS', from: '2020-02-10', to: '2020-02-10' });
      const [header, row] = parseCsv(((await fetchFile(r.download!.url).expect(200)).body as Buffer).toString('utf8').slice(1));
      const cell = (name: string) => row[header.indexOf(name)];
      expect(cell('Order no')).toBe(e1.orderNo);
      expect(cell('Total')).toBe('1000.00');
      expect(cell('Delivery fee')).toBe('0.00');
      expect(cell('Placed at (PKT)')).toBe('2020-02-10 11:00'); // 06:00Z
      expect(cell('Delivered at (PKT)')).toBe('2020-02-10 13:00');
      const local = `0${customer.user.phone.slice(3)}`; // +92300xxxxxxx -> 0300xxxxxxx
      expect(cell('Customer phone')).toBe(`${local.slice(0, 4)}****${local.slice(-3)}`);
      expect(cell('Customer phone')).not.toContain(local.slice(4, 8));
    });

    it('neutralises text a spreadsheet would run as a formula', async () => {
      const r = await build({ type: 'ORDERS', from: '2020-02-10', to: '2020-02-10' });
      const text = ((await fetchFile(r.download!.url).expect(200)).body as Buffer).toString('utf8');
      const [header, row] = parseCsv(text.slice(1));
      expect(row[header.indexOf('Vendor')]).toBe(`'=HYPERLINK("http://evil.example","Open")`);
      expect(text).not.toMatch(/,=HYPERLINK/);
    });

    it('builds an Excel workbook whose money cells are numbers and whose total matches the table', async () => {
      const r = await build({ type: 'ORDERS', format: 'XLSX', from: '2020-02-10', to: '2020-02-12' });
      expect(r).toMatchObject({ status: 'READY', rowCount: 3, fileName: 'dhoblio-orders-2020-02-10_to_2020-02-12.xlsx' });
      const file = await fetchFile(r.download!.url).expect(200);
      expect(file.headers['content-type']).toContain('spreadsheetml.sheet');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file.body as unknown as ExcelJS.Buffer);
      const ws = wb.getWorksheet('Orders')!;
      expect(ws.rowCount).toBe(4);
      const header = (ws.getRow(1).values as unknown[]).slice(1) as string[];
      const totalCol = header.indexOf('Total') + 1;
      const totals = [2, 3, 4].map((n) => ws.getRow(n).getCell(totalCol).value);
      expect(totals.every((v) => typeof v === 'number')).toBe(true);
      expect(totals.reduce((a, b) => (a as number) + (b as number), 0)).toBeCloseTo(1550.5, 2);
      expect(ws.getRow(2).getCell(header.indexOf('Vendor') + 1).value).toBe(`'=HYPERLINK("http://evil.example","Open")`);
    });

    it('narrows to a city or vendor and defaults the range', async () => {
      const other = await createLiveVendor(t, basics, { name: 'Somebody else' });
      const r = await build({ type: 'ORDERS', from: '2020-02-10', to: '2020-02-12', vendorId: other.vendor.id });
      expect(r.rowCount).toBe(0);
      const d = (await post({ type: 'ORDERS' }).expect(202)).body.data;
      expect(d.params).toEqual({ from: '2020-01-22', to: '2020-02-20' }); // 30 days ending today (Pakistan time)
    });
  });

  describe('other report types', () => {
    it('payments: one row per payment attempt in the range', async () => {
      const o = await order({ placed: '2020-02-13T06:00:00Z', total: 400, commission: 60, method: 'CARD' });
      await t.prisma.payment.create({ data: { orderId: o.id, method: 'CARD', gateway: 'payfast', gatewayRef: `GW-${randomUUID().slice(0, 8)}`, amount: 400, status: 'PAID', createdAt: new Date('2020-02-13T06:05:00Z') } });
      const r = await build({ type: 'PAYMENTS', from: '2020-02-13', to: '2020-02-13' });
      const [header, ...rows] = parseCsv(((await fetchFile(r.download!.url).expect(200)).body as Buffer).toString('utf8').slice(1));
      expect(rows).toHaveLength(1);
      expect(rows[0][header.indexOf('Order no')]).toBe(o.orderNo);
      expect(rows[0][header.indexOf('Amount')]).toBe('400.00');
      expect(rows[0][header.indexOf('Status')]).toBe('PAID');
    });

    it('payouts: amount, status and only the last digits of the account', async () => {
      await t.prisma.payout.create({ data: { vendorId: vendor.vendor.id, amount: 1500, method: 'BANK', accountRef: 'PK36SCBL0000001123456702', requestedAt: new Date('2020-02-14T06:00:00Z') } });
      const r = await build({ type: 'PAYOUTS', from: '2020-02-14', to: '2020-02-14' });
      const text = ((await fetchFile(r.download!.url).expect(200)).body as Buffer).toString('utf8');
      const [header, row] = parseCsv(text.slice(1));
      expect(row[header.indexOf('Amount')]).toBe('1500.00');
      expect(row[header.indexOf('Account')]).toBe('••••6702');
      expect(text).not.toContain('PK36SCBL');
    });

    it('cash collections: who collected, whether it was deposited, and the deposit reference', async () => {
      const rider = await createRider(t, basics, { online: false });
      const a = await order({ placed: '2020-02-15T06:00:00Z', total: 500, commission: 75 });
      const b = await order({ placed: '2020-02-15T07:00:00Z', total: 300, commission: 45 });
      const settlement = await t.prisma.codSettlement.create({ data: { riderId: rider.rider.id, amount: 500, reference: 'DEP-77', settledAt: new Date('2020-02-16T06:00:00Z') } });
      await t.prisma.codCollection.create({ data: { orderId: a.id, riderId: rider.rider.id, amount: 500, collectedAt: new Date('2020-02-15T09:00:00Z'), settlementId: settlement.id } });
      await t.prisma.codCollection.create({ data: { orderId: b.id, riderId: rider.rider.id, amount: 300, collectedAt: new Date('2020-02-15T10:00:00Z') } });
      const r = await build({ type: 'COD', from: '2020-02-15', to: '2020-02-15' });
      const [header, ...rows] = parseCsv(((await fetchFile(r.download!.url).expect(200)).body as Buffer).toString('utf8').slice(1));
      expect(rows).toHaveLength(2);
      const byOrder = new Map(rows.map((x) => [x[header.indexOf('Order no')], x]));
      expect(byOrder.get(a.orderNo)![header.indexOf('Deposited')]).toBe('Yes');
      expect(byOrder.get(a.orderNo)![header.indexOf('Deposit reference')]).toBe('DEP-77');
      expect(byOrder.get(b.orderNo)![header.indexOf('Deposited')]).toBe('No');
      expect(rows.reduce((n, x) => n + Number(x[header.indexOf('Amount')]), 0)).toBe(800);
    });

    it('vendors: delivered orders, sales and commission per vendor in the range', async () => {
      const r = await build({ type: 'VENDORS', from: '2020-02-10', to: '2020-02-12' });
      const [header, ...rows] = parseCsv(((await fetchFile(r.download!.url).expect(200)).body as Buffer).toString('utf8').slice(1));
      const mine = rows.find((x) => x[0].includes('HYPERLINK'))!;
      expect(mine[header.indexOf('Orders delivered')]).toBe('2');
      expect(mine[header.indexOf('Sales')]).toBe('1250.50');
      expect(mine[header.indexOf('Commission')]).toBe('187.58');
    });
  });

  describe('download links', () => {
    let report: Awaited<ReturnType<typeof build>>;
    beforeAll(async () => {
      clock.set(NOW);
      report = await build({ type: 'ORDERS', from: '2020-02-10', to: '2020-02-10' });
    });

    it('work without a login', async () => {
      await http.get(report.download!.url).expect(200);
    });

    it('refuse a tampered signature, another report’s signature, and a changed expiry', async () => {
      const u = new URL(report.download!.url, 'http://x');
      const exp = u.searchParams.get('exp')!;
      const sig = u.searchParams.get('sig')!;
      const flip = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
      await http.get(`${u.pathname}?exp=${exp}&sig=${flip}`).expect(403);
      await http.get(`/api/v1/reports/${randomUUID()}/download?exp=${exp}&sig=${sig}`).expect(403);
      await http.get(`${u.pathname}?exp=${Number(exp) + 3600}&sig=${sig}`).expect(403);
      await http.get(`${u.pathname}?exp=${exp}`).expect(400);
      await http.get(`${u.pathname}?exp=${exp}&sig=nothex`).expect(400);
    });

    it('stop working after 10 minutes, and a fresh one is issued every time the report is read', async () => {
      clock.set(new Date(NOW.getTime() + 11 * 60_000));
      const res = await http.get(report.download!.url).expect(410);
      expect(res.body.error.code).toBe('LINK_EXPIRED');
      const again = (await get(`/admin/reports/${report.id}`).expect(200)).body.data;
      expect(again.download.url).not.toBe(report.download!.url);
      await http.get(again.download.url).expect(200);
    });

    it('stop working when the file has expired, and the cleanup removes the file', async () => {
      const r = await build({ type: 'ORDERS', from: '2020-02-10', to: '2020-02-10' });
      const link = r.download!.url;
      clock.set(new Date(NOW.getTime() + 8 * 86_400_000));
      expect(await service.purgeExpired()).toBeGreaterThanOrEqual(1);
      expect(await t.prisma.reportFile.count({ where: { reportId: r.id } })).toBe(0);
      const shown = (await get(`/admin/reports/${r.id}`).expect(200)).body.data;
      expect(shown).toMatchObject({ status: 'EXPIRED', download: null });
      // a link signed before expiry but used after is refused for its age first; sign a new one to see the file check
      expect((await http.get(link).expect(410)).body.error.code).toMatch(/LINK_EXPIRED|REPORT_EXPIRED/);
    });
  });

  describe('failures and limits', () => {
    it('a report over the row limit fails with a clear message and is not retried', async () => {
      service.maxRows = 2;
      try {
        const created = (await post({ type: 'ORDERS', from: '2020-02-10', to: '2020-02-12' }).expect(202)).body.data;
        // not the last attempt, yet it fails for good: retrying cannot make the report smaller
        await expect(service.generate(created.id, false)).rejects.toThrow(/more than 2 rows/);
        const shown = (await get(`/admin/reports/${created.id}`).expect(200)).body.data;
        expect(shown).toMatchObject({ status: 'FAILED', download: null });
        expect(shown.error).toMatch(/more than 2 rows.*shorter date range/);
        expect((await t.prisma.report.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(ReportStatus.FAILED);
        expect(await t.prisma.reportFile.count({ where: { reportId: created.id } })).toBe(0);
      } finally {
        service.maxRows = 250_000;
      }
    });

    it('a crash while building leaves the report queued for the retry, and marks it failed only on the last attempt', async () => {
      const spy = jest.spyOn(REPORT_SOURCES.ORDERS, 'batches').mockImplementation(() => {
        throw new Error('database went away');
      });
      try {
        const created = (await post({ type: 'ORDERS', from: '2020-02-10', to: '2020-02-10' }).expect(202)).body.data;
        await expect(service.generate(created.id, false)).rejects.toThrow('database went away');
        expect((await t.prisma.report.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(ReportStatus.QUEUED);
        await expect(service.generate(created.id, true)).rejects.toThrow('database went away');
        const failed = (await get(`/admin/reports/${created.id}`).expect(200)).body.data;
        expect(failed).toMatchObject({ status: 'FAILED', download: null });
        expect(failed.error).toBe('The report could not be built. Please try again.'); // no internal detail leaks
      } finally {
        spy.mockRestore();
      }
      // and the same report builds fine once the problem is gone
      const again = (await post({ type: 'ORDERS', from: '2020-02-10', to: '2020-02-10' }).expect(202)).body.data;
      await service.generate(again.id, true);
      await service.generate(again.id, true); // a repeat of a finished report changes nothing
      expect((await get(`/admin/reports/${again.id}`).expect(200)).body.data.status).toBe('READY');
    });

    it('rejects bad requests', async () => {
      for (const body of [{}, { type: 'NOPE' }, { type: 'ORDERS', format: 'PDF' }, { type: 'ORDERS', from: '2026-03-01', to: '2020-02-01' }, { type: 'ORDERS', from: '2018-01-01', to: '2020-02-01' }, { type: 'ORDERS', cityId: 0 }, { type: 'ORDERS', vendorId: 'x' }, { type: 'ORDERS', extra: 1 }]) {
        await post(body).expect(400);
      }
      await post({ type: 'ORDERS', vendorId: randomUUID() }).expect(404);
      await post({ type: 'ORDERS', cityId: basics.cityId + 9999 }).expect(404);
    });

    it('allows 20 reports an hour per admin', async () => {
      for (let i = 0; i < 20; i++) await post({ type: 'PAYOUTS', from: '2020-02-01', to: '2020-02-01' }).expect(202);
      const res = await post({ type: 'PAYOUTS', from: '2020-02-01', to: '2020-02-01' }).expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('who can see what', () => {
    it('lists and opens only your own reports; others get 404', async () => {
      const mine = (await post({ type: 'VENDORS', from: '2020-02-10', to: '2020-02-10' }).expect(202)).body.data;
      const other = await createAdmin(t);
      expect((await get('/admin/reports', other.auth).expect(200)).body.data).toEqual([]);
      await get(`/admin/reports/${mine.id}`, other.auth).expect(404);
      await get('/admin/reports/not-a-uuid').expect(400);
      const list = await get('/admin/reports?type=VENDORS&limit=1').expect(200);
      expect(list.body.data.map((x: { id: string }) => x.id)).toContain(mine.id);
      expect(list.body.meta).toHaveProperty('nextCursor');
    });

    it('pages newest first', async () => {
      const other = await createAdmin(t);
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        clock.set(new Date(NOW.getTime() + i * 1000));
        ids.push((await post({ type: 'PAYOUTS', from: '2020-02-01', to: '2020-02-01' }, other.auth).expect(202)).body.data.id);
      }
      const first = await get('/admin/reports?limit=2', other.auth).expect(200);
      expect(first.body.data.map((x: { id: string }) => x.id)).toEqual([ids[2], ids[1]]);
      const next = await get(`/admin/reports?limit=2&cursor=${first.body.meta.nextCursor}`, other.auth).expect(200);
      expect(next.body.data.map((x: { id: string }) => x.id)).toEqual([ids[0]]);
      expect(next.body.meta.nextCursor).toBeNull();
    });

    it('is for admins only', async () => {
      const c = await createCustomer(t);
      await http.post('/api/v1/admin/reports').send({ type: 'ORDERS' }).expect(401);
      await post({ type: 'ORDERS' }, c.auth).expect(403);
      await post({ type: 'ORDERS' }, vendor.owner.auth).expect(403);
      await get('/admin/reports', c.auth).expect(403);
    });
  });

  describe('large export (QA-8.2)', () => {
    const BULK = 100_000;
    const DAY = '2025-06-10';

    beforeAll(async () => {
      await t.prisma.$executeRaw`
        INSERT INTO "Order" ("id", "orderNo", "customerId", "vendorId", "cityId", "addressSnapshot", "status",
          "pickupSlotStart", "pickupSlotEnd", "deliverySlotStart", "deliverySlotEnd", "subtotal", "total",
          "commissionRatePct", "commissionAmount", "vendorEarning", "paymentMethod", "paymentStatus",
          "vendorRespondBy", "placedAt", "createdAt", "deliveredAt", "updatedAt")
        SELECT gen_random_uuid(), 'BULK-' || g, ${customer.user.id}::uuid, ${vendor.vendor.id}::uuid, ${basics.cityId}, '{}'::jsonb,
          'DELIVERED'::"OrderStatus", ts, ts, ts, ts, 100 + (g % 50), 100 + (g % 50), 15, 15, 85 + (g % 50),
          'COD'::"PaymentMethod", 'COD_PENDING'::"PaymentStatus", ts, ts, ts, ts + interval '2 hours', ts
        FROM (SELECT g, TIMESTAMP '2025-06-10 00:00:00' + (g % 60000) * interval '1 second' AS ts FROM generate_series(1, ${BULK}) g) s`;
    }, 120_000);
    afterAll(async () => {
      await t.prisma.$executeRaw`DELETE FROM "Order" WHERE "orderNo" LIKE 'BULK-%'`;
    }, 120_000);

    /** Longest stretch the event loop was stuck while `work` ran: if it is long, the API would have stalled. */
    async function longestStall(work: () => Promise<unknown>) {
      let last = Date.now();
      let worst = 0;
      const timer = setInterval(() => {
        const now = Date.now();
        worst = Math.max(worst, now - last - 20);
        last = now;
      }, 20);
      try {
        await work();
      } finally {
        clearInterval(timer);
      }
      return worst;
    }

    it('100,000 orders as CSV: every row present, totals equal the table, and the API stays responsive', async () => {
      const created = (await post({ type: 'ORDERS', from: DAY, to: DAY, vendorId: vendor.vendor.id }).expect(202)).body.data;
      const started = Date.now();
      const stall = await longestStall(() => service.generate(created.id, true));
      const seconds = (Date.now() - started) / 1000;
      const ready = (await get(`/admin/reports/${created.id}`).expect(200)).body.data;
      expect(ready).toMatchObject({ status: 'READY', rowCount: BULK });
      const text = ((await fetchFile(ready.download.url).expect(200)).body as Buffer).toString('utf8').slice(1);
      const [header, ...rows] = parseCsv(text);
      expect(rows).toHaveLength(BULK);
      const sql = await t.prisma.order.aggregate({ where: { orderNo: { startsWith: 'BULK-' } }, _sum: { total: true } });
      const totalCol = header.indexOf('Total');
      const cents = rows.reduce((n, r) => n + Math.round(Number(r[totalCol]) * 100), 0);
      expect(cents / 100).toBe(Number(sql._sum.total));
      expect(new Set(rows.map((r) => r[0])).size).toBe(BULK); // no row twice, none skipped
      // eslint-disable-next-line no-console
      console.log(`CSV 100k: ${seconds.toFixed(1)}s, longest event-loop stall ${stall} ms, ${(ready.byteSize / 1e6).toFixed(1)} MB`);
      expect(stall).toBeLessThan(1500);
    }, 240_000);

    it('100,000 orders as Excel: complete workbook, totals equal the table', async () => {
      const created = (await post({ type: 'ORDERS', format: 'XLSX', from: DAY, to: DAY, vendorId: vendor.vendor.id }).expect(202)).body.data;
      const started = Date.now();
      const stall = await longestStall(() => service.generate(created.id, true));
      const seconds = (Date.now() - started) / 1000;
      const ready = (await get(`/admin/reports/${created.id}`).expect(200)).body.data;
      expect(ready).toMatchObject({ status: 'READY', rowCount: BULK });
      const buffer = (await fetchFile(ready.download.url).expect(200)).body as Buffer;
      const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {});
      let rows = 0;
      let cents = 0;
      let totalCol = -1;
      for await (const sheet of reader) {
        for await (const row of sheet as AsyncIterable<ExcelJS.Row>) {
          if (row.number === 1) totalCol = (row.values as unknown[]).indexOf('Total');
          else {
            rows++;
            cents += Math.round(Number(row.getCell(totalCol).value) * 100);
          }
        }
      }
      expect(rows).toBe(BULK);
      const sql = await t.prisma.order.aggregate({ where: { orderNo: { startsWith: 'BULK-' } }, _sum: { total: true } });
      expect(cents / 100).toBe(Number(sql._sum.total));
      // eslint-disable-next-line no-console
      console.log(`XLSX 100k: ${seconds.toFixed(1)}s, longest event-loop stall ${stall} ms, ${(ready.byteSize / 1e6).toFixed(1)} MB`);
      expect(stall).toBeLessThan(1500);
    }, 240_000);
  });
});
