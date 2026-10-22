import { adminDocs, systemDocs } from './ops/admin';
import { accountDocs, authDocs } from './ops/auth';
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
  ...vendorDocs,
  ...catalogDocs,
  ...vendorOrderDocs,
  ...adminDocs,
  ...systemDocs,
};
