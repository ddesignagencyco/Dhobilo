import { Body, Controller, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { MailService } from './mail.service';

class TestEmailDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  subject?: string;
}

/** Dev-only (BE-0.7). Not registered when NODE_ENV=production; see MailModule. */
@ApiExcludeController()
@Public()
@Controller('dev')
export class DevMailController {
  constructor(private readonly mail: MailService) {}

  @Post('test-email')
  testEmail(@Body() dto: TestEmailDto) {
    return this.mail.send({
      to: dto.to,
      subject: dto.subject ?? 'Dhoblio test email',
      text: 'If you can read this, SMTP is wired up correctly.',
    });
  }
}
