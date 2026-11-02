import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Locale-aware Link/router. Always use these, never next/link, so the locale prefix is never dropped. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
