import type { ReactNode } from 'react';

/**
 * The real document shell is src/app/[locale]/layout.tsx, which is where the locale and text direction
 * are known. This root exists because Next requires one above the dynamic segment.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
