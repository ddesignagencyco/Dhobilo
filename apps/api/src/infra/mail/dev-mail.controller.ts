import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import type { Env } from '../../config/env';
import { EMAIL_TEMPLATES, EMAIL_TEMPLATE_NAMES, esc, isEmailTemplate, renderEmail, sampleVars } from '../../modules/notifications/templates/email';
import type { EmailLocale } from '../../modules/notifications/templates/email';
import { MailService } from './mail.service';

class TestEmailDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  /** Send one of the designed emails (see GET /dev/email-preview) instead of the plain test message. */
  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsIn(['en', 'ur'])
  locale?: EmailLocale;
}

const asLocale = (l?: string): EmailLocale => (l === 'ur' ? 'ur' : 'en');

/** Dev-only (BE-0.7). Not registered when NODE_ENV=production; see MailModule. */
@ApiExcludeController()
@Public()
@Controller('dev')
export class DevMailController {
  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('test-email')
  testEmail(@Body() dto: TestEmailDto) {
    if (dto.template) {
      if (!isEmailTemplate(dto.template)) throw new NotFoundException(`Unknown email template "${dto.template}".`);
      const email = renderEmail(dto.template, sampleVars(dto.template), asLocale(dto.locale), { appUrl: this.config.get('APP_URL', { infer: true }) });
      return this.mail.send({ to: dto.to, subject: dto.subject ?? `[Dhoblio dev] ${email.subject}`, text: email.text, html: email.html });
    }
    return this.mail.send({
      to: dto.to,
      subject: dto.subject ?? 'Dhoblio test email',
      text: 'If you can read this, SMTP is wired up correctly.',
    });
  }

  /** An index of every designed email, with English and Urdu previews. */
  @Get('email-preview')
  index(@Res() res: Response) {
    const rows = EMAIL_TEMPLATE_NAMES.map(
      (name) =>
        `<tr><td><code>${esc(name)}</code></td><td>${esc(EMAIL_TEMPLATES[name].label)}</td><td><a href="/api/v1/dev/email-preview/${esc(name)}?locale=en">English</a></td><td><a href="/api/v1/dev/email-preview/${esc(name)}?locale=ur">اردو</a></td></tr>`,
    ).join('');
    res.type('html').send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dhoblio email templates</title><style>body{font-family:Inter,Arial,sans-serif;margin:40px auto;max-width:760px;color:#0f172a}h1{font-size:24px}table{border-collapse:collapse;width:100%}td{padding:9px 12px;border-bottom:1px solid #e2e8f0;font-size:14px}a{color:#007c80;font-weight:600}code{background:#f1f5f9;padding:2px 6px;border-radius:6px}</style></head><body><h1>Dhoblio email templates</h1><p>Dev only. Each link renders the email with sample data.</p><table>${rows}</table></body></html>`,
    );
  }

  @Get('email-preview/:template')
  preview(@Param('template') template: string, @Query('locale') locale: string | undefined, @Res() res: Response) {
    if (!isEmailTemplate(template)) throw new NotFoundException(`Unknown email template "${template}".`);
    const email = renderEmail(template, sampleVars(template), asLocale(locale), { appUrl: this.config.get('APP_URL', { infer: true }) });
    res.type('html').send(email.html);
  }
}
