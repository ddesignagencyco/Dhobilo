import { HttpStatus, Injectable } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { normalizePkMobile } from '../auth/phone.util';
import { InviteStaffDto } from './dto/vendor.dto';

export const MAX_STAFF_PER_VENDOR = 10;

const staffSelect = { userId: true, user: { select: { phone: true, name: true, status: true, phoneVerifiedAt: true } } } as const;

@Injectable()
export class VendorStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async list(vendorId: string) {
    const rows = await this.prisma.vendorStaff.findMany({ where: { vendorId }, select: staffSelect });
    return rows.map((r) => ({
      userId: r.userId,
      phone: r.user.phone,
      name: r.user.name,
      status: r.user.status,
      hasSignedIn: r.user.phoneVerifiedAt !== null,
    }));
  }

  /**
   * Owner invites a staff member by phone. A new number gets a VENDOR_STAFF account that signs in with an SMS
   * code. Existing accounts of any other role are never converted: that would be an account takeover vector.
   */
  async invite(vendorId: string, dto: InviteStaffDto) {
    const phone = normalizePkMobile(dto.phone);
    if (!phone) throw new AppException('INVALID_PHONE', 'Enter a valid Pakistani mobile number.', HttpStatus.BAD_REQUEST);

    return this.prisma.$transaction(async (tx) => {
      // Serialise invites per vendor so the staff cap can't be raced past.
      await tx.$queryRaw`SELECT id FROM "Vendor" WHERE id = ${vendorId}::uuid FOR UPDATE`;
      if ((await tx.vendorStaff.count({ where: { vendorId } })) >= MAX_STAFF_PER_VENDOR) {
        throw new AppException('STAFF_LIMIT_REACHED', `A vendor can have up to ${MAX_STAFF_PER_VENDOR} staff accounts.`, HttpStatus.UNPROCESSABLE_ENTITY);
      }

      const user = await tx.user.findUnique({ where: { phone }, include: { vendorStaff: true, vendorOwned: { select: { id: true } } } });
      if (user && (user.role !== Role.VENDOR_STAFF || user.vendorOwned)) {
        throw new AppException('PHONE_IN_USE', 'This number already belongs to another kind of account.', HttpStatus.CONFLICT);
      }
      if (user?.vendorStaff.some((s) => s.vendorId === vendorId)) {
        throw new AppException('STAFF_ALREADY_ADDED', 'This person is already on your staff.', HttpStatus.CONFLICT);
      }
      if (user && user.vendorStaff.length > 0) {
        throw new AppException('STAFF_LINKED_ELSEWHERE', 'This person already works for another vendor.', HttpStatus.CONFLICT);
      }

      const staffUser = user ?? (await tx.user.create({ data: { phone, name: dto.name, role: Role.VENDOR_STAFF, status: UserStatus.ACTIVE } }));
      await tx.vendorStaff.create({ data: { vendorId, userId: staffUser.id } });
      return { userId: staffUser.id, phone, name: staffUser.name, status: staffUser.status, hasSignedIn: staffUser.phoneVerifiedAt !== null };
    });
  }

  /** Unlinks the person and signs them out everywhere immediately. */
  async remove(vendorId: string, userId: string): Promise<void> {
    const removed = await this.prisma.vendorStaff.deleteMany({ where: { vendorId, userId } });
    if (removed.count === 0) throw new AppException(ErrorCode.NOT_FOUND, 'Staff member not found.', HttpStatus.NOT_FOUND);
    await this.tokens.revokeAllForUser(userId);
  }
}
