import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocType, Prisma, Role, VendorStatus } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { FieldCrypto } from '../../common/crypto/field-crypto';
import { AppException } from '../../common/errors/app.exception';
import { isInPakistan } from '../../common/geo/pakistan';
import type { Env } from '../../config/env';
import { CloudinaryService, uploadFolder } from '../../infra/cloudinary/cloudinary.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CitiesService } from '../cities/cities.service';
import { normalizeCnic } from './cnic.util';
import { RegisterVendorDto, VendorDocumentDto } from './dto/vendor.dto';

export const CNIC_CONTEXT = 'vendor.cnic';
const MAX_SHOP_PHOTOS = 4;

export function assertDocumentSet(documents: VendorDocumentDto[]): void {
  const count = (t: DocType) => documents.filter((d) => d.type === t).length;
  const bad = (message: string) => new AppException('INVALID_DOCUMENTS', message, HttpStatus.BAD_REQUEST);

  if (new Set(documents.map((d) => d.publicId)).size !== documents.length) throw bad('The same file was listed twice.');
  if (count(DocType.CNIC_FRONT) !== 1) throw bad('Exactly one CNIC front photo is required.');
  if (count(DocType.CNIC_BACK) !== 1) throw bad('Exactly one CNIC back photo is required.');
  if (count(DocType.SHOP_PHOTO) < 1) throw bad('At least one shop photo is required.');
  if (count(DocType.SHOP_PHOTO) > MAX_SHOP_PHOTOS) throw bad(`At most ${MAX_SHOP_PHOTOS} shop photos are allowed.`);
  if (count(DocType.BUSINESS_REG) > 1) throw bad('At most one business registration document is allowed.');
}

@Injectable()
export class VendorRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly cities: CitiesService,
    private readonly cloudinary: CloudinaryService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates the vendor in PENDING (FR-V1). A REJECTED vendor re-submits through the same call and goes back to
   * PENDING. The CNIC is stored encrypted; its keyed hash blocks the same CNIC registering twice.
   */
  async register(user: AuthUser, dto: RegisterVendorDto, ctx: { ip?: string; requestId?: string }) {
    const cnic = normalizeCnic(dto.cnic);
    if (!cnic) throw new AppException('INVALID_CNIC', 'Enter a valid 13-digit CNIC.', HttpStatus.BAD_REQUEST);
    assertDocumentSet(dto.documents);
    if (!(await this.cities.findActive(dto.cityId))) {
      throw new AppException('CITY_NOT_AVAILABLE', 'We do not serve this city yet.', HttpStatus.BAD_REQUEST);
    }
    if (!isInPakistan(dto.lat, dto.lng)) {
      throw new AppException('LOCATION_OUT_OF_RANGE', 'The shop location must be inside Pakistan.', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.prisma.vendor.findUnique({ where: { ownerId: user.id }, select: { id: true, status: true } });
    if (existing && existing.status !== VendorStatus.REJECTED) {
      throw new AppException('VENDOR_ALREADY_REGISTERED', 'This account already has a vendor registration.', HttpStatus.CONFLICT, {
        status: existing.status,
      });
    }

    // Only assets this user uploaded to their own private folder are accepted.
    const folder = uploadFolder(this.config.get('NODE_ENV', { infer: true }), 'vendor-docs', user.id);
    const verified = await Promise.all(dto.documents.map((d) => this.cloudinary.verifyAsset(d.publicId, folder, 'authenticated')));

    const fields = {
      businessName: dto.businessName,
      description: dto.description,
      addressLine: dto.addressLine,
      cityId: dto.cityId,
      lat: dto.lat,
      lng: dto.lng,
      cnicEnc: this.crypto.encrypt(cnic, CNIC_CONTEXT),
      cnicHash: this.crypto.hash('cnic', cnic),
    };
    const documents = dto.documents.map((d, i) => ({ type: d.type, publicId: verified[i].publicId, url: verified[i].url }));

    try {
      const vendor = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { email: dto.email } });

        let vendorId: string;
        if (existing) {
          await tx.vendorDocument.deleteMany({ where: { vendorId: existing.id } });
          await tx.vendor.update({
            where: { id: existing.id },
            data: { ...fields, status: VendorStatus.PENDING, rejectionReason: null, approvedAt: null, approvedById: null },
          });
          vendorId = existing.id;
        } else {
          vendorId = (await tx.vendor.create({ data: { ...fields, ownerId: user.id }, select: { id: true } })).id;
        }
        await tx.vendorDocument.createMany({ data: documents.map((d) => ({ ...d, vendorId })) });

        await this.audit.record(
          {
            action: existing ? 'VENDOR_RESUBMITTED' : 'VENDOR_REGISTERED',
            entity: 'Vendor',
            entityId: vendorId,
            actorId: user.id,
            actorRole: Role.VENDOR_OWNER,
            after: { status: VendorStatus.PENDING, documents: documents.length },
            ip: ctx.ip,
            requestId: ctx.requestId,
          },
          tx,
        );
        return tx.vendor.findUniqueOrThrow({
          where: { id: vendorId },
          select: { id: true, businessName: true, status: true, cityId: true, createdAt: true },
        });
      });
      return vendor;
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  /** Unique violations become generic conflicts that don't reveal whose CNIC/email it is. */
  private mapUniqueViolation(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = String(err.meta?.target ?? '');
      if (target.includes('cnicHash')) {
        return new AppException('DUPLICATE_CNIC', 'A vendor with this CNIC is already registered.', HttpStatus.CONFLICT);
      }
      if (target.includes('email')) {
        return new AppException('EMAIL_IN_USE', 'This email is already used by another account.', HttpStatus.CONFLICT);
      }
    }
    return err;
  }
}
