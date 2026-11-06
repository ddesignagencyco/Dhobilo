import type { TemplateLocale, TemplateName, TemplateParams } from '../order-templates';
import { renderEmail } from './index';
import type { EmailTemplateName, EmailVars, OrderCardData, RenderedEmail } from './index';

/** Notification templates that have a designed email. `delivery_code` is deliberately absent: it carries a secret. */
const EMAIL_FOR: Partial<Record<TemplateName, EmailTemplateName>> = {
  order_placed: 'order_placed',
  order_accepted: 'order_accepted',
  order_rejected: 'order_rejected',
  order_cancelled: 'order_cancelled',
  order_picked_up: 'order_picked_up',
  order_in_process: 'order_in_process',
  order_ready: 'order_ready',
  order_out_for_delivery: 'order_out_for_delivery',
  order_delivered: 'order_delivered',
  order_rider_assigned: 'order_rider_assigned',
  vendor_new_order: 'vendor_new_order',
  vendor_order_cancelled: 'vendor_order_cancelled',
  vendor_order_expired: 'vendor_order_expired',
  rider_job_offer: 'rider_job_offer',
  rider_job_assigned: 'rider_job_assigned',
  rider_job_cancelled: 'rider_job_cancelled',
};

export interface NotificationEmailContext {
  appUrl: string;
  orderId?: string;
  card?: OrderCardData;
}

/** The designed email for a notification, or null when that notification only goes out as text. */
export function emailForNotification(template: TemplateName, locale: TemplateLocale, params: TemplateParams, ctx: NotificationEmailContext): RenderedEmail | null {
  const name = EMAIL_FOR[template];
  if (!name) return null;
  const vars: EmailVars = {
    orderNo: params.orderNo,
    orderId: ctx.orderId,
    vendor: params.vendor,
    reason: params.reason || undefined,
    minutes: params.minutes,
    rider: params.rider,
    jobType: params.jobType,
    order: ctx.card ?? { orderNo: params.orderNo, shop: params.vendor, itemCount: params.items, total: params.total ? `Rs ${params.total}` : undefined },
  };
  return renderEmail(name, vars, locale, { appUrl: ctx.appUrl });
}
