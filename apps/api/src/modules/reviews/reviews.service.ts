import { HttpStatus, Injectable } from '@nestjs/common';
import { JobStatus, JobType, Prisma, ReviewTarget } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { fmt, money } from '../../common/money/money';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateReviewDto, ListVendorReviewsQueryDto, ReviewInputDto } from './dto/reviews.dto';

const reviewSelect = {
  id: true,
  orderId: true,
  targetType: true,
  rating: true,
  comment: true,
  createdAt: true,
  vendor: { select: { id: true, businessName: true } },
  rider: { select: { id: true } },
} satisfies Prisma.ReviewSelect;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(customerId: string, orderId: string, dto: CreateReviewDto) {
    if (!dto.vendor && !dto.rider) {
      throw new AppException('REVIEW_TARGET_REQUIRED', 'Rate the vendor, the rider, or both.', HttpStatus.BAD_REQUEST);
    }
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, status: true, vendorId: true },
    });
    if (!order) throw new AppException('ORDER_NOT_FOUND', 'Order not found.', HttpStatus.NOT_FOUND);
    if (order.status !== 'DELIVERED') {
      throw new AppException('ORDER_NOT_DELIVERED', 'You can review an order after it is delivered.', HttpStatus.CONFLICT);
    }

    let riderId: string | null = null;
    if (dto.rider) {
      const job = await this.prisma.deliveryJob.findFirst({
        where: { orderId, jobType: JobType.DROP, status: JobStatus.COMPLETED, isRedo: false, riderId: { not: null } },
        orderBy: { attempt: 'asc' },
        select: { riderId: true },
      });
      if (!job?.riderId) {
        throw new AppException('RIDER_REVIEW_UNAVAILABLE', 'This order was not delivered by a Dhobilo rider.', HttpStatus.UNPROCESSABLE_ENTITY);
      }
      riderId = job.riderId;
    }

    try {
      const reviews = await this.prisma.$transaction(async (tx) => {
        const created = [];
        if (dto.vendor) {
          await tx.$queryRaw`SELECT id FROM "Vendor" WHERE id = ${order.vendorId}::uuid FOR UPDATE`;
          created.push(await this.insert(tx, order.id, customerId, ReviewTarget.VENDOR, order.vendorId, null, dto.vendor));
          await this.refreshVendor(tx, order.vendorId);
        }
        if (dto.rider && riderId) {
          await tx.$queryRaw`SELECT id FROM "Rider" WHERE id = ${riderId}::uuid FOR UPDATE`;
          created.push(await this.insert(tx, order.id, customerId, ReviewTarget.RIDER, null, riderId, dto.rider));
          await this.refreshRider(tx, riderId);
        }
        return created;
      });
      return reviews.map((r) => this.view(r));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException('REVIEW_EXISTS', 'You already reviewed this order.', HttpStatus.CONFLICT);
      }
      throw err;
    }
  }

  /** Public vendor reviews with the vendor's live aggregate in `meta`. */
  async listForVendor(vendorId: string, q: ListVendorReviewsQueryDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, status: 'APPROVED', city: { isActive: true } },
      select: { id: true, businessName: true, ratingAvg: true, ratingCount: true },
    });
    if (!vendor) throw new AppException('VENDOR_NOT_FOUND', 'Vendor not found.', HttpStatus.NOT_FOUND);

    const limit = q.limit ?? 20;
    const rows = await this.prisma.review.findMany({
      where: { vendorId, targetType: ReviewTarget.VENDOR, ...beforeCursor(q.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    const distribution = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { vendorId, targetType: ReviewTarget.VENDOR },
      _count: { _all: true },
    });

    return {
      items: items.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        customerName: r.customer.name ? r.customer.name.split(/\s+/)[0] : 'Customer',
      })),
      nextCursor,
      summary: {
        vendorName: vendor.businessName,
        ratingAvg: fmt(money(vendor.ratingAvg)),
        ratingCount: vendor.ratingCount,
        distribution: Object.fromEntries(distribution.map((d) => [d.rating, d._count._all])),
      },
    };
  }

  private insert(
    tx: Prisma.TransactionClient,
    orderId: string,
    customerId: string,
    targetType: ReviewTarget,
    vendorId: string | null,
    riderId: string | null,
    input: ReviewInputDto,
  ) {
    return tx.review.create({
      data: { orderId, customerId, targetType, vendorId, riderId, rating: input.rating, comment: input.comment?.trim() || null },
      select: reviewSelect,
    });
  }

  private async refreshVendor(tx: Prisma.TransactionClient, vendorId: string): Promise<void> {
    const agg = await tx.review.aggregate({
      where: { vendorId, targetType: ReviewTarget.VENDOR },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.vendor.update({
      where: { id: vendorId },
      data: { ratingAvg: new Prisma.Decimal(agg._avg.rating ?? 0).toDecimalPlaces(2), ratingCount: agg._count._all },
    });
  }

  private async refreshRider(tx: Prisma.TransactionClient, riderId: string): Promise<void> {
    const agg = await tx.review.aggregate({
      where: { riderId, targetType: ReviewTarget.RIDER },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.rider.update({
      where: { id: riderId },
      data: { ratingAvg: new Prisma.Decimal(agg._avg.rating ?? 0).toDecimalPlaces(2), ratingCount: agg._count._all },
    });
  }

  private view(r: Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>) {
    return {
      id: r.id,
      orderId: r.orderId,
      targetType: r.targetType,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      vendor: r.vendor,
      riderId: r.rider?.id ?? null,
    };
  }
}
