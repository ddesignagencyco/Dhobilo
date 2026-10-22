import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CourierPartner, JobStatus, JobType, Prisma } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { DomainEvent } from '../../../common/events/domain-events';
import type { DeliveryJobChangedEvent } from '../../../common/events/domain-events';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { DeliveryJobsService } from '../delivery-jobs.service';
import { OpsAlertService } from '../ops-alert.service';
import { COURIER_PROVIDERS, CourierProvider } from './courier-provider';

/** Connects delivery jobs to courier partners: hands jobs over, cancels them, and applies the partner's webhooks. */
@Injectable()
export class CourierService {
  private readonly logger = new Logger(CourierService.name);
  private readonly providers: Map<string, CourierProvider>;

  constructor(
    @Inject(COURIER_PROVIDERS) providers: CourierProvider[],
    private readonly prisma: PrismaService,
    private readonly jobs: DeliveryJobsService,
    private readonly ops: OpsAlertService,
  ) {
    this.providers = new Map(providers.map((p) => [p.code, p]));
  }

  /** The adapter for a partner row, or null if we have no code for it. */
  providerFor(partner: Pick<CourierPartner, 'code'>): CourierProvider | null {
    return this.providers.get(partner.code) ?? null;
  }

  /** Gives an unassigned job to the city's partner. Throws if the partner can't take it (the dispatch job retries). */
  async handOff(jobId: string, partner: CourierPartner): Promise<void> {
    const provider = this.providerFor(partner);
    if (!provider) throw new Error(`No adapter for courier partner "${partner.code}"`);
    const job = await this.prisma.deliveryJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { order: { select: { orderNo: true, addressSnapshot: true, vendor: { select: { businessName: true, addressLine: true, lat: true, lng: true } } } } },
    });
    const customer = job.order.addressSnapshot as { line1: string; area?: string; lat: number; lng: number };
    const shop = { name: job.order.vendor.businessName, address: job.order.vendor.addressLine, lat: job.order.vendor.lat, lng: job.order.vendor.lng };
    const home = { name: 'Customer', address: [customer.line1, customer.area].filter(Boolean).join(', '), lat: customer.lat, lng: customer.lng };
    const pickup = job.jobType === JobType.PICKUP;
    const { partnerRef } = await provider.createJob({
      jobId,
      orderNo: job.order.orderNo,
      jobType: job.jobType,
      from: pickup ? home : shop,
      to: pickup ? shop : home,
      scheduledStart: job.scheduledStart,
      scheduledEnd: job.scheduledEnd,
    });
    await this.jobs.assignToPartner(jobId, partner.id, partnerRef);
  }

  /** The job was cancelled on our side: tell the partner so they don't send someone. */
  @OnEvent(DomainEvent.DELIVERY_JOB_CHANGED, { async: true })
  async onJobChanged(e: DeliveryJobChangedEvent): Promise<void> {
    if (e.to !== JobStatus.CANCELLED) return;
    try {
      const job = await this.prisma.deliveryJob.findUnique({ where: { id: e.jobId }, select: { partnerRef: true, partner: { select: { code: true } } } });
      if (!job?.partnerRef || !job.partner) return;
      await this.providerFor(job.partner)?.cancelJob(job.partnerRef);
    } catch (err) {
      this.logger.error({ err, jobId: e.jobId }, 'Could not cancel the job at the courier partner');
      await this.ops.alert('Could not cancel a courier job', `Job ${e.jobId} was cancelled here but the partner may still send someone.`, { jobId: e.jobId });
    }
  }

  /**
   * A partner's status call. The signature is checked first; then the event id is recorded, and a repeat of an id we
   * already have changes nothing (partners retry). If applying the event fails, the record is removed so their retry
   * gets another chance.
   */
  async handleWebhook(code: string, headers: Record<string, string | string[] | undefined>, body: unknown): Promise<{ duplicate: boolean }> {
    const partner = await this.prisma.courierPartner.findUnique({ where: { code } });
    const provider = partner && this.providerFor(partner);
    if (!partner || !provider) throw new AppException(ErrorCode.NOT_FOUND, 'Unknown courier partner.', HttpStatus.NOT_FOUND);
    if (!provider.verifyWebhook(headers, body)) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Invalid webhook signature.', HttpStatus.UNAUTHORIZED);
    }
    const event = provider.parseWebhook(body);
    if (!event) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Malformed webhook payload.', HttpStatus.BAD_REQUEST);

    let recorded: { id: string };
    try {
      recorded = await this.prisma.courierWebhookEvent.create({
        data: { partnerId: partner.id, eventId: event.eventId, payload: body as Prisma.InputJsonValue },
        select: { id: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { duplicate: true };
      throw err;
    }

    try {
      const job = await this.prisma.deliveryJob.findFirst({ where: { partnerId: partner.id, partnerRef: event.trackingRef } });
      if (!job) throw new AppException(ErrorCode.NOT_FOUND, 'No job with that tracking reference.', HttpStatus.NOT_FOUND);
      await this.jobs.applyPartnerProgress(job, event.status, event.reason);
    } catch (err) {
      await this.prisma.courierWebhookEvent.delete({ where: { id: recorded.id } }).catch(() => undefined);
      throw err;
    }
    return { duplicate: false };
  }
}
