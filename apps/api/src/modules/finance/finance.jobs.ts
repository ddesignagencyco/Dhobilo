export const SETTLE_ORDER_JOB = 'settle-order';

export interface SettleOrderJob {
  orderId: string;
}

export const settleOrderJobId = (orderId: string) => `settle-order-${orderId}`;

export type FinanceJob = SettleOrderJob;
