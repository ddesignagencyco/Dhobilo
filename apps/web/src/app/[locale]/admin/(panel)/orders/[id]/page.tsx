import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TERMINAL_ORDER_STATUSES } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { StatusBadge } from '@/components/admin/status-badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import { fetchForPage } from '@/lib/api/server';
import type { AdminOrderDetail, DeliveryJob, OrderDeliveryLeg, OrderTimelineEntry } from '@/lib/api/types';
import { CancelOrderButton } from './cancel-order';
import { OrderDetailCards } from './order-detail-cards';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const returnTo = `/${locale}/admin/orders/${id}`;

  let order: AdminOrderDetail;
  try {
    const result = await fetchForPage<AdminOrderDetail>(`/admin/orders/${id}`, { locale, returnTo, cache: 'no-store' });
    order = result.data;
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  }

  /*
   * The timeline and delivery legs are separate endpoints, fetched in parallel. Each is allowed to fail on
   * its own: an order whose delivery legs will not load is still worth showing, because the money and
   * status on the left are what support is usually being asked about.
   */
  const [timeline, delivery] = await Promise.all([
    fetchForPage<OrderTimelineEntry[]>(`/orders/${id}/timeline`, { locale, returnTo, cache: 'no-store' })
      .then((r) => r.data)
      .catch(() => null),
    // The customer-facing /orders/:id/delivery is closed to admins; the dispatch list filters by order number.
    fetchForPage<DeliveryJob[]>('/admin/delivery/jobs', {
      locale,
      returnTo,
      cache: 'no-store',
      query: { orderNo: order.orderNo },
    })
      .then((r) =>
        r.data
          .filter((job) => job.order.orderNo === order.orderNo)
          .map(
            (job): OrderDeliveryLeg => ({
              id: job.id,
              jobType: job.jobType,
              status: job.status,
              scheduledStart: job.scheduledStart,
              scheduledEnd: job.scheduledEnd,
              startedAt: job.startedAt ?? null,
              completedAt: job.completedAt ?? null,
              handledBy: null,
              rider: job.rider ? { name: job.rider.name, photoUrl: null } : null,
            }),
          ),
      )
      .catch(() => null),
  ]);

  const canCancel = !TERMINAL_ORDER_STATUSES.includes(order.status);

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ms-2">
        <Link href="/admin/orders">
          <ArrowLeft className="rtl:rotate-180" />
          {t('orders.backToList')}
        </Link>
      </Button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono" dir="ltr">
              {order.orderNo}
            </span>
            <StatusBadge status={order.status} />
          </span>
        }
        description={`${order.vendor.businessName} · ${order.customer.name ?? order.customer.phone ?? ''}`}
        actions={canCancel ? <CancelOrderButton orderId={order.id} orderNo={order.orderNo} /> : null}
      />

      <OrderDetailCards order={order} timeline={timeline} delivery={delivery} />
    </>
  );
}
