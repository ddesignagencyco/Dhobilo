"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeftIcon } from "lucide-react";
import { formatMoney } from "@dhoblio/shared";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type VendorOrderStatus,
  useAcceptOrder,
  useAdvanceOrder,
  useVendorOrderDetail,
} from "@/lib/vendor/hooks/use-vendor-orders";
import {
  Countdown,
  StatusBadge,
  formatSlot,
  formatStamp,
} from "./order-helpers";
import { RejectDialog } from "./reject-dialog";

export function OrderDetail({ orderId }: { orderId: string }) {
  const t = useTranslations("vendor.orders");
  const locale = useLocale();
  const order = useVendorOrderDetail(orderId);
  const accept = useAcceptOrder();
  const advance = useAdvanceOrder();
  const [rejectOpen, setRejectOpen] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("actionFailed"),
      );
    }
  }

  const back = (
    <Link
      href="/shop/orders"
      className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
    >
      <ArrowLeftIcon className="size-4 rtl:rotate-180" />
      {t("backToBoard")}
    </Link>
  );

  if (order.isLoading) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <div className="space-y-4">
        {back}
        <div
          role="alert"
          className="border-destructive/40 rounded-lg border p-4 text-sm"
        >
          <p className="mb-2">
            {order.error instanceof Error
              ? order.error.message
              : t("loadFailed")}
          </p>
          <Button size="sm" variant="outline" onClick={() => order.refetch()}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  const o = order.data;
  const actions = o.nextActions.filter(
    (s): s is VendorOrderStatus => s !== "REJECTED" && s !== "CANCELLED",
  );
  const canAcceptReject =
    o.status === "PLACED" && o.nextActions.includes("ACCEPTED");
  const itemName = (i: (typeof o.items)[number]) =>
    locale === "ur" && i.nameUr ? i.nameUr : i.name;

  return (
    <div className="space-y-5">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 dir="ltr" className="text-2xl font-semibold tracking-tight">
            {o.orderNo}
          </h1>
          <StatusBadge status={o.status} />
        </div>
        {o.status === "PLACED" && <Countdown until={o.vendorRespondBy} />}
      </div>

      {(canAcceptReject || actions.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {canAcceptReject && (
            <>
              <Button
                disabled={accept.isPending}
                onClick={() =>
                  run(() => accept.mutateAsync(o.id), t("accepted"))
                }
              >
                {t("accept")}
              </Button>
              <Button variant="outline" onClick={() => setRejectOpen(true)}>
                {t("reject")}
              </Button>
            </>
          )}
          {!canAcceptReject &&
            actions.map((s) => (
              <Button
                key={s}
                disabled={advance.isPending}
                onClick={() =>
                  run(
                    () => advance.mutateAsync({ orderId: o.id, status: s }),
                    t("updated"),
                  )
                }
              >
                {t(`advance.${s}`)}
              </Button>
            ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="bg-card space-y-2 rounded-lg border p-4">
          <h2 className="font-semibold">{t("customer")}</h2>
          <p>{o.customer.name ?? "—"}</p>
          {o.customer.phone && (
            <p dir="ltr" className="text-muted-foreground text-start text-sm">
              {o.customer.phone}
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            {[
              o.addressSnapshot.line1,
              o.addressSnapshot.line2,
              o.addressSnapshot.area,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          {o.customerNote && (
            <p className="bg-muted rounded-md p-2 text-sm">
              <span className="font-medium">{t("note")}: </span>
              {o.customerNote}
            </p>
          )}
        </section>

        <section className="bg-card space-y-2 rounded-lg border p-4">
          <h2 className="font-semibold">{t("slots")}</h2>
          <p className="text-sm">
            <span className="text-muted-foreground">{t("pickup")}: </span>
            {formatSlot(o.pickupSlotStart, o.pickupSlotEnd, locale)}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">{t("delivery")}: </span>
            {formatSlot(o.deliverySlotStart, o.deliverySlotEnd, locale)}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">{t("payment")}: </span>
            {o.paymentMethod}
          </p>
          {(o.rejectionReason || o.cancelReason) && (
            <p className="text-destructive text-sm">
              {o.rejectionReason ?? o.cancelReason}
            </p>
          )}
        </section>
      </div>

      <section className="bg-card rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">{t("itemsTitle")}</h2>
        <ul className="divide-y">
          {o.items.map((i) => (
            <li
              key={i.id}
              className="flex items-start justify-between gap-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">{itemName(i)}</span>
                <span className="text-muted-foreground block">
                  {i.qty} × {formatMoney(i.unitPrice)}
                </span>
              </span>
              <span className="shrink-0 font-medium">
                {formatMoney(i.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
          <Row label={t("subtotal")} value={formatMoney(o.subtotal)} />
          <Row label={t("deliveryFee")} value={formatMoney(o.deliveryFee)} />
          <Row label={t("total")} value={formatMoney(o.total)} strong />
          <Row
            label={t("commission")}
            value={`− ${formatMoney(o.commissionAmount)}`}
          />
          <Row
            label={t("yourEarning")}
            value={formatMoney(o.vendorEarning)}
            strong
          />
        </dl>
      </section>

      <section className="bg-card rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">{t("timeline")}</h2>
        <ol className="space-y-2 text-sm">
          {o.timeline.map((e, idx) => (
            <li key={idx} className="flex items-center justify-between gap-3">
              <StatusBadge status={e.status} />
              <span className="text-muted-foreground">
                {formatStamp(e.at, locale)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <RejectDialog
        orderId={o.id}
        orderNo={o.orderNo}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
      />
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${strong ? "font-semibold" : "text-muted-foreground"}`}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
