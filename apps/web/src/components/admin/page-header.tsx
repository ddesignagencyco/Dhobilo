import type { ComponentProps } from 'react';
import { PageHeader as BasePageHeader } from '@/components/ui/page-header';

export function PageHeader(props: ComponentProps<typeof BasePageHeader>) {
  return <BasePageHeader {...props} className="mb-6" />;
}
