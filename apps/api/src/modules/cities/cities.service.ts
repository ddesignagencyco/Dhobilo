import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active cities only: a city with isActive=false is "not available yet" for customers. */
  listActive() {
    return this.prisma.city.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nameUr: true, timezone: true },
      orderBy: { name: 'asc' },
    });
  }

  findActive(id: number) {
    return this.prisma.city.findFirst({ where: { id, isActive: true }, select: { id: true } });
  }
}
