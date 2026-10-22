import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role, VendorStatus } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentVendor, RequireVendorStatus } from '../vendors/vendor-context';
import type { VendorContext } from '../vendors/vendor-context';
import { VendorContextGuard } from '../vendors/vendor-context.guard';
import { extractImportRows, validateImportRows } from './catalog-import';
import { CatalogService } from './catalog.service';
import { CreateServiceItemDto, UpdateServiceItemDto } from './dto/catalog.dto';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Service categories (Wash & Fold, Dry Cleaning, ...) vendors file their items under. */
  @Public()
  @Get('service-categories')
  categories() {
    return this.catalog.categories();
  }
}

/** Vendor-panel catalog management. Needs an APPROVED vendor; only owners may change it, staff can read. */
@ApiTags('catalog')
@ApiBearerAuth()
@RequireVendorStatus(VendorStatus.APPROVED)
@UseGuards(VendorContextGuard)
@Controller('vendor/catalog')
export class VendorCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('items')
  @Roles(Role.VENDOR_OWNER, Role.VENDOR_STAFF)
  list(@CurrentVendor() vendor: VendorContext) {
    return this.catalog.listItems(vendor.id);
  }

  @Post('items')
  @Roles(Role.VENDOR_OWNER)
  create(@CurrentVendor() vendor: VendorContext, @Body() dto: CreateServiceItemDto) {
    return this.catalog.createItem(vendor.id, dto);
  }

  @Patch('items/:id')
  @Roles(Role.VENDOR_OWNER)
  update(@CurrentVendor() vendor: VendorContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceItemDto) {
    return this.catalog.updateItem(vendor.id, id, dto);
  }

  @Delete('items/:id')
  @HttpCode(204)
  @Roles(Role.VENDOR_OWNER)
  async remove(@CurrentVendor() vendor: VendorContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.catalog.deleteItem(vendor.id, id);
  }

  /**
   * Bulk create/update, all-or-nothing, up to 500 rows. Send JSON `{ "items": [...] }` or a CSV file
   * (`Content-Type: text/csv`) with columns itemName,itemNameUr,category,serviceType,price,turnaroundHours,isActive.
   * Items are matched on name + serviceType: existing ones are updated, new ones created.
   */
  @Post('import')
  @HttpCode(200)
  @Roles(Role.VENDOR_OWNER)
  @ApiConsumes('application/json', 'text/csv')
  @ApiBody({ description: 'JSON { items: [...] } or CSV text', schema: { type: 'object' } })
  async import(@CurrentVendor() vendor: VendorContext, @Body() body: unknown, @Headers('content-type') contentType = '') {
    const rows = extractImportRows(body, contentType.toLowerCase().startsWith('text/csv'));
    const { items, errors } = await validateImportRows(rows);
    return this.catalog.importItems(vendor.id, items, errors);
  }
}
