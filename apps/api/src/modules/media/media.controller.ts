import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import { CloudinaryService, MEDIA_LIMITS } from '../../infra/cloudinary/cloudinary.service';
import { SignUploadDto, UploadKindDto } from './dto/media.dto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { HttpStatus } from '@nestjs/common';

/** Who may upload each kind, where it is stored, and whether it stays private (no public URL). */
const KINDS: Record<UploadKindDto, { role: Role; folder: 'vendor-docs' | 'rider' | 'proof' | 'complaint'; sensitive: boolean }> = {
  'vendor-docs': { role: Role.VENDOR_OWNER, folder: 'vendor-docs', sensitive: true },
  'rider-photo': { role: Role.RIDER, folder: 'rider', sensitive: false },
  'delivery-proof': { role: Role.RIDER, folder: 'proof', sensitive: true },
  complaint: { role: Role.CUSTOMER, folder: 'complaint', sensitive: true },
};

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly limiter: RateLimiter,
  ) {}

  /**
   * Signature for a direct browser-to-Cloudinary upload. Vendor documents and delivery proofs are stored privately
   * (never a public URL); rider profile photos are public because customers see them. After uploading, send the returned `public_id` to the API, which re-checks it.
   */
  @Post('sign')
  @HttpCode(200)
  @Roles(Role.VENDOR_OWNER, Role.RIDER, Role.CUSTOMER)
  async sign(@CurrentUser() user: AuthUser, @Body() dto: SignUploadDto) {
    await this.limiter.consume(`rl:media-sign:user:${user.id}`, 30, 3600);
    const kind = KINDS[dto.kind];
    if (user.role !== kind.role) {
      throw new AppException(ErrorCode.FORBIDDEN, `Only ${kind.role.toLowerCase().replace('_', ' ')} accounts can upload this.`, HttpStatus.FORBIDDEN);
    }
    // Folder is keyed by the user: the vendor or rider row may not exist yet during registration.
    const signed = this.cloudinary.signUpload(kind.folder, user.id, { sensitive: kind.sensitive });
    return { ...signed, limits: MEDIA_LIMITS };
  }
}
