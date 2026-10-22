import { OrderStatus } from '@prisma/client';
import { ORDER_TEMPLATES, TemplateLocale, TemplateName, TemplateParams, renderTemplate } from './order-templates';
import { WHATSAPP_TEMPLATES, whatsappParams } from './whatsapp-templates';

const NAMES = Object.keys(ORDER_TEMPLATES) as TemplateName[];
const LOCALES: TemplateLocale[] = ['en', 'ur'];
const FULL: TemplateParams = { orderNo: 'DHB-LHR-000123', vendor: 'Sparkle Laundry', reason: 'Too busy today.', items: 3, total: '510.00', minutes: 15, rider: 'Bilal', code: '4821', jobType: 'delivery' };

describe('notification templates', () => {
  it('every template exists in English and Urdu with a non-empty title and body', () => {
    for (const name of NAMES) {
      for (const locale of LOCALES) {
        const t = ORDER_TEMPLATES[name][locale];
        expect({ name, locale, ok: !!t.title.trim() && !!t.body.trim() }).toEqual({ name, locale, ok: true });
      }
    }
  });

  it('fills every placeholder and leaves no braces behind', () => {
    for (const name of NAMES) {
      for (const locale of LOCALES) {
        const r = renderTemplate(name, locale, FULL);
        expect(`${r.title} ${r.body}`).not.toMatch(/[{}]/);
        expect(r.body).toContain('DHB-LHR-000123');
      }
    }
  });

  it('Urdu templates are really Urdu (Arabic-script text), English ones are not', () => {
    const arabicScript = /[؀-ۿ]/;
    for (const name of NAMES) {
      expect(arabicScript.test(ORDER_TEMPLATES[name].ur.body)).toBe(true);
      expect(arabicScript.test(ORDER_TEMPLATES[name].en.body)).toBe(false);
    }
  });

  it('handles missing optional params gracefully (no "undefined", no double spaces)', () => {
    const r = renderTemplate('order_rejected', 'en', { orderNo: 'DHB-1', vendor: 'V' });
    expect(r.body).toBe('Sorry, V could not take your order DHB-1.');
    expect(r.body).not.toMatch(/undefined|\s{2,}/);
  });

  it('renders the vendor alert with counts and deadline', () => {
    expect(renderTemplate('vendor_new_order', 'en', FULL).body).toBe('New order DHB-LHR-000123: 3 item(s), Rs 510.00. Please respond within 15 min.');
  });

  it("writes the job type in the reader's language and only shows the code where a template asks for it", () => {
    expect(renderTemplate('rider_job_offer', 'en', FULL).body).toBe('New delivery job for order DHB-LHR-000123. Open the app and accept within 15 min.');
    expect(renderTemplate('rider_job_offer', 'ur', { ...FULL, jobType: 'pickup' }).body).toContain('پک اپ');
    expect(renderTemplate('delivery_code', 'en', FULL).body).toContain('4821');
    expect(renderTemplate('order_accepted', 'en', FULL).body).not.toContain('4821');
  });

  it('there is a customer template for every status an order can enter', () => {
    const forStatus: Partial<Record<OrderStatus, TemplateName>> = {
      PLACED: 'order_placed',
      ACCEPTED: 'order_accepted',
      REJECTED: 'order_rejected',
      CANCELLED: 'order_cancelled',
      PICKED_UP: 'order_picked_up',
      IN_PROCESS: 'order_in_process',
      READY: 'order_ready',
      OUT_FOR_DELIVERY: 'order_out_for_delivery',
      DELIVERED: 'order_delivered',
    };
    for (const status of Object.values(OrderStatus)) expect({ status, has: !!forStatus[status] }).toEqual({ status, has: true });
  });
});

describe('WhatsApp template map', () => {
  it('has an entry for every template, with unique BSP ids', () => {
    expect(Object.keys(WHATSAPP_TEMPLATES).sort()).toEqual([...NAMES].sort());
    const ids = Object.values(WHATSAPP_TEMPLATES).map((t) => t.bspId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('orders placeholders as declared and never sends an empty value', () => {
    expect(whatsappParams('vendor_new_order', FULL)).toEqual(['DHB-LHR-000123', '3', '510.00', '15']);
    expect(whatsappParams('order_rejected', { orderNo: 'X', vendor: 'V' })).toEqual(['X', 'V', '-']);
  });
});
