import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skip the global JwtAuthGuard. Every route is authenticated unless marked @Public(). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
