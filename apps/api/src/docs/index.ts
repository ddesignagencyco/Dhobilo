import { adminDocs, systemDocs } from './ops/admin';
import { accountDocs, authDocs } from './ops/auth';
import { complaintDocs } from './ops/complaints';
import { adminDeliveryDocs, customerDeliveryDocs, riderDocs, webhookDocs } from './ops/delivery';
import { financeDocs } from './ops/finance';
import { promoDocs } from './ops/promos';
import { reviewDocs } from './ops/reviews';
import { cartDocs, discoveryDocs, orderDocs } from './ops/shopping';
import { catalogDocs, vendorDocs, vendorOrderDocs } from './ops/vendor';
import type { OperationDocs } from './types';

/** Every endpoint's human documentation, keyed "METHOD /path" (without the /api/v1 prefix). */
export const OPERATION_DOCS: OperationDocs = {
  ...authDocs,
  ...accountDocs,
  ...discoveryDocs,
  ...cartDocs,
  ...orderDocs,
  ...customerDeliveryDocs,
  ...riderDocs,
  ...vendorDocs,
  ...catalogDocs,
  ...vendorOrderDocs,
  ...adminDocs,
  ...adminDeliveryDocs,
  ...financeDocs,
  ...promoDocs,
  ...reviewDocs,
  ...complaintDocs,
  ...webhookDocs,
  ...systemDocs,
};
