import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Locale, NotificationChannel, NotificationStatus, OrderStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { DomainEvent } from '../../common/events/domain-events';
import type { OrderPlacedEvent, OrderStatusChangedEvent } from '../../common/events/domain-events';
import { fmt, money } from '../../common/money/money';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QUEUES } from '../../infra/queue/queues';
import { NotificationPrefs, resolvePrefs } from './notification-prefs';
import {
  SEND_EMAIL_JOB,
  SEND_PUSH_JOB,
  SEND_SMS_JOB,
  SEND_WHATSAPP_JOB,
  SendEmailJob,
  SendPushJob,
  SendSmsJob,
  SendWhatsAppJob,
} from './notifications.processor';
import { TemplateLocale, TemplateName, TemplateParams, renderTemplate } from './templates/order-templates';
import { whatsappParams } from './templates/whatsapp-templates';

const personSelect = {
  id: true,
  locale: true,
  phone: true,
  email: true,
  notificationPrefs: true,
  deviceTokens: { select: { token: true } },
} satisfies Prisma.UserSelect;

type Person = Prisma.UserGetPayload<{ select: typeof personSelect }>;

/** Which of a person's channels a notice may use. */
export interface Reach {
  push: boolean;
  text: boolean; // WhatsApp, falling back to SMS
  email: boolean;
}

interface Notice {
  person: Person;
  template: TemplateName;
  params: TemplateParams;
  reach: Reach;
  data: Record<string, string>;
}

/** Templates whose text carries a secret: the delivery goes out, but the log row keeps only the title. */
const SECRET_TEMPLATES: readonly TemplateName[] = ['delivery_code'];

const FOR_STATUS: Partial<Record<OrderStatus, TemplateName>> = {
  ACCEPTED: 'order_accepted',
  REJECTED: 'order_rejected',
  CANCELLED: 'order_cancelled',
  PICKED_UP: 'order_picked_up',
  IN_PROCESS: 'order_in_process',
  READY: 'order_ready',
  OUT_FOR_DELIVERY: 'order_out_for_delivery',
  DELIVERED: 'order_delivered',
};

const lang = (l: Locale): TemplateLocale => (l === Locale.UR ? 'ur' : 'en');

/**
 * Turns order events into messages (FR-C10): picks who to tell (customer, and the vendor's people for new,
 * cancelled and expired orders), renders each person's language, respects their channel preferences, writes a
 * `Notification` log row per channel and queues the delivery jobs. Listens in both the API and the worker, since
 * timers change orders from the worker. It never throws: a notification problem must not break an order.
 */
@Injectable()
export class NotificationOrchestrator {
  private readonly logger = new Logger(NotificationOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  @OnEvent(DomainEvent.ORDER_PLACED, { async: false })
  async onPlaced(e: OrderPlacedEvent): Promise<void> {
    await this.safely(e.orderId, async () => {
      const o = await this.load(e.orderId);
      if (!o) return;
      const common = { orderNo: o.orderNo, vendor: o.vendor.businessName };
      const data = { orderId: e.orderId, type: 'ORDER_PLACED' };
      const notices: Notice[] = [
        { person: o.customer, template: 'order_placed', params: common, reach: { push: true, text: true, email: false }, data },
        ...this.vendorPeople(o, 'vendor_new_order', { orderNo: o.orderNo, items: o.itemCount, total: fmt(money(o.total)), minutes: o.vendor.respondWithinMin }, data),
      ];
      await Promise.all(notices.map((n) => this.dispatch(n, e.requestId)));
    });
  }

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: false })
  async onChanged(e: OrderStatusChangedEvent): Promise<void> {
    await this.safely(e.orderId, async () => {
      const template = FOR_STATUS[e.to];
      if (!template) return;
      const o = await this.load(e.orderId);
      if (!o) return;

      const reason = e.reason ?? '';
      const params: TemplateParams = { orderNo: o.orderNo, vendor: o.vendor.businessName, reason };
      const data = { orderId: e.orderId, status: e.to, type: 'ORDER_STATUS' };
      const notices: Notice[] = [];

      // The customer hears about every step, except cancellations they made themselves.
      if (!(e.to === OrderStatus.CANCELLED && e.actor === 'CUSTOMER')) {
        notices.push({ person: o.customer, template, params, reach: { push: true, text: true, email: false }, data });
      }
      // The vendor only needs telling about things they did not do themselves.
      if (e.to === OrderStatus.REJECTED && e.actor === 'SYSTEM') {
        notices.push(...this.vendorPeople(o, 'vendor_order_expired', { orderNo: o.orderNo }, data));
      }
      if (e.to === OrderStatus.CANCELLED && (e.actor === 'CUSTOMER' || e.actor === 'ADMIN')) {
        notices.push(...this.vendorPeople(o, 'vendor_order_cancelled', { orderNo: o.orderNo, reason }, data));
      }
      await Promise.all(notices.map((n) => this.dispatch(n, e.requestId)));
    });
  }

  /**
   * Sends one templated message to one user outside the order-status flow (rider offers, delivery codes, rider
   * assignments). Respects the person's language and channel preferences. Never throws.
   */
  async notifyUser(
    userId: string,
    template: TemplateName,
    params: TemplateParams,
    data: Record<string, string>,
    reach: Reach = { push: true, text: true, email: false },
    requestId?: string,
  ): Promise<void> {
    try {
      const person = await this.prisma.user.findUnique({ where: { id: userId }, select: personSelect });
      if (person) await this.dispatch({ person, template, params, reach, data }, requestId);
    } catch (err) {
      this.logger.error({ err, userId, template }, 'Could not send a notification');
    }
  }

  /** Owner gets every channel (incl. email); staff get push only, so a shared shop phone isn't spammed. */
  private vendorPeople(o: LoadedOrder, template: TemplateName, params: TemplateParams, data: Record<string, string>): Notice[] {
    return [
      { person: o.vendor.owner, template, params, reach: { push: true, text: true, email: true }, data },
      ...o.vendor.staff.map((s) => ({ person: s.user, template, params, reach: { push: true, text: false, email: false }, data })),
    ];
  }

  private async dispatch(n: Notice, requestId?: string): Promise<void> {
    const prefs: NotificationPrefs = resolvePrefs(n.person.notificationPrefs);
    const locale = lang(n.person.locale);
    const msg = renderTemplate(n.template, locale, n.params);
    const payload = { title: msg.title, body: SECRET_TEMPLATES.includes(n.template) ? '(hidden)' : msg.body, data: n.data } satisfies Prisma.InputJsonObject;
    const tokens = n.person.deviceTokens.map((t) => t.token);

    const queueJob = async (channel: NotificationChannel, name: string, job: (id: string) => object) => {
      const row = await this.prisma.notification.create({
        data: { userId: n.person.id, channel, template: n.template, payload, status: NotificationStatus.QUEUED },
        select: { id: true },
      });
      try {
        await this.queue.add(name, { ...job(row.id), notificationId: row.id, requestId });
      } catch (err) {
        await this.prisma.notification.update({ where: { id: row.id }, data: { status: NotificationStatus.FAILED, error: String(err).slice(0, 500) } });
        throw err;
      }
    };

    const jobs: Promise<void>[] = [];
    if (n.reach.push && prefs.push && tokens.length > 0) {
      jobs.push(queueJob(NotificationChannel.PUSH, SEND_PUSH_JOB, () => ({ tokens, title: msg.title, body: msg.body, data: n.data }) satisfies Omit<SendPushJob, 'notificationId'>));
    }
    if (n.reach.text && prefs.whatsapp) {
      jobs.push(
        queueJob(NotificationChannel.WHATSAPP, SEND_WHATSAPP_JOB, () =>
          ({
            to: n.person.phone,
            templateName: `${n.template}_${locale}`,
            language: locale,
            params: whatsappParams(n.template, n.params),
            fallbackText: msg.body,
            fallbackSms: prefs.sms,
            userId: n.person.id,
          }) satisfies Omit<SendWhatsAppJob, 'notificationId'>,
        ),
      );
    } else if (n.reach.text && prefs.sms) {
      jobs.push(queueJob(NotificationChannel.SMS, SEND_SMS_JOB, () => ({ to: n.person.phone, message: msg.body }) satisfies Omit<SendSmsJob, 'notificationId'>));
    }
    if (n.reach.email && prefs.email && n.person.email) {
      jobs.push(queueJob(NotificationChannel.EMAIL, SEND_EMAIL_JOB, () => ({ to: n.person.email!, subject: msg.title, text: msg.body }) satisfies Omit<SendEmailJob, 'notificationId'>));
    }
    // One failing channel must not stop the others.
    const results = await Promise.allSettled(jobs);
    for (const r of results) if (r.status === 'rejected') this.logger.error({ err: r.reason, orderId: n.data.orderId }, 'Could not queue a notification');
  }

  private async load(orderId: string) {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNo: true,
        total: true,
        customer: { select: personSelect },
        vendor: {
          select: {
            businessName: true,
            respondWithinMin: true,
            owner: { select: personSelect },
            staff: { select: { user: { select: personSelect } } },
          },
        },
        _count: { select: { items: true } },
      },
    });
    return o ? { ...o, itemCount: o._count.items } : null;
  }

  private async safely(orderId: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error({ err, orderId }, 'Could not create order notifications');
    }
  }
}

type LoadedOrder = NonNullable<Awaited<ReturnType<NotificationOrchestrator['load']>>>;
