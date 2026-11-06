import { Injectable } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LedgerService } from '../finance/ledger.service';
import { ACTIVE_JOB_STATUSES, OPEN_COMPLAINT_STATUSES, OPEN_ORDER_STATUSES, PAYOUTS_IN_PROGRESS } from './privacy.constants';

export interface DeletionBlocker {
  code: 'ACTIVE_ORDERS' | 'OPEN_COMPLAINTS' | 'VENDOR_BALANCE' | 'PAYOUTS_IN_PROGRESS' | 'ACTIVE_DELIVERY_JOBS' | 'UNSETTLED_COD_CASH';
  count: number;
  message: string;
}

/** What must be finished before an account can be deleted. Checked when it is requested and again before anonymising. */
@Injectable()
export class DeletionBlockersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async find(user: Pick<User, 'id' | 'role'>): Promise<DeletionBlocker[]> {
    const blockers: DeletionBlocker[] = [];
    const add = (code: DeletionBlocker['code'], count: number, message: string) => {
      if (count > 0) blockers.push({ code, count, message });
    };

    if (user.role === Role.CUSTOMER) {
      add('ACTIVE_ORDERS', await this.prisma.order.count({ where: { customerId: user.id, status: { in: OPEN_ORDER_STATUSES } } }), 'You have orders that are not finished yet.');
      add('OPEN_COMPLAINTS', await this.prisma.complaint.count({ where: { customerId: user.id, status: { in: OPEN_COMPLAINT_STATUSES } } }), 'You have a complaint that is still open.');
    }

    if (user.role === Role.VENDOR_OWNER) {
      const vendor = await this.prisma.vendor.findUnique({ where: { ownerId: user.id }, select: { id: true } });
      if (vendor) {
        add('ACTIVE_ORDERS', await this.prisma.order.count({ where: { vendorId: vendor.id, status: { in: OPEN_ORDER_STATUSES } } }), 'Your shop has orders that are not finished yet.');
        add('OPEN_COMPLAINTS', await this.prisma.complaint.count({ where: { vendorId: vendor.id, status: { in: OPEN_COMPLAINT_STATUSES } } }), 'Your shop has a complaint that is still open.');
        add('PAYOUTS_IN_PROGRESS', await this.prisma.payout.count({ where: { vendorId: vendor.id, status: { in: PAYOUTS_IN_PROGRESS } } }), 'You have a payout that is still being processed.');
        const balance = await this.ledger.balance(vendor.id);
        add('VENDOR_BALANCE', balance.total.gt(0) ? 1 : 0, 'Your shop still has an unpaid balance. Request a payout first.');
      }
    }

    if (user.role === Role.RIDER) {
      const rider = await this.prisma.rider.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (rider) {
        add('ACTIVE_DELIVERY_JOBS', await this.prisma.deliveryJob.count({ where: { riderId: rider.id, status: { in: ACTIVE_JOB_STATUSES } } }), 'You have deliveries in progress.');
        add('UNSETTLED_COD_CASH', await this.prisma.codCollection.count({ where: { riderId: rider.id, settlementId: null } }), 'You are holding cash from deliveries that has not been handed in yet.');
      }
    }
    return blockers;
  }
}
