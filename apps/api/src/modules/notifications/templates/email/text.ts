import { safeUrl } from './html';
import { UI } from './labels';
import type { Block, EmailLocale, EmailModel, OrderCardData } from './model';

function orderLines(o: OrderCardData, locale: EmailLocale): string[] {
  const u = UI[locale];
  const out = [`${u.order}: ${o.orderNo}${o.shop ? ` - ${o.shop}` : ''}`];
  for (const it of o.items ?? []) out.push(`  ${it.name} x ${it.qty}   ${it.amount}`);
  if (!o.items?.length && o.itemCount) out.push(`  ${u.itemCount(o.itemCount)}`);
  if (o.subtotal && o.items?.length) out.push(`${u.subtotal}: ${o.subtotal}`);
  if (o.deliveryFee) out.push(`${u.deliveryFee}: ${o.deliveryFee}`);
  if (o.discount) out.push(`${u.discount}: - ${o.discount.replace(/^-\s*/, '')}`);
  if (o.total) out.push(`${u.total}: ${o.total}`);
  if (o.pickup) out.push(`${u.pickup}: ${o.pickup}`);
  if (o.delivery) out.push(`${u.delivery}: ${o.delivery}`);
  if (o.address) out.push(`${u.address}: ${o.address}`);
  if (o.payment) out.push(`${u.payment}: ${o.payment}`);
  if (o.note) out.push(`${u.note}: ${o.note}`);
  return out;
}

function blockText(b: Block, locale: EmailLocale): string {
  switch (b.t) {
    case 'p':
      return b.text;
    case 'code':
      return `${[...b.code].join(' ')}${b.caption ? `\n${b.caption}` : ''}`;
    case 'stat':
      return `${b.label}: ${b.value}${b.hint ? ` (${b.hint})` : ''}`;
    case 'kv':
      return b.rows.map((r) => `${r.label}: ${r.value}`).join('\n');
    case 'order':
      return orderLines(b.order, locale).join('\n');
    case 'tracker': {
      const labels = UI[locale].tracker;
      return labels.map((l, i) => (i < b.step ? `[x] ${l}` : i === b.step ? `[>] ${l}` : `[ ] ${l}`)).join('  ');
    }
    case 'notice':
      return `${b.title ? `${b.title}: ` : ''}${b.text}`;
    case 'list':
      return `${b.title ? `${b.title}\n` : ''}${b.items.map((it, i) => `${i + 1}. ${it}`).join('\n')}`;
  }
}

export function renderText(m: EmailModel, locale: EmailLocale): string {
  const u = UI[locale];
  const parts = [
    ...(m.mirror ? [`[${u.mirrorBanner}] ${u.mirrorText}`] : []),
    `${m.title}${m.subtitle ? `\n${m.subtitle}` : ''}`,
    ...m.blocks.map((b) => blockText(b, locale)),
    ...(m.cta && safeUrl(m.cta.url) ? [`${m.cta.label}: ${m.cta.url}`] : []),
    `--\n${u.brand} - ${u.serving}\n${u.tagline}\n${u.help}\n${m.reason}`,
  ];
  return `${parts.join('\n\n')}\n`;
}
