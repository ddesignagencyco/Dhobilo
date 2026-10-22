import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEvent, VendorChangedEvent } from '../../common/events/domain-events';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateServiceItemDto, ImportItemDto, UpdateServiceItemDto } from './dto/catalog.dto';

const itemSelect = {
  id: true,
  categoryId: true,
  category: { select: { id: true, name: true, nameUr: true } },
  itemName: true,
  itemNameUr: true,
  serviceType: true,
  price: true,
  turnaroundHours: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ServiceItemSelect;

export interface ImportRowError {
  row: number;
  errors: string[];
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** Lets discovery drop cached search pages (prices, service types and availability of items changed). */
  private changed(vendorId: string) {
    return this.events.emitAsync(DomainEvent.VENDOR_CHANGED, { vendorId } satisfies VendorChangedEvent);
  }

  categories() {
    return this.prisma.serviceCategory.findMany({ select: { id: true, name: true, nameUr: true }, orderBy: { id: 'asc' } });
  }

  listItems(vendorId: string) {
    return this.prisma.serviceItem.findMany({
      where: { vendorId, deletedAt: null },
      select: itemSelect,
      orderBy: [{ categoryId: 'asc' }, { itemName: 'asc' }],
    });
  }

  async createItem(vendorId: string, dto: CreateServiceItemDto) {
    await this.assertCategory(dto.categoryId);
    const existing = await this.prisma.serviceItem.findFirst({
      where: { vendorId, itemName: dto.itemName, serviceType: dto.serviceType },
      select: { id: true, deletedAt: true },
    });
    if (existing && !existing.deletedAt) {
      throw new AppException('ITEM_EXISTS', 'You already have this item for this service.', HttpStatus.CONFLICT);
    }
    const data = this.itemData(dto);
    // A previously deleted item with the same name+service is brought back, since that pair is unique per vendor.
    const saved = existing
      ? await this.prisma.serviceItem.update({
          where: { id: existing.id },
          data: { ...data, deletedAt: null, isActive: dto.isActive ?? true },
          select: itemSelect,
        })
      : await this.prisma.serviceItem.create({ data: { ...data, vendorId, isActive: dto.isActive ?? true }, select: itemSelect });
    await this.changed(vendorId);
    return saved;
  }

  async updateItem(vendorId: string, id: string, dto: UpdateServiceItemDto) {
    await this.findOwned(vendorId, id);
    if (dto.categoryId !== undefined) await this.assertCategory(dto.categoryId);
    const updated = await this.prisma.serviceItem.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        itemName: dto.itemName,
        itemNameUr: dto.itemNameUr,
        serviceType: dto.serviceType,
        price: dto.price,
        turnaroundHours: dto.turnaroundHours,
        isActive: dto.isActive,
      },
      select: itemSelect,
    });
    await this.changed(vendorId);
    return updated;
  }

  /** Soft delete: order history keeps its snapshot, and the name can be reused later. */
  async deleteItem(vendorId: string, id: string): Promise<void> {
    await this.findOwned(vendorId, id);
    await this.prisma.serviceItem.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.changed(vendorId);
  }

  /**
   * Applies the rows all-or-nothing: existing items (same name + service) are updated, others created.
   * `fieldErrors` are the per-row validation problems found earlier; category and duplicate checks are added
   * here so the vendor sees every problem in the file in one go.
   */
  async importItems(vendorId: string, rows: ImportItemDto[], fieldErrors: ImportRowError[] = []) {
    const categories = await this.prisma.serviceCategory.findMany({ select: { id: true, name: true } });
    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    const errorsByRow = new Map<number, string[]>(fieldErrors.map((e) => [e.row, [...e.errors]]));
    const addError = (row: number, message: string) => errorsByRow.set(row, [...(errorsByRow.get(row) ?? []), message]);

    const seen = new Map<string, number>();
    const resolved = rows.map((row, i) => {
      const categoryId = typeof row.category === 'string' ? byName.get(row.category.toLowerCase()) : undefined;
      if (typeof row.category === 'string' && !categoryId) addError(i + 1, `Unknown category "${row.category}"`);
      if (typeof row.itemName === 'string' && typeof row.serviceType === 'string') {
        const key = `${row.itemName.trim().toLowerCase()}|${row.serviceType}`;
        if (seen.has(key)) addError(i + 1, `Duplicate of row ${seen.get(key)} in this file`);
        else seen.set(key, i + 1);
      }
      return { row, categoryId: categoryId ?? 0 };
    });
    if (errorsByRow.size) {
      this.importFailed([...errorsByRow].map(([row, errors]) => ({ row, errors })).sort((a, b) => a.row - b.row));
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      for (const { row, categoryId } of resolved) {
        const data = {
          categoryId,
          itemName: row.itemName,
          itemNameUr: row.itemNameUr,
          serviceType: row.serviceType,
          price: row.price,
          turnaroundHours: row.turnaroundHours,
        };
        const existing = await tx.serviceItem.findFirst({
          where: { vendorId, itemName: row.itemName, serviceType: row.serviceType },
          select: { id: true },
        });
        if (existing) {
          await tx.serviceItem.update({ where: { id: existing.id }, data: { ...data, deletedAt: null, isActive: row.isActive ?? true } });
          updated++;
        } else {
          await tx.serviceItem.create({ data: { ...data, vendorId, isActive: row.isActive ?? true } });
          created++;
        }
      }
      return { created, updated, total: resolved.length };
    });
    await this.changed(vendorId);
    return result;
  }

  importFailed(errors: ImportRowError[]): never {
    throw new AppException('CATALOG_IMPORT_INVALID', 'Some rows are invalid. Nothing was imported.', HttpStatus.UNPROCESSABLE_ENTITY, {
      errors: errors.slice(0, 50),
      totalErrors: errors.length,
    });
  }

  private itemData(dto: CreateServiceItemDto) {
    return {
      categoryId: dto.categoryId,
      itemName: dto.itemName,
      itemNameUr: dto.itemNameUr,
      serviceType: dto.serviceType,
      price: dto.price,
      turnaroundHours: dto.turnaroundHours,
    };
  }

  /** Items are looked up with the vendor id, so one vendor can never see or change another's item (404). */
  private async findOwned(vendorId: string, id: string) {
    const item = await this.prisma.serviceItem.findFirst({ where: { id, vendorId, deletedAt: null }, select: { id: true } });
    if (!item) throw new AppException(ErrorCode.NOT_FOUND, 'Item not found.', HttpStatus.NOT_FOUND);
    return item;
  }

  private async assertCategory(categoryId: number) {
    if (!(await this.prisma.serviceCategory.findUnique({ where: { id: categoryId }, select: { id: true } }))) {
      throw new AppException('CATEGORY_NOT_FOUND', 'Unknown service category.', HttpStatus.BAD_REQUEST);
    }
  }
}
