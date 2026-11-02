import { HttpStatus, Injectable } from '@nestjs/common';
import { AdminRole, Prisma, Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';
import { ChangeOwnPasswordDto, CreateAdminDto, UpdateAdminDto } from './dto/admin-users.dto';

interface Ctx {
  admin: AuthUser;
  ip?: string;
  requestId?: string;
}

const SELECT = { id: true, email: true, name: true, adminRole: true, status: true, lastLoginAt: true, createdAt: true } as const;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  list() {
    return this.prisma.user.findMany({ where: { role: Role.ADMIN }, select: SELECT, orderBy: { createdAt: 'asc' } });
  }

  async create(dto: CreateAdminDto, ctx: Ctx) {
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            // Phone is the unique identity column; admins sign in by email, so give each a placeholder in a reserved range.
            phone: `+9200${randomInt(100_000_000, 999_999_999)}`,
            email: dto.email,
            name: dto.name,
            role: Role.ADMIN,
            adminRole: dto.adminRole,
            passwordHash,
            phoneVerifiedAt: new Date(),
          },
          select: SELECT,
        });
        await this.audit.record(
          { action: 'ADMIN_CREATED', entity: 'User', entityId: created.id, actorId: ctx.admin.id, actorRole: Role.ADMIN, after: { email: created.email, adminRole: created.adminRole }, ip: ctx.ip, requestId: ctx.requestId },
          tx,
        );
        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(ErrorCode.CONFLICT, 'An account with this email already exists.', HttpStatus.CONFLICT);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateAdminDto, ctx: Ctx) {
    if (dto.adminRole === undefined && dto.status === undefined) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Nothing to change.', HttpStatus.BAD_REQUEST);
    }
    if (id === ctx.admin.id) {
      throw new AppException('CANNOT_CHANGE_SELF', 'You cannot change your own role or status.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findFirst({ where: { id, role: Role.ADMIN }, select: SELECT });
      if (!before) throw new AppException(ErrorCode.NOT_FOUND, 'Admin not found.', HttpStatus.NOT_FOUND);

      const losesSuper =
        before.adminRole === AdminRole.SUPER_ADMIN &&
        before.status === UserStatus.ACTIVE &&
        ((dto.adminRole && dto.adminRole !== AdminRole.SUPER_ADMIN) || dto.status === 'DEACTIVATED');
      if (losesSuper) {
        // Serialize concurrent demotions so two requests cannot each see "another super admin remains".
        await tx.$queryRaw`SELECT id FROM "User" WHERE "role" = 'ADMIN' AND "adminRole" = 'SUPER_ADMIN' FOR UPDATE`;
        const others = await tx.user.count({
          where: { role: Role.ADMIN, adminRole: AdminRole.SUPER_ADMIN, status: UserStatus.ACTIVE, id: { not: id } },
        });
        if (others === 0) {
          throw new AppException('LAST_SUPER_ADMIN', 'There must always be one active super admin.', HttpStatus.UNPROCESSABLE_ENTITY);
        }
      }
      const after = await tx.user.update({ where: { id }, data: { adminRole: dto.adminRole, status: dto.status }, select: SELECT });
      await this.audit.record(
        {
          action: dto.status === 'DEACTIVATED' ? 'ADMIN_DEACTIVATED' : dto.status === 'ACTIVE' ? 'ADMIN_REACTIVATED' : 'ADMIN_ROLE_CHANGED',
          entity: 'User',
          entityId: id,
          actorId: ctx.admin.id,
          actorRole: Role.ADMIN,
          before: { adminRole: before.adminRole, status: before.status },
          after: { adminRole: after.adminRole, status: after.status },
          ip: ctx.ip,
          requestId: ctx.requestId,
        },
        tx,
      );
      return after;
    });
    if (dto.status === 'DEACTIVATED') await this.tokens.revokeAllForUser(id);
    return updated;
  }

  async changeOwnPassword(dto: ChangeOwnPasswordDto, ctx: Ctx) {
    const me = await this.prisma.user.findUnique({ where: { id: ctx.admin.id }, select: { passwordHash: true } });
    if (!me?.passwordHash || !(await argon2.verify(me.passwordHash, dto.currentPassword))) {
      throw new AppException('INVALID_CREDENTIALS', 'Current password is incorrect.', HttpStatus.UNAUTHORIZED);
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Choose a different password.', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.user.update({ where: { id: ctx.admin.id }, data: { passwordHash: await argon2.hash(dto.newPassword, { type: argon2.argon2id }) } });
    await this.audit.record({ action: 'ADMIN_PASSWORD_CHANGED', entity: 'User', entityId: ctx.admin.id, actorId: ctx.admin.id, actorRole: Role.ADMIN, ip: ctx.ip, requestId: ctx.requestId });
    // Every login, this one included, must sign in again with the new password.
    await this.tokens.revokeAllForUser(ctx.admin.id);
  }
}
