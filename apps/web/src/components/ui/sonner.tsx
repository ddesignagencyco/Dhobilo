'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useLocale } from 'next-intl';
import { isRtl } from '@/i18n/routing';

/** Toasts sit opposite the sidebar, and flip side in Urdu so they never cover the navigation. */
const Toaster = (props: ToasterProps) => {
  const locale = useLocale();
  return (
    <Sonner
      dir={isRtl(locale) ? 'rtl' : 'ltr'}
      position={isRtl(locale) ? 'bottom-left' : 'bottom-right'}
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: 'group toast bg-popover text-popover-foreground border-border shadow-lg',
          description: 'text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
