import { renderHtml } from './html';
import { EMAIL_TEMPLATES } from './templates';
import type { EmailTemplateName, EmailVars } from './templates';
import { renderText } from './text';
import type { EmailLocale, RenderContext, RenderedEmail } from './model';

export { EMAIL_TEMPLATES } from './templates';
export type { Decision, EmailRole, EmailTemplateName, EmailVars, PayoutKind } from './templates';
export type { EmailLocale, OrderCardData, RenderContext, RenderedEmail } from './model';
export { esc } from './html';

export const EMAIL_TEMPLATE_NAMES = Object.keys(EMAIL_TEMPLATES) as EmailTemplateName[];

export const DEFAULT_APP_URL = 'https://dhoblio.pk';

/** Builds one email (subject, HTML and plain text) in the reader's language. */
export function renderEmail(name: EmailTemplateName, vars: EmailVars, locale: EmailLocale, ctx: Partial<RenderContext> = {}): RenderedEmail {
  const full: RenderContext = { appUrl: ctx.appUrl || DEFAULT_APP_URL };
  const model = EMAIL_TEMPLATES[name].build(vars, locale, full);
  return { subject: model.subject, html: renderHtml(model, locale, full), text: renderText(model, locale) };
}

export function isEmailTemplate(name: string): name is EmailTemplateName {
  return Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATES, name);
}

export function sampleVars(name: EmailTemplateName): EmailVars {
  return EMAIL_TEMPLATES[name].sample;
}
