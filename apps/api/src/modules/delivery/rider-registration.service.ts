import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, RiderStatus, Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { FieldCrypto } from '../../common/crypto/field-crypto';
import { AppException } from '../../common/errors/app.exception';
import type { Env } from '../../config/env';
import { CloudinaryService, uploadFolder } from '../../infra/cloudinary/cloudinary.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CitiesService } from '../cities/cities.service';
import { normalizeCnic } from '../vendors/cnic.util';
import { RegisterRiderDto } from './dto/rider.dto';

export const RIDER_CNIC_CONTEXT = 'rider.cnic';

@Injectable()
export class RiderRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly cities: CitiesService,
    private readonly cloudinary: CloudinaryService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
  ) {}

  /**
   * Applies to ride (FR-R1). The rider starts PENDING until an admin approves. A REJECTED rider re-submits through
   * the same call. The CNIC is stored encrypted; its keyed hash stops one CNIC registering twice.
   */
  async register(user: AuthUser, dto: RegisterRiderDto, ctx: { ip?: string; requestId?: string }) {
    const cnic = normalizeCnic(dto.cnic);
    if (!cnic) throw new AppException('INVALID_CNIC', 'Enter a valid 13-digit CNIC.', HttpStatus.BAD_REQUEST);
    if (!(await this.cities.findActive(dto.cityId))) {
      throw new AppException('CITY_NOT_AVAILABLE', 'We do not serve this city yet.', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.prisma.rider.findUnique({ where: { userId: user.id }, select: { id: true, status: true } });
    if (existing && existing.status !== RiderStatus.REJECTED) {
      throw new AppException('RIDER_ALREADY_REGISTERED', 'This account already has a rider registration.', HttpStatus.CONFLICT, {
        status: existing.status,
      });
    }

    // Only a photo this user uploaded to their own rider folder is accepted.
    const folder = uploadFolder(this.config.get('NODE_ENV', { infer: true }), 'rider', user.id, this.cloudinary.folderRoot);
    const photo = await this.cloudinary.verifyAsset(dto.photoPublicId, folder, 'upload');

    const fields = {
      cityId: dto.cityId,
      cnicEnc: this.crypto.encrypt(cnic, RIDER_CNIC_CONTEXT),
      cnicHash: this.crypto.hash('cnic', cnic),
      photoUrl: photo.url,
      photoPublicId: photo.publicId,
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { name: dto.name } });
        const rider = existing
          ? await tx.rider.update({
              where: { id: existing.id },
              data: { ...fields, status: RiderStatus.PENDING, rejectionReason: null, approvedAt: null, approvedById: null },
            })
          : await tx.rider.create({ data: { ...fields, userId: user.id } });

        await this.audit.record(
          {
            action: existing ? 'RIDER_RESUBMITTED' : 'RIDER_REGISTERED',
            entity: 'Rider',
            entityId: rider.id,
            actorId: user.id,
            actorRole: Role.RIDER,
            after: { status: RiderStatus.PENDING },
            ip: ctx.ip,
            requestId: ctx.requestId,
          },
          tx,
        );
        return { id: rider.id, status: rider.status, cityId: rider.cityId, createdAt: rider.createdAt };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && String(err.meta?.target ?? '').includes('cnicHash')) {
        throw new AppException('DUPLICATE_CNIC', 'A rider with this CNIC is already registered.', HttpStatus.CONFLICT);
      }
      throw err;
    }
  }
}
