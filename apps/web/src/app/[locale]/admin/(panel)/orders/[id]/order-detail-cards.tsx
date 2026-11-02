import { Bike, MapPin, Package } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { formatMoney, fromPaisa, subtractMoney, toPaisa } from '@dhoblio/shared';
import { StatusBadge } from '@/components/admin/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminOrderDetail, OrderDeliveryLeg, OrderTimelineEntry } from '@/lib/api/types';
import { formatDateTime, humanise } from '@/lib/format';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className={strong ? 'text-sm font-medium' : 'text-muted-foreground text-sm'}>{label}</span>
      <span className={`tabular ${strong ? 'text-base font-semibold' : 'text-sm'}`}>{value}</span>
    </div>
  );
}

export async function OrderDetailCards({
  order,
  timeline,
  delivery,
}: {
  order: AdminOrderDetail;
  timeline: OrderTimelineEntry[] | null;
  delivery: OrderDeliveryLeg[] | null;
}) {
  const t = await getTranslations();
  const address = order.addressSnapshot;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2">
              <Package className="size-4" />
              {t('orders.items')}
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('orders.item')}</TableHead>
                <TableHead>{t('orders.service')}</TableHead>
                <TableHead className="text-end">{t('orders.unitPrice')}</TableHead>
                <TableHead className="text-center">{t('orders.qty')}</TableHead>
                <TableHead className="text-end">{t('orders.lineTotal')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{humanise(item.serviceType)}</Badge>
                  </TableCell>
                  <TableCell className="text-end tabular">{formatMoney(item.unitPrice)}</TableCell>
                  <TableCell className="text-center tabular">{item.qty}</TableCell>
                  <TableCell className="text-end tabular">
                    {/* lineTotal is not always sent; unitPrice × qty in paisa is exact, so derive it. */}
                    {formatMoney(item.lineTotal ?? multiply(item.unitPrice, item.qty))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('orders.timeline')}</CardTitle>
          </CardHeader>
          <CardContent>
            {timeline === null ? (
              <p className="text-muted-foreground text-sm">{t('orders.timelineUnavailable')}</p>
            ) : timeline.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('orders.timelineEmpty')}</p>
            ) : (
              <ol className="relative space-y-4 ps-5">
                {/* The connecting line sits behind the dots, inset so it never pokes past the last one. */}
                <span className="bg-border absolute start-[3px] top-2 bottom-2 w-px" aria-hidden />
                {timeline.map((entry, i) => (
                  <li key={`${entry.status}-${entry.at}-${i}`} className="relative">
                    <span className="bg-primary absolute -start-5 top-1.5 size-[7px] rounded-full" aria-hidden />
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={entry.status} />
                      {entry.by ? (
                        <span className="text-muted-foreground text-xs">{humanise(entry.by)}</span>
                      ) : null}
                      <span className="text-muted-foreground ms-auto text-xs whitespace-nowrap">
                        {formatDateTime(entry.at)}
                      </span>
                    </div>
                    {entry.note ? <p className="mt-1 text-sm">{entry.note}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bike className="size-4" />
              {t('orders.delivery')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {delivery === null ? (
              <p className="text-muted-foreground text-sm">{t('orders.deliveryUnavailable')}</p>
            ) : delivery.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('orders.deliveryNone')}</p>
            ) : (
              <ul className="space-y-3">
                {delivery.map((leg) => (
                  <li key={leg.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                    <Badge variant="outline">{humanise(leg.jobType)}</Badge>
                    <StatusBadge status={leg.status} />
                    <span className="text-muted-foreground text-xs">
                      {leg.scheduledStart ? formatDateTime(leg.scheduledStart) : '—'}
                    </span>
                    <span className="ms-auto text-sm">
                      {leg.rider?.name ?? (
                        <span className="text-muted-foreground">{t('orders.noRiderYet')}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('orders.money')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label={t('orders.subtotal')} value={formatMoney(order.subtotal)} />
            {order.discountTotal && order.discountTotal !== '0.00' ? (
              <Row label={t('orders.discount')} value={`− ${formatMoney(order.discountTotal)}`} />
            ) : null}
            <Row label={t('orders.deliveryFee')} value={formatMoney(order.deliveryFee)} />
            <Separator className="my-2" />
            <Row label={t('common.total')} value={formatMoney(order.total)} strong />

            <Separator className="my-3" />
            {/*
              Commission is internal. It is fixed on the order when it is placed and is never shown to a
              customer; this card is admin-only, which is why it can appear here at all.
            */}
            <p className="text-muted-foreground mb-1 text-xs">{t('orders.internal')}</p>
            <Row
              label={t('orders.commission', { rate: order.commissionRatePct })}
              value={formatMoney(order.commissionAmount)}
            />
            <Row label={t('orders.vendorEarning')} value={formatMoney(order.vendorEarning)} />
            <Row
              label={t('orders.platformVsVendor')}
              value={formatMoney(subtractMoney(order.total, order.vendorEarning))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('orders.payment')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{humanise(order.paymentMethod)}</Badge>
              <StatusBadge status={order.paymentStatus} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4" />
              {t('orders.address')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {address ? (
              <>
                {address.label ? <p className="font-medium">{address.label}</p> : null}
                <p>{[address.line1, address.line2, address.area].filter(Boolean).join(', ') || '—'}</p>
                {address.lat !== null && address.lng !== null ? (
                  <a
                    className="text-primary inline-block pt-1 text-xs hover:underline"
                    href={`https://www.google.com/maps/search/?api=1&query=${address.lat},${address.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    dir="ltr"
                  >
                    {t('orders.openInMaps')}
                  </a>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('orders.schedule')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">{t('orders.pickupWindow')}</p>
              <p>{order.pickupSlotStart ? formatDateTime(order.pickupSlotStart) : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t('orders.deliveryWindow')}</p>
              <p>{order.deliverySlotStart ? formatDateTime(order.deliverySlotStart) : '—'}</p>
            </div>
            {order.customerNote ? (
              <div>
                <p className="text-muted-foreground text-xs">{t('orders.customerNote')}</p>
                <p>{order.customerNote}</p>
              </div>
            ) : null}
            {order.cancelReason ? (
              <div>
                <p className="text-muted-foreground text-xs">{t('orders.cancelReasonShown')}</p>
                <p>{order.cancelReason}</p>
              </div>
            ) : null}
            {order.rejectionReason ? (
              <div>
                <p className="text-muted-foreground text-xs">{t('orders.rejectionReason')}</p>
                <p>{order.rejectionReason}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * unitPrice × qty. Goes through the shared paisa helpers rather than parsing to a float: `Number(x) * 100`
 * is exactly the rounding the backend's Decimal arithmetic exists to avoid, and a line total that reads
 * one paisa off the vendor's own earnings report is a support ticket.
 */
function multiply(amount: string, qty: number): string {
  return fromPaisa(toPaisa(amount) * qty);
}
