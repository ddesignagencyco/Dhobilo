import { HttpStatus, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DeviceTokenDto, UpdateMeDto } from './dto/users.dto';

const toProfile = (u: User) => ({
  id: u.id,
  phone: u.phone,
  email: u.email,
  name: u.name,
  role: u.role,
  locale: u.locale,
  referralCode: u.referralCode,
  createdAt: u.createdAt,
});

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppException(ErrorCode.NOT_FOUND, 'User not found.', HttpStatus.NOT_FOUND);
    return toProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateMeDto) {
    return toProfile(await this.prisma.user.update({ where: { id: userId }, data: { name: dto.name, locale: dto.locale } }));
  }

  /** A token belongs to one user at a time: re-registering it on another account moves it. */
  async registerDevice(userId: string, dto: DeviceTokenDto) {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform },
      update: { userId, platform: dto.platform },
    });
  }

  async removeDevice(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
  }
}
