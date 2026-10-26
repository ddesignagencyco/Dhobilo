import { createHmac, timingSafeEqual } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Report, ReportFormat, ReportStatus } from '@prisma/client';
import { Queue, UnrecoverableError } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { Clock } from '../../common/time/clock';
import { resolveDayRange } from '../../common/time/date-range';
import { localParts } from '../../common/time/zoned';
import { beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import { QUEUES } from '../../infra/queue/queues';
import { CsvWriter, ReportWriter, XlsxWriter } from './report-formats';
import { REPORT_SOURCES, ReportParams, ReportWindow } from './report-sources';
import { GENERATE_REPORT_JOB, GenerateReportJob } from './reports.jobs';
import { CreateReportDto, ListReportsQueryDto } from './reports.dto';

const TZ = 'Asia/Karachi';
const MAX_DAYS = 366;
/** A report that would be bigger than this must be split by date (keeps memory and file size sane). */
export const MAX_REPORT_ROWS = 250_000;
const BATCH_SIZE = 1000;
const LINK_TTL_SEC = 600;
const KEEP_FILES_DAYS = 7;
const REPORTS_PER_HOUR = 20;

const CONTENT_TYPE: Record<ReportFormat, string> = {
  CSV: 'text/csv; charset=utf-8',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

@Injectable()
export class ReportsService {
  /** Public so tests can lower it; production uses MAX_REPORT_ROWS. */
  maxRows = MAX_REPORT_ROWS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
    private readonly limiter: RateLimiter,
    @InjectQueue(QUEUES.EXPORTS) private readonly queue: Queue,
  ) {}

  // ───────────── requesting and reading ─────────────

  async create(dto: CreateReportDto, adminId: string) {
    await this.limiter.consume(`rl:reports:user:${adminId}`, REPORTS_PER_HOUR, 3600);
    const today = localParts(this.clock.now(), TZ).date;
    const range = resolveDayRange(dto, today, { defaultDays: 30, maxDays: MAX_DAYS });
    if (dto.cityId && !(await this.prisma.city.findUnique({ where: { id: dto.cityId }, select: { id: true } }))) {
      throw new AppException('CITY_NOT_FOUND', 'No such city', HttpStatus.NOT_FOUND);
    }
    if (dto.vendorId && !(await this.prisma.vendor.findUnique({ where: { id: dto.vendorId }, select: { id: true } }))) {
      throw new AppException('VENDOR_NOT_FOUND', 'No such vendor', HttpStatus.NOT_FOUND);
    }
    const params: ReportParams = { from: range.from, to: range.to, ...(dto.cityId ? { cityId: dto.cityId } : {}), ...(dto.vendorId ? { vendorId: dto.vendorId } : {}) };
    const report = await this.prisma.report.create({
      data: { type: dto.type, format: dto.format ?? ReportFormat.CSV, params: params as unknown as Prisma.InputJsonValue, requestedById: adminId },
    });
    try {
      await this.queue.add(GENERATE_REPORT_JOB, { reportId: report.id } satisfies GenerateReportJob);
    } catch (err) {
      await this.prisma.report.update({ where: { id: report.id }, data: { status: ReportStatus.FAILED, error: 'Could not queue the report. Please try again.' } });
      throw new AppException('REPORT_NOT_QUEUED', 'Could not queue the report. Please try again.', HttpStatus.SERVICE_UNAVAILABLE, { cause: String(err) });
    }
    return this.view(report);
  }

  async list(q: ListReportsQueryDto, adminId: string) {
    const limit = q.limit ?? 20;
    const rows = await this.prisma.report.findMany({
      where: { requestedById: adminId, ...(q.type ? { type: q.type } : {}), ...(q.status ? { status: q.status } : {}), ...beforeCursor(q.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return { items: items.map((r) => this.view(r)), nextCursor };
  }

  async get(id: string, adminId: string) {
    const report = await this.prisma.report.findFirst({ where: { id, requestedById: adminId } });
    if (!report) throw new AppException('REPORT_NOT_FOUND', 'No such report', HttpStatus.NOT_FOUND);
    return this.view(report);
  }

  private view(r: Report) {
    const ready = r.status === ReportStatus.READY && !!r.expiresAt && r.expiresAt > this.clock.now();
    return {
      id: r.id,
      type: r.type,
      format: r.format,
      params: r.params,
      status: ready || r.status !== ReportStatus.READY ? r.status : ReportStatus.EXPIRED,
      rowCount: r.rowCount,
      byteSize: r.byteSize,
      fileName: r.fileName,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      // A fresh short-lived link every time the report is read; it works without a login (e.g. in a browser tab).
      download: ready ? this.signedLink(r.id) : null,
    };
  }

  // ───────────── signed download links ─────────────

  private sign(id: string, exp: number): string {
    const key = Buffer.from(this.config.get('HMAC_KEY_BASE64', { infer: true }), 'base64');
    return createHmac('sha256', key).update(`report:${id}:${exp}`).digest('hex');
  }

  private signedLink(id: string): { url: string; expiresAt: string } {
    const exp = Math.floor(this.clock.now().getTime() / 1000) + LINK_TTL_SEC;
    return { url: `/api/v1/reports/${id}/download?exp=${exp}&sig=${this.sign(id, exp)}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  async download(id: string, exp: number, sig: string): Promise<{ data: Buffer; fileName: string; contentType: string }> {
    const expected = Buffer.from(this.sign(id, exp), 'hex');
    const given = Buffer.from(sig, 'hex');
    const valid = given.length === expected.length && timingSafeEqual(given, expected);
    if (!valid) throw new AppException('LINK_INVALID', 'This download link is not valid', HttpStatus.FORBIDDEN);
    if (exp * 1000 < this.clock.now().getTime()) throw new AppException('LINK_EXPIRED', 'This download link has expired. Open the report again for a new one.', HttpStatus.GONE);
    const report = await this.prisma.report.findUnique({ where: { id }, include: { file: true } });
    if (!report || report.status !== ReportStatus.READY || !report.file || !report.fileName) {
      throw new AppException('REPORT_NOT_READY', 'This report has no file to download', HttpStatus.NOT_FOUND);
    }
    if (report.expiresAt && report.expiresAt <= this.clock.now()) {
      throw new AppException('REPORT_EXPIRED', 'This report has expired. Request it again.', HttpStatus.GONE);
    }
    return { data: Buffer.from(report.file.data), fileName: report.fileName, contentType: CONTENT_TYPE[report.format] };
  }

  // ───────────── worker side ─────────────

  /**
   * Builds the file. Safe to repeat (a retry starts over and replaces the file). `final` tells whether a failure
   * is the last attempt, so only then the report is marked FAILED; earlier attempts leave it QUEUED for the retry.
   */
  async generate(reportId: string, final: boolean): Promise<void> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report || report.status === ReportStatus.READY) return;
    await this.prisma.report.update({ where: { id: reportId }, data: { status: ReportStatus.RUNNING, startedAt: this.clock.now(), error: null } });
    try {
      const params = report.params as unknown as ReportParams;
      const range = resolveDayRange(params, params.to, { defaultDays: 1, maxDays: MAX_DAYS });
      const window: ReportWindow = { ...params, start: range.start, end: range.end };
      const source = REPORT_SOURCES[report.type];
      const writer: ReportWriter = report.format === ReportFormat.XLSX ? new XlsxWriter(source.columns, source.title) : new CsvWriter(source.columns);
      let rows = 0;
      for await (const batch of source.batches(this.prisma, window, BATCH_SIZE)) {
        rows += batch.length;
        if (rows > this.maxRows) {
          throw new UnrecoverableError(`This report has more than ${this.maxRows.toLocaleString('en')} rows. Choose a shorter date range or a single city.`);
        }
        await writer.write(batch);
        // Let the API answer its requests between batches: a big export must never starve this process.
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const data = new Uint8Array(await writer.finish());
      const now = this.clock.now();
      const stem = `dhoblio-${report.type.toLowerCase()}-${params.from}_to_${params.to}`;
      await this.prisma.$transaction([
        this.prisma.reportFile.upsert({ where: { reportId }, create: { reportId, data }, update: { data } }),
        this.prisma.report.update({
          where: { id: reportId },
          data: {
            status: ReportStatus.READY,
            rowCount: rows,
            byteSize: data.byteLength,
            fileName: `${stem}.${report.format.toLowerCase()}`,
            completedAt: now,
            expiresAt: new Date(now.getTime() + KEEP_FILES_DAYS * 86_400_000),
            error: null,
          },
        }),
      ]);
    } catch (err) {
      const unrecoverable = err instanceof UnrecoverableError;
      await this.prisma.report.update({
        where: { id: reportId },
        data: unrecoverable || final
          ? { status: ReportStatus.FAILED, error: (unrecoverable ? (err as Error).message : 'The report could not be built. Please try again.').slice(0, 500) }
          : { status: ReportStatus.QUEUED },
      });
      throw err;
    }
  }

  /** Deletes the stored files of reports past their expiry (the request itself stays in the history as EXPIRED). */
  async purgeExpired(): Promise<number> {
    const now = this.clock.now();
    const stale = await this.prisma.report.findMany({
      where: { status: ReportStatus.READY, expiresAt: { lte: now } },
      select: { id: true },
      take: 500,
    });
    if (stale.length === 0) return 0;
    const ids = stale.map((r) => r.id);
    await this.prisma.$transaction([
      this.prisma.reportFile.deleteMany({ where: { reportId: { in: ids } } }),
      this.prisma.report.updateMany({ where: { id: { in: ids } }, data: { status: ReportStatus.EXPIRED } }),
    ]);
    return ids.length;
  }
}
