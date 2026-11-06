'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BellIcon, BellRingIcon, CalendarClockIcon, CheckIcon, InboxIcon, PackageCheckIcon, XIcon } from 'lucide-react';
import { formatMoney } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  BOARD_COLUMNS,
  type VendorOrderStatus,
  type VendorOrderSummary,
  useAcceptOrder,
  useAdvanceOrder,
  useVendorBoard,
  useVendorOrderCounts,
} from '@/lib/vendor/hooks/use-vendor-orders';
import { ShopAvatar } from '../shop-avatar';
import { SlaMeter, SlotText, StatusBadge, timeAgo } from './order-helpers';
import { RejectDialog } from './reject-dialog';
import { useNewOrderAlert } from './use-new-order-alert';

const NEXT_STEP: Partial<Record<VendorOrderStatus, VendorOrderStatus>> = {
  ACCEPTED: 'PICKED_UP',
  PICKED_UP: 'IN_PROCESS',
  IN_PROCESS: 'READY',
  READY: 'OUT_FOR_DELIVERY',
};

type ColumnKey = 'new' | 'inProcess' | 'ready';

const TONE: Record<ColumnKey, { rail: string; dot: string; chip: string }> = {
  new: { rail: 'bg-warning', dot: 'bg-warning', chip: 'bg-warning/20 text-warning-text' },
  inProcess: { rail: 'bg-info', dot: 'bg-info', chip: 'bg-info/15 text-info-text' },
  ready: { rail: 'bg-success', dot: 'bg-success', chip: 'bg-success/15 text-success-text' },
};

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function OrderCard({
  order,
  column,
  fresh,
  onReject,
}: {
  order: VendorOrderSummary;
  column: ColumnKey;
  fresh: boolean;
  onReject: (o: VendorOrderSummary) => void;
}) {
  const t = useTranslations('vendor.orders');
  const locale = useLocale();
  const accept = useAcceptOrder();
  const advance = useAdvanceOrder();
  const next = NEXT_STEP[order.status];
  const customer = order.customerName ?? t('customer');

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(errorText(error, t('actionFailed')));
    }
  }

  return (
    <li
      className={cn(
        'bg-card hover-lift animate-pop group relative overflow-hidden rounded-xl border shadow-xs',
        fresh && 'ring-primary/60 ring-2',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 start-0 w-1', TONE[column].rail)} />
      <div className="space-y-3 p-3.5 ps-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/shop/orders/${order.id}`}
              className="after:absolute after:inset-0 focus-visible:outline-none"
              aria-label={order.orderNo}
            >
              <span dir="ltr" className="tabular block truncate text-sm font-semibold group-hover:underline">
                {order.orderNo}
              </span>
            </Link>
            <p className="text-muted-foreground text-xs">{timeAgo(order.placedAt, locale)}</p>
          </div>
          <div className="relative z-10 flex items-center gap-1.5">
            {fresh ? (
              <span className="bg-primary text-primary-foreground animate-pop rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                {t('newBadge')}
              </span>
            ) : null}
            <StatusBadge status={order.status} />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <ShopAvatar name={customer} className="size-8 text-[11px]" rounded="rounded-full" />
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{customer}</p>
            <p className="text-muted-foreground text-xs">{t('items', { count: order.itemCount })}</p>
          </div>
        </div>

        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <CalendarClockIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {t('pickup')}: <SlotText start={order.pickupSlotStart} end={order.pickupSlotEnd} locale={locale} />
          </span>
        </p>

        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-muted-foreground text-[11px]">{t('youEarn')}</p>
            <p className="tabular text-lg leading-none font-semibold">{formatMoney(order.vendorEarning)}</p>
          </div>
        </div>

        {order.status === 'PLACED' ? (
          <SlaMeter placedAt={order.placedAt} until={order.respondBy ?? order.vendorRespondBy} />
        ) : null}

        {order.status === 'PLACED' && (
          <div className="relative z-10 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={accept.isPending}
              onClick={() => run(() => accept.mutateAsync(order.id), t('accepted'))}
            >
              <CheckIcon />
              {t('accept')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="hover:text-destructive flex-1"
              onClick={() => onReject(order)}
            >
              <XIcon />
              {t('reject')}
            </Button>
          </div>
        )}
        {next && (
          <Button
            size="sm"
            variant="secondary"
            className="relative z-10 w-full"
            disabled={advance.isPending}
            onClick={() => run(() => advance.mutateAsync({ orderId: order.id, status: next }), t('updated'))}
          >
            <PackageCheckIcon />
            {t(`advance.${next}`)}
          </Button>
        )}
      </div>
    </li>
  );
}

function Column({
  columnKey,
  title,
  count,
  orders,
  empty,
  freshIds,
  onReject,
  className,
}: {
  columnKey: ColumnKey;
  title: string;
  count: number | undefined;
  orders: VendorOrderSummary[];
  empty: string;
  freshIds: Set<string>;
  onReject: (o: VendorOrderSummary) => void;
  className?: string;
}) {
  const shown = count ?? orders.length;
  return (
    <section className={cn('bg-muted/50 min-w-0 rounded-2xl p-2.5 sm:p-3', className)} aria-label={title}>
      <h2 className="bg-muted/80 sticky top-14 z-10 mb-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold backdrop-blur">
        <span aria-hidden className={cn('size-2 rounded-full', TONE[columnKey].dot)} />
        {title}
        <span className={cn('tabular ms-auto rounded-full px-2 py-0.5 text-xs font-semibold', TONE[columnKey].chip)}>
          {shown}
        </span>
      </h2>
      {orders.length === 0 ? (
        <EmptyState
          icon={<InboxIcon aria-hidden />}
          title={empty}
          className="border-transparent bg-transparent py-10"
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} column={columnKey} fresh={freshIds.has(o.id)} onReject={onReject} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function OrderBoard() {
  const t = useTranslations('vendor.orders');
  const board = useVendorBoard();
  const counts = useVendorOrderCounts();
  const [rejecting, setRejecting] = useState<VendorOrderSummary | null>(null);
  const [tab, setTab] = useState<ColumnKey>('new');
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const placedIds = useMemo(() => board.data?.filter((o) => o.status === 'PLACED').map((o) => o.id), [board.data]);
  const known = useRef<Set<string> | null>(null);
  const { soundOn, enable } = useNewOrderAlert(placedIds, (n) => toast.info(t('newOrders', { count: n })));

  useEffect(() => {
    if (!placedIds) return;
    if (known.current === null) {
      known.current = new Set(placedIds);
      return;
    }
    const added = placedIds.filter((id) => !known.current!.has(id));
    placedIds.forEach((id) => known.current!.add(id));
    if (added.length === 0) return;
    setFreshIds((prev) => new Set([...prev, ...added]));
    const timer = window.setTimeout(
      () => setFreshIds((prev) => new Set([...prev].filter((id) => !added.includes(id)))),
      8000,
    );
    return () => window.clearTimeout(timer);
  }, [placedIds]);

  const columns = useMemo(() => {
    const data = board.data ?? [];
    const pick = (statuses: readonly VendorOrderStatus[]) => data.filter((o) => statuses.includes(o.status));
    const sum = (statuses: readonly VendorOrderStatus[]) =>
      counts.data ? statuses.reduce((n, s) => n + (counts.data[s] ?? 0), 0) : undefined;
    return [
      {
        key: 'new' as const,
        title: t('columns.new'),
        orders: pick(BOARD_COLUMNS.new),
        count: sum(BOARD_COLUMNS.new),
        empty: t('empty.new'),
      },
      {
        key: 'inProcess' as const,
        title: t('columns.inProcess'),
        orders: pick(BOARD_COLUMNS.inProcess),
        count: sum(BOARD_COLUMNS.inProcess),
        empty: t('empty.inProcess'),
      },
      {
        key: 'ready' as const,
        title: t('columns.ready'),
        orders: pick(BOARD_COLUMNS.ready),
        count: sum(BOARD_COLUMNS.ready),
        empty: t('empty.ready'),
      },
    ];
  }, [board.data, counts.data, t]);

  const touch = useRef<number | null>(null);
  const order: ColumnKey[] = ['new', 'inProcess', 'ready'];
  function onTouchEnd(x: number) {
    if (touch.current === null) return;
    const dx = x - touch.current;
    touch.current = null;
    if (Math.abs(dx) < 70) return;
    const rtl = document.documentElement.dir === 'rtl';
    const dir = dx < 0 !== rtl ? 1 : -1;
    const next = order[order.indexOf(tab) + dir];
    if (next) setTab(next);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button variant={soundOn ? 'secondary' : 'outline'} size="sm" onClick={enable} aria-pressed={soundOn}>
            {soundOn ? <BellRingIcon className="text-primary" /> : <BellIcon />}
            {soundOn ? t('soundOn') : t('enableSound')}
          </Button>
        }
      />

      {board.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {errorText(board.error, t('loadFailed'))}
            <Button size="sm" variant="outline" onClick={() => board.refetch()}>
              {t('retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : board.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-muted/50 space-y-3 rounded-2xl p-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-44 rounded-xl" />
              <Skeleton className="h-44 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label={t('title')}
            className="bg-muted sticky top-14 z-20 grid grid-cols-3 gap-1 rounded-xl p-1 lg:hidden"
          >
            {columns.map((c) => (
              <button
                key={c.key}
                role="tab"
                type="button"
                aria-selected={tab === c.key}
                onClick={() => setTab(c.key)}
                className={cn(
                  'flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-all duration-200',
                  tab === c.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                )}
              >
                <span className="truncate">{c.title}</span>
                <span
                  className={cn(
                    'tabular rounded-full px-1.5 text-xs font-semibold',
                    tab === c.key ? TONE[c.key].chip : 'bg-background/70',
                  )}
                >
                  {c.count ?? c.orders.length}
                </span>
              </button>
            ))}
          </div>

          <div
            className="grid items-start gap-4 lg:grid-cols-3"
            onTouchStart={(e) => (touch.current = e.touches[0]!.clientX)}
            onTouchEnd={(e) => onTouchEnd(e.changedTouches[0]!.clientX)}
          >
            {columns.map((c) => (
              <Column
                key={c.key}
                columnKey={c.key}
                title={c.title}
                count={c.count}
                orders={c.orders}
                empty={c.empty}
                freshIds={freshIds}
                onReject={setRejecting}
                className={cn(tab === c.key ? 'block' : 'hidden', 'lg:block')}
              />
            ))}
          </div>
        </>
      )}

      {rejecting && (
        <RejectDialog
          orderId={rejecting.id}
          orderNo={rejecting.orderNo}
          open
          onOpenChange={(o) => !o && setRejecting(null)}
          onDone={() => setRejecting(null)}
        />
      )}
    </div>
  );
}
