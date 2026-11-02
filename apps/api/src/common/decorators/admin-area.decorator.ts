import { SetMetadata } from '@nestjs/common';
import type { AdminArea } from '../auth/admin-permissions';

export const ADMIN_AREA_KEY = 'adminArea';

/** Which admin sub-roles may call this route (see ADMIN_AREAS). Without it, only SUPER_ADMIN gets through. */
export const AdminAreaOnly = (area: AdminArea) => SetMetadata(ADMIN_AREA_KEY, area);
