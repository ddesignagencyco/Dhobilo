'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { formatMoney } from '@dhoblio/shared';
import { ActionDialog } from '@/components/admin/action-dialog';
import { PageHeader } from '@/components/admin/page-header';
import { EmptyState, ErrorState } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  type VendorCatalogItem,
  useCatalogItems,
  useDeleteCatalogItem,
  useServiceCategories,
  useUpdateCatalogItem,
} from '@/lib/vendor/hooks/use-vendor-catalog';
import { ImportDialog } from './import-dialog';
import { ItemDialog } from './item-dialog';

function PriceCell({ item }: { item: VendorCatalogItem }) {
  const t = useTranslations('vendor.catalog');
  const update = useUpdateCatalogItem();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const value = draft.trim();
    setDraft(null);
    if (Number(value) === Number(item.price)) return;
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) < 1 || Number(value) > 500000) {
      toast.error(t('errors.priceInvalid'));
      return;
    }
    update.mutate(
      { id: item.id, price: Number(value) },
      {
        onSuccess: () => toast.success(t('priceSaved')),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <div className="flex items-center gap-1.5" dir="ltr">
      <span className="text-muted-foreground text-xs">Rs</span>
      <Input
        aria-label={`${t('price')}: ${item.itemName}`}
        inputMode="decimal"
        className="h-8 w-24 text-end"
        value={draft ?? String(Number(item.price))}
        disabled={update.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
    </div>
  );
}

function ActiveSwitch({ item }: { item: VendorCatalogItem }) {
  const t = useTranslations('vendor.catalog');
  const update = useUpdateCatalogItem();
  return (
    <Switch
      checked={item.isActive}
      disabled={update.isPending}
      aria-label={`${item.isActive ? t('active') : t('inactive')}: ${item.itemName}`}
      onCheckedChange={(isActive) =>
        update.mutate(
          { id: item.id, isActive },
          {
            onSuccess: () => toast.success(t('saved')),
            onError: (error) => toast.error(error.message),
          },
        )
      }
    />
  );
}

export function CatalogManager() {
  const t = useTranslations('vendor.catalog');
  const locale = useLocale();
  const items = useCatalogItems();
  const categories = useServiceCategories();
  const remove = useDeleteCatalogItem();
  const [editing, setEditing] = useState<VendorCatalogItem | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<VendorCatalogItem | null>(null);

  const itemName = (i: VendorCatalogItem) => (locale === 'ur' && i.itemNameUr ? i.itemNameUr : i.itemName);
  const itemSecondary = (i: VendorCatalogItem) => (locale === 'ur' ? i.itemName : i.itemNameUr);

  const groups = new Map<number, { name: string; items: VendorCatalogItem[] }>();
  for (const item of items.data ?? []) {
    const group = groups.get(item.categoryId) ?? {
      name: locale === 'ur' && item.category.nameUr ? item.category.nameUr : item.category.name,
      items: [],
    };
    group.items.push(item);
    groups.set(item.categoryId, group);
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload />
              {t('import.open')}
            </Button>
            <Button onClick={() => setEditing('new')} disabled={!categories.data}>
              <Plus />
              {t('add')}
            </Button>
          </>
        }
      />

      {items.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : items.isError ? (
        <ErrorState error={items.error} onRetry={() => void items.refetch()} />
      ) : groups.size === 0 ? (
        <div className="bg-card rounded-lg border">
          <EmptyState
            title={t('empty')}
            hint={t('emptyHint')}
            action={
              <Button onClick={() => setEditing('new')} disabled={!categories.data}>
                <Plus />
                {t('add')}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([id, group]) => (
            <section key={id} aria-labelledby={`cat-${id}`}>
              <h2 id={`cat-${id}`} className="mb-2 text-sm font-semibold">
                {group.name}
                <span className="text-muted-foreground ms-2 font-normal">{group.items.length}</span>
              </h2>
              <ul className="bg-card divide-y rounded-lg border">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-2 p-3 ${item.isActive ? '' : 'opacity-60'}`}
                  >
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate font-medium">{itemName(item)}</p>
                      {itemSecondary(item) ? (
                        <p className="text-muted-foreground truncate text-xs" dir={locale === 'ur' ? 'ltr' : 'rtl'}>
                          {itemSecondary(item)}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{t(`serviceType.${item.serviceType}`)}</Badge>
                        <span className="text-muted-foreground text-xs">
                          {t('turnaround', { hours: item.turnaroundHours })}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {formatMoney(item.price, { decimals: false })}
                        </span>
                      </div>
                    </div>
                    <PriceCell item={item} />
                    <ActiveSwitch item={item} />
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(item)}
                        aria-label={`${t('edit')}: ${item.itemName}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleting(item)}
                        aria-label={`${t('delete')}: ${item.itemName}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && categories.data ? (
        <ItemDialog
          item={editing === 'new' ? null : editing}
          categories={categories.data}
          locale={locale}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}

      <ActionDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle')}
        description={deleting ? t('deleteBody', { name: deleting.itemName }) : undefined}
        confirmLabel={t('delete')}
        variant="destructive"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('deleted'));
              setDeleting(null);
            },
            onError: (error) => toast.error(error.message),
          });
        }}
      />
    </div>
  );
}
