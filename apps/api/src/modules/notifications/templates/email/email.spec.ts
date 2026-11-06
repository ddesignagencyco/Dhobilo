import { EMAIL_TEMPLATE_NAMES, isEmailTemplate, renderEmail, sampleVars } from './index';
import type { EmailLocale, EmailVars } from './index';
import { emailForNotification } from './from-notification';
import { orderCard, rs, slotRange } from '../../order-email-data';

const LOCALES: EmailLocale[] = ['en', 'ur'];
const ctx = { appUrl: 'https://app.dhoblio.pk' };

describe('email templates', () => {
  describe.each(EMAIL_TEMPLATE_NAMES)('%s', (name) => {
    it.each(LOCALES)('renders subject, html and text in %s', (locale) => {
      const email = renderEmail(name, sampleVars(name), locale, ctx);
      expect(email.subject.trim().length).toBeGreaterThan(3);
      expect(email.html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(email.text.trim().length).toBeGreaterThan(20);
      expect(email.html).toContain(`lang="${locale}"`);
      expect(email.html).toContain(locale === 'ur' ? 'dir="rtl"' : 'dir="ltr"');
      expect(email.html).not.toMatch(/\{\w+\}|undefined|\[object Object\]/);
      expect(email.text).not.toMatch(/undefined|\[object Object\]/);
    });

    it('is safe for email clients', () => {
      const { html } = renderEmail(name, sampleVars(name), 'en', ctx);
      expect(html).not.toMatch(/display:\s*(flex|grid)/i);
      expect(html).not.toMatch(/<script|<link |@import|<iframe/i);
      expect(html).toContain('style="');
      expect(html).toContain('color-scheme');
      expect(html).toContain('role="presentation"');
      expect(html).toMatch(/<table /);
    });

    it('keeps Latin digits in Urdu (glossary)', () => {
      const email = renderEmail(name, sampleVars(name), 'ur', ctx);
      expect(`${email.subject}${email.html}${email.text}`).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
    });
  });

  it('escapes every interpolated value', () => {
    const evil = `<img src=x onerror=alert(1)> "quoted" & 'single'`;
    const vars: EmailVars = {
      orderNo: evil,
      vendor: evil,
      reason: evil,
      rider: evil,
      name: evil,
      title: evil,
      body: evil,
      to: evil,
      content: evil,
      channel: evil,
      order: { orderNo: evil, shop: evil, items: [{ name: evil, qty: 1, amount: evil }], address: evil, pickup: evil, note: evil, total: evil },
      payout: { kind: 'PAID', amount: evil, accountRef: evil, txnRef: evil },
    };
    for (const name of EMAIL_TEMPLATE_NAMES) {
      for (const locale of LOCALES) {
        const { html } = renderEmail(name, { ...sampleVars(name), ...vars }, locale, ctx);
        expect(html).not.toContain('<img src=x');
        expect(html).not.toContain('onerror=alert(1)>');
      }
    }
    const { html } = renderEmail('vendor_decision', { name: evil, decision: 'REJECTED', reason: evil }, 'en', ctx);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp; &#39;single&#39;');
  });

  it('never turns a non-http link into a button', () => {
    const { html, text } = renderEmail('announcement', { title: 'x', body: 'y', ctaLabel: 'Click', ctaUrl: 'javascript:alert(1)' }, 'en', ctx);
    expect(html).not.toContain('javascript:');
    expect(text).not.toContain('javascript:');
    const ok = renderEmail('announcement', { title: 'x', body: 'y', ctaLabel: 'Click', ctaUrl: 'https://dhoblio.pk/a?b=1' }, 'en', ctx);
    expect(ok.html).toContain('href="https://dhoblio.pk/a?b=1"');
  });

  it('shows the sign-in code as separate digit boxes with the role in the copy', () => {
    const en = renderEmail('login_code', { role: 'RIDER', code: '482913', minutes: 5 }, 'en', ctx);
    expect(en.html).toContain('>4</td>');
    expect(en.html).toContain('>3</td>');
    expect(en.html).toContain('Rider');
    expect(en.subject).toBe('Your Dhoblio sign-in code is 482913');
    expect(en.text).toContain('4 8 2 9 1 3');
    const ur = renderEmail('login_code', { role: 'VENDOR_OWNER', code: '482913', minutes: 5 }, 'ur', ctx);
    expect(ur.html).toContain('دکان کے مالک');
    expect(ur.html).toContain('Noto Nastaliq Urdu');
  });

  it('builds the order card, tracker and CTA for order emails', () => {
    const email = renderEmail('order_delivered', sampleVars('order_delivered'), 'en', ctx);
    expect(email.html).toContain('DHB-LHR-000123');
    expect(email.html).toContain('Rs 1,670');
    expect(email.html).toContain('Delivered');
    expect(email.html).toContain('https://app.dhoblio.pk/en/orders/b7e2c1a4-3f5d-4e8a-9c21-5d6e7f8a9b01');
    expect(email.text).toContain('[x] Placed');
  });

  it('marks test-inbox copies clearly', () => {
    const email = renderEmail('login_code', { ...sampleVars('login_code'), mirror: true }, 'en', ctx);
    expect(email.html).toContain('Test copy');
    expect(email.text.startsWith('[Test copy]')).toBe(true);
  });

  it('recognises template names', () => {
    expect(isEmailTemplate('login_code')).toBe(true);
    expect(isEmailTemplate('toString')).toBe(false);
    expect(isEmailTemplate('nope')).toBe(false);
  });
});

describe('emailForNotification', () => {
  it('renders the designed email for an order notification', () => {
    const email = emailForNotification('order_accepted', 'ur', { orderNo: 'DHB-LHR-000123', vendor: 'Noor Laundry' }, { appUrl: ctx.appUrl, orderId: 'abc' });
    expect(email?.html).toContain('dir="rtl"');
    expect(email?.html).toContain('https://app.dhoblio.pk/ur/orders/abc');
  });

  it('has no email for the delivery code, which is a secret', () => {
    expect(emailForNotification('delivery_code', 'en', { orderNo: 'DHB-1', code: '4821' }, { appUrl: ctx.appUrl })).toBeNull();
  });
});

describe('order card data', () => {
  const order = {
    orderNo: 'DHB-LHR-000123',
    subtotal: '1620.00',
    discountTotal: '100.00',
    deliveryFee: '150.00',
    total: '1670.00',
    pickupSlotStart: new Date('2026-11-08T05:00:00Z'),
    pickupSlotEnd: new Date('2026-11-08T06:00:00Z'),
    deliverySlotStart: new Date('2026-11-10T13:00:00Z'),
    deliverySlotEnd: new Date('2026-11-10T14:00:00Z'),
    addressSnapshot: { line1: 'House 14', line2: 'Street 7', area: 'Gulberg III' },
    paymentMethod: 'COD',
    items: [{ name: 'Suit (2 piece)', nameUr: 'سوٹ (دو پیس)', qty: 1, lineTotal: '1100.00' }],
    vendor: { businessName: 'Al-Karam Dry Cleaners' },
  };

  it('formats money and Pakistan-time slots with Latin digits', () => {
    expect(rs('1250')).toBe('Rs 1,250');
    expect(rs('99.5')).toBe('Rs 99.5');
    expect(slotRange(order.pickupSlotStart, order.pickupSlotEnd, 'en')).toBe('Sun, 8 Nov, 10:00 am - 11:00 am');
    expect(slotRange(order.pickupSlotStart, order.pickupSlotEnd, 'ur')).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });

  it('builds the card in the reader\'s language', () => {
    const en = orderCard(order, 'en');
    expect(en).toMatchObject({ orderNo: 'DHB-LHR-000123', shop: 'Al-Karam Dry Cleaners', total: 'Rs 1,670', discount: 'Rs 100', deliveryFee: 'Rs 150', address: 'House 14, Street 7, Gulberg III', payment: 'Cash on delivery' });
    expect(en.items).toEqual([{ name: 'Suit (2 piece)', qty: 1, amount: 'Rs 1,100' }]);
    expect(orderCard(order, 'ur').items?.[0].name).toBe('سوٹ (دو پیس)');
    expect(orderCard({ ...order, discountTotal: '0.00', deliveryFee: '0.00' }, 'en')).toMatchObject({ discount: undefined, deliveryFee: undefined });
  });
});
