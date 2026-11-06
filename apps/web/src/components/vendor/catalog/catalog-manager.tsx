'use client';

import { useState } from 'react';
import {
  Pencil,
  Plus,
  SearchIcon,
  ShirtIcon,
  SparklesIcon,
  Trash2,
  Upload,
  WashingMachineIcon,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/admin/action-dialog';
import { PageHeader } from '@/components/admin/page-header';
import { EmptyState, ErrorState } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
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

const SERVICE_ICON: Record<string, LucideIcon> = {
  WASH_FOLD: WashingMachineIcon,
  WASH_IRON: WashingMachineIcon,
  DRY_CLEAN: SparklesIcon,
  IRON_ONLY: ShirtIcon,
};

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
    <div className="relative" dir="ltr">
      <span className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-xs">
        Rs
      </span>
      <Input
        aria-label={`${t('price')}: ${item.itemName}`}
        inputMode="decimal"
        className="tabular h-9 w-28 ps-8 text-end font-medium"
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
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<number | null>(null);

  const itemName = (i: VendorCatalogItem) => (locale === 'ur' && i.itemNameUr ? i.itemNameUr : i.itemName);
  const itemSecondary = (i: VendorCatalogItem) => (locale === 'ur' ? i.itemName : i.itemNameUr);

  const all = items.data ?? [];
  const q = query.trim().toLowerCase();
  const visible = all.filter(
    (i) =>
      (cat === null || i.categoryId === cat) &&
      (q === '' || i.itemName.toLowerCase().includes(q) || (i.itemNameUr ?? '').includes(q)),
  );
  const categoryChips = [...new Map(all.map((i) => [i.categoryId, i.category])).entries()];
  const activeCount = all.filter((i) => i.isActive).length;

  const groups = new Map<number, { name: string; items: VendorCatalogItem[] }>();
  for (const item of visible) {
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

      {all.length > 0 ? (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-52 flex-1 sm:max-w-sm">
              <SearchIcon
                className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                className="ps-9"
              />
            </div>
            <p className="text-muted-foreground tabular text-sm">
              {t('summary', { total: all.length, active: activeCount })}
            </p>
          </div>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
            {[[null, { name: t('allCategories'), nameUr: t('allCategories') }] as const, ...categoryChips].map(
              ([id, c]) => (
                <button
                  key={String(id)}
                  type="button"
                  onClick={() => setCat(id)}
                  aria-pressed={cat === id}
                  className={cn(
                    'min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-all duration-200',
                    cat === id
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-card text-muted-foreground hover:text-foreground hover:border-primary/40',
                  )}
                >
                  {id === null ? c.name : locale === 'ur' && c.nameUr ? c.nameUr : c.name}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}

      {items.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : items.isError ? (
        <ErrorState error={items.error} onRetry={() => void items.refetch()} />
      ) : groups.size === 0 && all.length > 0 ? (
        <div className="bg-card rounded-xl border">
          <EmptyState title={t('noMatches')} hint={t('noMatchesHint')} />
        </div>
      ) : groups.size === 0 ? (
        <div className="bg-card rounded-xl border">
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
        <div className="stagger space-y-7">
          {[...groups.entries()].map(([id, group]) => (
            <section key={id} aria-labelledby={`cat-${id}`}>
              <h2 id={`cat-${id}`} className="mb-2.5 flex items-center text-sm font-semibold">
                {group.name}
                <span className="bg-muted text-muted-foreground tabular ms-2 rounded-full px-2 py-0.5 text-xs font-semibold">
                  {group.items.length}
                </span>
              </h2>
              <ul className="bg-card divide-y overflow-hidden rounded-xl border shadow-xs">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      'hover:bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors',
                      !item.isActive && 'opacity-60',
                    )}
                  >
                    <span className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                      {(() => {
                        const Icon = SERVICE_ICON[item.serviceType] ?? ShirtIcon;
                        return <Icon className="size-5" aria-hidden />;
                      })()}
                    </span>
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
