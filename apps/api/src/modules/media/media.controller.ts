import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import { CloudinaryService, MEDIA_LIMITS } from '../../infra/cloudinary/cloudinary.service';
import { SignUploadDto } from './dto/media.dto';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly limiter: RateLimiter,
  ) {}

  /**
   * Signature for a direct browser-to-Cloudinary upload. Vendor verification documents are stored privately
   * (never a public URL). After uploading, send the returned `public_id` to the API, which re-checks it.
   */
  @Post('sign')
  @HttpCode(200)
  @Roles(Role.VENDOR_OWNER)
  async sign(@CurrentUser() user: AuthUser, @Body() dto: SignUploadDto) {
    await this.limiter.consume(`rl:media-sign:user:${user.id}`, 30, 3600);
    // Folder is keyed by the user: the vendor row may not exist yet during registration.
    const signed = this.cloudinary.signUpload(dto.kind, user.id, { sensitive: dto.kind === 'vendor-docs' });
    return { ...signed, limits: MEDIA_LIMITS };
  }
}
