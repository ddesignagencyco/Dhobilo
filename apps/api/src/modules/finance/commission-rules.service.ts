import { HttpStatus, Injectable } from '@nestjs/common';
import { CommissionScope } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { money } from '../../common/money/money';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateCommissionRuleDto, ListCommissionRulesQueryDto, UpdateCommissionRuleDto } from './dto/finance.dto';

@Injectable()
export class CommissionRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  list(q: ListCommissionRulesQueryDto) {
    return this.prisma.commissionRule.findMany({
      where: {
        ...(q.scope ? { scope: q.scope } : {}),
        ...(q.vendorId ? { vendorId: q.vendorId } : {}),
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      },
      orderBy: [{ effectiveFrom: 'desc' }, { scope: 'asc' }],
      select: {
        id: true,
        scope: true,
        vendorId: true,
        categoryId: true,
        ratePct: true,
        effectiveFrom: true,
        createdById: true,
        vendor: { select: { businessName: true } },
        category: { select: { name: true } },
      },
    });
  }

  async create(dto: CreateCommissionRuleDto, adminId: string) {
    const refs = await this.refs(dto.scope, dto.vendorId, dto.categoryId);
    return this.prisma.commissionRule.create({
      data: {
        scope: dto.scope,
        vendorId: refs.vendorId,
        categoryId: refs.categoryId,
        ratePct: money(dto.ratePct),
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : this.clock.now(),
        createdById: adminId,
      },
    });
  }

  async update(id: string, dto: UpdateCommissionRuleDto) {
    const rule = await this.prisma.commissionRule.findUnique({ where: { id }, select: { id: true } });
    if (!rule) throw new AppException(ErrorCode.NOT_FOUND, 'Commission rule not found.', HttpStatus.NOT_FOUND);
    return this.prisma.commissionRule.update({
      where: { id },
      data: {
        ...(dto.ratePct !== undefined ? { ratePct: money(dto.ratePct) } : {}),
        ...(dto.effectiveFrom ? { effectiveFrom: new Date(dto.effectiveFrom) } : {}),
      },
    });
  }

  async remove(id: string) {
    const rule = await this.prisma.commissionRule.findUnique({ where: { id }, select: { id: true } });
    if (!rule) throw new AppException(ErrorCode.NOT_FOUND, 'Commission rule not found.', HttpStatus.NOT_FOUND);
    await this.prisma.commissionRule.delete({ where: { id } });
  }

  private async refs(scope: CommissionScope, vendorId?: string, categoryId?: number) {
    if (scope === CommissionScope.GLOBAL) {
      if (vendorId || categoryId) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, 'A global rule cannot name a vendor or category.', HttpStatus.BAD_REQUEST);
      }
      return { vendorId: null, categoryId: null };
    }
    if (scope === CommissionScope.VENDOR) {
      if (!vendorId || categoryId) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, 'A vendor rule needs exactly one vendor.', HttpStatus.BAD_REQUEST);
      }
      const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
      if (!vendor) throw new AppException(ErrorCode.NOT_FOUND, 'Vendor not found.', HttpStatus.NOT_FOUND);
      return { vendorId, categoryId: null };
    }
    if (!categoryId || vendorId) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'A category rule needs exactly one category.', HttpStatus.BAD_REQUEST);
    }
    const category = await this.prisma.serviceCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!category) throw new AppException(ErrorCode.NOT_FOUND, 'Service category not found.', HttpStatus.NOT_FOUND);
    return { vendorId: null, categoryId };
  }
}
