import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditOptions {
  /** e.g. VENDOR_APPROVED */
  action: string;
  /** Aggregate name, e.g. Vendor */
  entity: string;
  /** Route param holding the entity id. Falls back to `data.id` of the response. */
  idParam?: string;
}

/** Mark a handler as a sensitive action; AuditInterceptor writes an AuditLog row after it succeeds. */
export const Audit = (options: AuditOptions) => SetMetadata(AUDIT_KEY, options);
