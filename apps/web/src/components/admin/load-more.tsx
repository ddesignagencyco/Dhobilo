'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export function LoadMore({
  hasNextPage,
  isLoading,
  onLoadMore,
  shown,
}: {
  hasNextPage: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  shown: number;
}) {
  const t = useTranslations('common');
  if (!shown) return null;

  return (
    <div className="flex items-center justify-center gap-3 border-t px-4 py-3">
      <span className="text-muted-foreground text-xs tabular">
        {shown} {hasNextPage ? '+' : ''}
      </span>
      {hasNextPage ? (
        <Button variant="outline" size="sm" onClick={onLoadMore} disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" /> : null}
          {t('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
