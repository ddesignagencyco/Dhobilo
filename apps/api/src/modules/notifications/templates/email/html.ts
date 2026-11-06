import { BRAND, FONT_LATIN, FONT_MONO, FONT_URDU, TONES } from './brand';
import { UI } from './labels';
import type { Block, EmailLocale, EmailModel, OrderCardData, RenderContext, Tone } from './model';

/** Escapes a value for use in HTML text or a quoted attribute. Every interpolated value goes through this. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only absolute http(s) links become buttons; anything else (javascript:, data:) is dropped. */
export function safeUrl(url: string): string | null {
  return /^https?:\/\/[^\s<>"']+$/i.test(url) ? url : null;
}

interface Dir {
  rtl: boolean;
  dir: 'ltr' | 'rtl';
  start: 'left' | 'right';
  end: 'left' | 'right';
  font: string;
  lh: number;
}

function dirFor(locale: EmailLocale): Dir {
  const rtl = locale === 'ur';
  return { rtl, dir: rtl ? 'rtl' : 'ltr', start: rtl ? 'right' : 'left', end: rtl ? 'left' : 'right', font: rtl ? FONT_URDU : FONT_LATIN, lh: rtl ? 2.1 : 1.6 };
}

/** Escapes, then keeps the author's line breaks. */
const rich = (text: string) => esc(text).replace(/\n/g, '<br>');

const space = (px: number) => `<tr><td height="${px}" style="height:${px}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

function paragraph(b: Extract<Block, { t: 'p' }>, d: Dir): string {
  const size = b.muted ? 14 : 16;
  return `<tr><td class="${b.muted ? 'em-muted' : 'em-text'}" align="${d.start}" style="font-size:${size}px;line-height:${b.muted ? d.lh : d.rtl ? 2.1 : 1.65};color:${b.muted ? BRAND.muted : BRAND.text};">${rich(b.text)}</td></tr>`;
}

function codeBlock(b: Extract<Block, { t: 'code' }>, d: Dir): string {
  const digits = [...b.code]
    .map(
      (c) =>
        `<td class="em-code" width="48" align="center" style="width:48px;height:64px;background:${BRAND.primaryTint};border:2px solid ${BRAND.primary};border-radius:12px;font-family:${FONT_MONO};font-size:32px;font-weight:700;line-height:60px;color:${BRAND.primaryDark};">${esc(c)}</td><td width="8" style="width:8px;font-size:0;">&nbsp;</td>`,
    )
    .join('');
  const caption = b.caption
    ? `<tr><td align="center" class="em-muted" style="padding-top:14px;font-size:14px;line-height:${d.lh};color:${BRAND.muted};">${esc(b.caption)}</td></tr>`
    : '';
  return `<tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="ltr" align="center"><tr>${digits}</tr></table></td></tr>${caption}`;
}

function statBlock(b: Extract<Block, { t: 'stat' }>, d: Dir): string {
  return `<tr><td class="em-code" align="center" style="background:${BRAND.primaryTint};border-radius:16px;padding:24px 20px;"><div class="em-muted" style="font-size:12px;font-weight:700;letter-spacing:${d.rtl ? 0 : '0.08em'};text-transform:${d.rtl ? 'none' : 'uppercase'};line-height:${d.lh};color:${BRAND.primaryDark};">${esc(b.label)}</div><div dir="ltr" style="padding-top:4px;font-size:42px;font-weight:800;line-height:1.15;letter-spacing:-0.02em;color:${BRAND.primaryDark};font-variant-numeric:tabular-nums;">${esc(b.value)}</div>${b.hint ? `<div class="em-muted" style="padding-top:6px;font-size:13px;line-height:${d.lh};color:${BRAND.primaryDark};">${esc(b.hint)}</div>` : ''}</td></tr>`;
}

function kvBlock(b: Extract<Block, { t: 'kv' }>, d: Dir): string {
  const rows = b.rows
    .map(
      (r, i) =>
        `<tr><td class="em-muted ${i ? 'em-border-t' : ''}" width="38%" valign="top" align="${d.start}" style="padding:12px 0;${i ? `border-top:1px solid ${BRAND.border};` : ''}font-size:13px;line-height:${d.lh};color:${BRAND.muted};">${esc(r.label)}</td><td class="em-text ${i ? 'em-border-t' : ''}" valign="top" align="${d.start}" style="padding:12px 0;${i ? `border-top:1px solid ${BRAND.border};` : ''}font-size:15px;font-weight:600;line-height:${d.lh};color:${BRAND.text};">${r.mono ? `<span dir="ltr" style="font-family:${FONT_MONO};">${esc(r.value)}</span>` : esc(r.value)}</td></tr>`,
    )
    .join('');
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>`;
}

function noticeBlock(b: Extract<Block, { t: 'notice' }>, d: Dir): string {
  const c = TONES[b.tone];
  const border = d.rtl ? `border-right:4px solid ${c.solid};` : `border-left:4px solid ${c.solid};`;
  const title = b.title ? `<div style="font-size:15px;font-weight:700;line-height:${d.lh};color:${c.fg};" class="em-n-${c.key}">${esc(b.title)}</div>` : '';
  return `<tr><td class="em-n-${c.key}" align="${d.start}" style="background:${c.bg};${border}border-radius:10px;padding:14px 18px;font-size:14px;line-height:${d.rtl ? 2 : 1.6};color:${c.fg};">${title}${rich(b.text)}</td></tr>`;
}

function listBlock(b: Extract<Block, { t: 'list' }>, d: Dir): string {
  const title = b.title
    ? `<tr><td colspan="2" class="em-text" align="${d.start}" style="padding-bottom:12px;font-size:13px;font-weight:700;letter-spacing:${d.rtl ? 0 : '0.06em'};text-transform:${d.rtl ? 'none' : 'uppercase'};line-height:${d.lh};color:${BRAND.muted};">${esc(b.title)}</td></tr>`
    : '';
  const rows = b.items
    .map(
      (it, i) =>
        `<tr><td valign="top" width="36" style="width:36px;padding:4px 0 ${i === b.items.length - 1 ? 0 : 10}px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="26" height="26" style="width:26px;height:26px;border-radius:13px;background:${BRAND.primary};color:#ffffff;font-size:13px;font-weight:700;line-height:26px;font-family:${FONT_LATIN};">${i + 1}</td></tr></table></td><td class="em-text" valign="top" align="${d.start}" style="padding:2px 0 ${i === b.items.length - 1 ? 0 : 10}px;font-size:15px;line-height:${d.rtl ? 2 : 1.6};color:${BRAND.text};">${esc(it)}</td></tr>`,
    )
    .join('');
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${title}${rows}</table></td></tr>`;
}

function trackerBlock(b: Extract<Block, { t: 'tracker' }>, locale: EmailLocale, d: Dir): string {
  const labels = UI[locale].tracker;
  const cells = labels
    .map((label, i) => {
      const done = i < b.step;
      const current = i === b.step;
      const bar = done ? BRAND.primary : current ? BRAND.accent : BRAND.border;
      const color = current ? BRAND.text : done ? BRAND.primaryDark : BRAND.muted;
      const gap = i === labels.length - 1 ? '' : `<td width="6" style="width:6px;font-size:0;">&nbsp;</td>`;
      return `<td valign="top" align="center" style="width:${100 / labels.length}%;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="6" class="${done ? '' : current ? '' : 'em-bar'}" style="height:6px;font-size:0;line-height:0;background:${bar};border-radius:3px;">&nbsp;</td></tr><tr><td align="center" class="${current ? 'em-text' : 'em-muted'}" style="padding-top:8px;font-size:11px;font-weight:${current ? 700 : 500};line-height:${d.rtl ? 1.9 : 1.3};color:${color};">${esc(label)}</td></tr></table></td>${gap}`;
    })
    .join('');
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${d.dir}"><tr>${cells}</tr></table></td></tr>`;
}

function orderBlock(o: OrderCardData, locale: EmailLocale, d: Dir): string {
  const u = UI[locale];
  const money = (label: string, value: string, strong = false, tone?: 'good') =>
    `<tr><td class="${strong ? 'em-text' : 'em-muted'}" align="${d.start}" style="padding:5px 0;font-size:${strong ? 16 : 14}px;font-weight:${strong ? 700 : 400};line-height:${d.lh};color:${strong ? BRAND.text : BRAND.muted};">${esc(label)}</td><td class="${tone === 'good' ? 'em-good' : strong ? 'em-text' : 'em-muted'}" align="${d.end}" dir="ltr" style="padding:5px 0;font-size:${strong ? 18 : 14}px;font-weight:${strong ? 800 : 500};white-space:nowrap;font-variant-numeric:tabular-nums;color:${tone === 'good' ? '#15803d' : strong ? BRAND.text : BRAND.muted};">${esc(value)}</td></tr>`;

  const lines = (o.items ?? [])
    .map(
      (it) =>
        `<tr><td class="em-text" align="${d.start}" style="padding:7px 0;font-size:15px;line-height:${d.lh};color:${BRAND.text};">${esc(it.name)} <span class="em-muted" dir="ltr" style="color:${BRAND.muted};">&times; ${esc(it.qty)}</span></td><td class="em-text" align="${d.end}" dir="ltr" style="padding:7px 0;font-size:15px;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums;color:${BRAND.text};">${esc(it.amount)}</td></tr>`,
    )
    .join('');
  const count = !o.items?.length && o.itemCount ? `<tr><td class="em-text" align="${d.start}" colspan="2" style="padding:7px 0;font-size:15px;color:${BRAND.text};">${esc(u.itemCount(o.itemCount))}</td></tr>` : '';

  const sums = [
    o.subtotal && o.items?.length ? money(u.subtotal, o.subtotal) : '',
    o.deliveryFee ? money(u.deliveryFee, o.deliveryFee) : '',
    o.discount ? money(u.discount, `- ${o.discount.replace(/^-\s*/, '')}`, false, 'good') : '',
  ].join('');
  const totalRow = o.total
    ? `<tr><td colspan="2" style="padding-top:8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${BRAND.text};" class="em-border-strong"><tr><td style="padding-top:2px;font-size:0;">&nbsp;</td></tr>${money(u.total, o.total, true)}</table></td></tr>`
    : '';

  const meta = [
    o.pickup ? [u.pickup, o.pickup] : null,
    o.delivery ? [u.delivery, o.delivery] : null,
    o.address ? [u.address, o.address] : null,
    o.payment ? [u.payment, o.payment] : null,
    o.note ? [u.note, o.note] : null,
  ].filter((r): r is string[] => !!r);
  const metaRows = meta
    .map(
      ([label, value], i) =>
        `<tr><td class="em-muted ${i ? 'em-border-t' : ''}" width="30%" valign="top" align="${d.start}" style="padding:9px 0;${i ? `border-top:1px solid ${BRAND.border};` : ''}font-size:12px;line-height:${d.lh};color:${BRAND.muted};">${esc(label)}</td><td class="em-text ${i ? 'em-border-t' : ''}" valign="top" align="${d.start}" style="padding:9px 0;${i ? `border-top:1px solid ${BRAND.border};` : ''}font-size:14px;font-weight:500;line-height:${d.lh};color:${BRAND.text};">${esc(value)}</td></tr>`,
    )
    .join('');

  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-border" style="border:1px solid ${BRAND.border};border-radius:14px;">
<tr><td class="em-soft" style="background:${BRAND.soft};border-radius:13px 13px 0 0;padding:16px 20px;" align="${d.start}">
<div class="em-muted" style="font-size:11px;font-weight:700;letter-spacing:${d.rtl ? 0 : '0.08em'};text-transform:${d.rtl ? 'none' : 'uppercase'};line-height:${d.lh};color:${BRAND.muted};">${esc(u.order)}</div>
<div class="em-text" dir="ltr" style="font-family:${FONT_MONO};font-size:20px;font-weight:700;line-height:1.4;color:${BRAND.text};text-align:${d.start};">${esc(o.orderNo)}</div>
${o.shop ? `<div class="em-muted" style="font-size:14px;line-height:${d.lh};color:${BRAND.muted};">${esc(o.shop)}</div>` : ''}
</td></tr>
<tr><td style="padding:8px 20px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lines}${count}${sums}${totalRow}</table></td></tr>
${metaRows ? `<tr><td style="padding:6px 20px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BRAND.border};" class="em-border-t"><tr><td height="6" style="height:6px;font-size:0;">&nbsp;</td></tr>${metaRows}</table></td></tr>` : ''}
</table></td></tr>`;
}

function block(b: Block, locale: EmailLocale, d: Dir): string {
  switch (b.t) {
    case 'p':
      return paragraph(b, d);
    case 'code':
      return codeBlock(b, d);
    case 'stat':
      return statBlock(b, d);
    case 'kv':
      return kvBlock(b, d);
    case 'order':
      return orderBlock(b.order, locale, d);
    case 'tracker':
      return trackerBlock(b, locale, d);
    case 'notice':
      return noticeBlock(b, d);
    case 'list':
      return listBlock(b, d);
  }
}

function button(label: string, url: string, locale: EmailLocale, d: Dir): string {
  const href = safeUrl(url);
  if (!href) return '';
  const u = UI[locale];
  return `<tr><td align="${d.start}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${BRAND.primary}" style="background:${BRAND.primary};border-radius:12px;"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${d.font};font-size:16px;font-weight:700;line-height:${d.rtl ? 1.9 : 1.2};color:#ffffff;text-decoration:none;border-radius:12px;">${esc(label)}</a></td></tr></table></td></tr>
<tr><td class="em-muted" align="${d.start}" style="padding-top:12px;font-size:12px;line-height:${d.lh};color:${BRAND.muted};">${esc(u.copyLink)}<br><a href="${esc(href)}" style="color:${BRAND.primary};word-break:break-all;" dir="ltr">${esc(href)}</a></td></tr>`;
}

const STYLE = `
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{border:0;outline:none;text-decoration:none;}
  a{color:${BRAND.primary};}
  @media only screen and (max-width:620px){
    .em-wrap{padding:0 !important;}
    .em-container{width:100% !important;max-width:100% !important;}
    .em-card{border-radius:0 !important;}
    .em-px{padding-left:22px !important;padding-right:22px !important;}
    .em-title{font-size:26px !important;}
    .em-code{width:40px !important;height:56px !important;font-size:26px !important;line-height:52px !important;}
  }
  @media (prefers-color-scheme:dark){
    .em-bg{background:#0b1218 !important;}
    .em-card{background:#121921 !important;}
    .em-text{color:#e6edf3 !important;}
    .em-muted{color:#94a3b8 !important;}
    .em-soft{background:#0f1a24 !important;}
    .em-border{border-color:#243040 !important;}
    .em-border-t{border-top-color:#243040 !important;}
    .em-border-strong{border-top-color:#e6edf3 !important;}
    .em-bar{background:#243040 !important;}
    .em-good{color:#4ade80 !important;}
    .em-foot{border-top-color:#243040 !important;}
    .em-code{background:#0d2a2c !important;color:#7fe0e3 !important;border-color:#00989b !important;}
    .em-n-brand{background:#0d2a2c !important;color:#9fe8ea !important;}
    .em-n-success{background:#0f2a1b !important;color:#86efac !important;}
    .em-n-warning{background:#2e2108 !important;color:#fcd34d !important;}
    .em-n-danger{background:#2f1414 !important;color:#fca5a5 !important;}
    .em-n-info{background:#10203d !important;color:#93c5fd !important;}
  }
`;

export function renderHtml(m: EmailModel, locale: EmailLocale, _ctx: RenderContext): string {
  const d = dirFor(locale);
  const u = UI[locale];
  const tone = TONES[m.tone as Tone];
  const body = m.blocks.map((b) => `${block(b, locale, d)}${space(20)}`).join('');
  const cta = m.cta ? `${space(4)}${button(m.cta.label, m.cta.url, locale, d)}${space(8)}` : '';
  const badge = m.badge
    ? `<td align="${d.end}" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${d.end}"><tr><td style="background:${tone.solid};border-radius:20px;padding:6px 14px;font-family:${d.font};font-size:12px;font-weight:700;letter-spacing:${d.rtl ? 0 : '0.04em'};line-height:${d.rtl ? 1.9 : 1.2};color:#ffffff;white-space:nowrap;">${esc(m.badge)}</td></tr></table></td>`
    : '<td></td>';
  const mirror = m.mirror
    ? `<tr><td align="${d.start}" style="background:#fef3c7;padding:10px 32px;font-family:${d.font};font-size:12px;line-height:${d.lh};color:#78350f;" class="em-px"><strong>${esc(u.mirrorBanner)}</strong> &middot; ${esc(u.mirrorText)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${d.dir}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(m.subject)}</title>
<style>${STYLE}</style>
</head>
<body class="em-bg" style="margin:0;padding:0;background:${BRAND.pageBg};font-family:${d.font};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.pageBg};opacity:0;">${esc(m.preheader)}${'&nbsp;&zwnj;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-bg" bgcolor="${BRAND.pageBg}" style="background:${BRAND.pageBg};">
<tr><td align="center" class="em-wrap" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="em-container" style="width:600px;max-width:600px;">
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${d.dir}" class="em-card" bgcolor="${BRAND.card}" style="background:${BRAND.card};border-radius:18px;overflow:hidden;font-family:${d.font};">
${mirror}
<tr><td height="5" style="height:5px;font-size:0;line-height:0;background:${tone.solid};">&nbsp;</td></tr>
<tr><td class="em-px" bgcolor="${BRAND.primaryDark}" style="background:${BRAND.primaryDark};padding:26px 32px 34px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${d.dir}"><tr>
    <td valign="middle" align="${d.start}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="${d.dir}"><tr>
      <td align="center" width="40" height="40" style="width:40px;height:40px;background:#ffffff;border-radius:12px;font-family:${FONT_LATIN};font-size:22px;font-weight:800;line-height:40px;color:${BRAND.primary};">D</td>
      <td style="padding-${d.start === 'left' ? 'left' : 'right'}:12px;font-family:${d.font};font-size:20px;font-weight:700;line-height:${d.rtl ? 1.9 : 1.2};color:#ffffff;">${esc(u.brand)}</td>
    </tr></table></td>
    ${badge}
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="30" style="height:30px;font-size:0;">&nbsp;</td></tr>
  <tr><td class="em-title" align="${d.start}" style="font-family:${d.font};font-size:32px;font-weight:800;line-height:${d.rtl ? 1.9 : 1.2};letter-spacing:${d.rtl ? 0 : '-0.02em'};color:#ffffff;">${esc(m.title)}</td></tr>
  ${m.subtitle ? `<tr><td align="${d.start}" style="padding-top:10px;font-family:${d.font};font-size:16px;line-height:${d.rtl ? 2 : 1.55};color:${BRAND.heroSub};">${esc(m.subtitle)}</td></tr>` : ''}
  </table>
</td></tr>
<tr><td class="em-px" style="padding:30px 32px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${d.dir}">${body}${cta}</table></td></tr>
<tr><td class="em-soft em-foot em-px" bgcolor="${BRAND.soft}" align="${d.start}" style="background:${BRAND.soft};padding:22px 32px 26px;border-top:1px solid ${BRAND.border};">
  <div class="em-text" style="font-family:${d.font};font-size:13px;font-weight:700;line-height:${d.lh};color:${BRAND.text};">${esc(u.brand)} &middot; ${esc(u.serving)}</div>
  <div class="em-muted" style="font-family:${d.font};font-size:12px;line-height:${d.lh};color:${BRAND.muted};">${esc(u.tagline)}</div>
  <div class="em-muted" style="padding-top:10px;font-family:${d.font};font-size:12px;line-height:${d.lh};color:${BRAND.muted};">${esc(u.help)}</div>
  <div class="em-muted" style="padding-top:6px;font-family:${d.font};font-size:11px;line-height:${d.lh};color:${BRAND.muted};">${esc(m.reason)}</div>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
