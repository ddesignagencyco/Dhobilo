"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellIcon, BellRingIcon } from "lucide-react";
import { formatMoney } from "@dhoblio/shared";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BOARD_COLUMNS,
  type VendorOrderStatus,
  type VendorOrderSummary,
  useAcceptOrder,
  useAdvanceOrder,
  useVendorBoard,
  useVendorOrderCounts,
} from "@/lib/vendor/hooks/use-vendor-orders";
import { Countdown, StatusBadge, formatSlot } from "./order-helpers";
import { RejectDialog } from "./reject-dialog";
import { useNewOrderAlert } from "./use-new-order-alert";

const NEXT_STEP: Partial<Record<VendorOrderStatus, VendorOrderStatus>> = {
  ACCEPTED: "PICKED_UP",
  PICKED_UP: "IN_PROCESS",
  IN_PROCESS: "READY",
  READY: "OUT_FOR_DELIVERY",
};

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function OrderCard({
  order,
  onReject,
}: {
  order: VendorOrderSummary;
  onReject: (o: VendorOrderSummary) => void;
}) {
  const t = useTranslations("vendor.orders");
  const locale = useLocale();
  const accept = useAcceptOrder();
  const advance = useAdvanceOrder();
  const next = NEXT_STEP[order.status];

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(errorText(error, t("actionFailed")));
    }
  }

  return (
    <li className="bg-card space-y-3 rounded-lg border p-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/shop/orders/${order.id}`}
          className="min-w-0 font-medium hover:underline"
        >
          <span dir="ltr" className="block truncate">
            {order.orderNo}
          </span>
        </Link>
        <StatusBadge status={order.status} />
      </div>
      <div className="text-muted-foreground space-y-0.5 text-sm">
        <p className="truncate">
          {order.customerName ?? t("customer")} ·{" "}
          {t("items", { count: order.itemCount })}
        </p>
        <p>
          {t("pickup")}:{" "}
          {formatSlot(order.pickupSlotStart, order.pickupSlotEnd, locale)}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {formatMoney(order.vendorEarning)}
        </span>
        {order.status === "PLACED" && (
          <Countdown until={order.respondBy ?? order.vendorRespondBy} />
        )}
      </div>
      {order.status === "PLACED" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={accept.isPending}
            onClick={() =>
              run(() => accept.mutateAsync(order.id), t("accepted"))
            }
          >
            {t("accept")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onReject(order)}
          >
            {t("reject")}
          </Button>
        </div>
      )}
      {next && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          disabled={advance.isPending}
          onClick={() =>
            run(
              () => advance.mutateAsync({ orderId: order.id, status: next }),
              t("updated"),
            )
          }
        >
          {t(`advance.${next}`)}
        </Button>
      )}
    </li>
  );
}

function Column({
  title,
  count,
  orders,
  empty,
  onReject,
}: {
  title: string;
  count: number | undefined;
  orders: VendorOrderSummary[];
  empty: string;
  onReject: (o: VendorOrderSummary) => void;
}) {
  return (
    <section className="bg-muted/40 min-w-0 rounded-xl p-3">
      <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
        {title}
        <span className="bg-background rounded-full border px-2 py-0.5 text-xs tabular-nums">
          {count ?? orders.length}
        </span>
      </h2>
      {orders.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {empty}
        </p>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} onReject={onReject} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function OrderBoard() {
  const t = useTranslations("vendor.orders");
  const board = useVendorBoard();
  const counts = useVendorOrderCounts();
  const [rejecting, setRejecting] = useState<VendorOrderSummary | null>(null);

  const placedIds = useMemo(
    () => board.data?.filter((o) => o.status === "PLACED").map((o) => o.id),
    [board.data],
  );
  const { soundOn, enable } = useNewOrderAlert(placedIds, (n) =>
    toast.info(t("newOrders", { count: n })),
  );

  const columns = useMemo(() => {
    const data = board.data ?? [];
    const pick = (statuses: readonly VendorOrderStatus[]) =>
      data.filter((o) => statuses.includes(o.status));
    const sum = (statuses: readonly VendorOrderStatus[]) =>
      counts.data
        ? statuses.reduce((n, s) => n + (counts.data[s] ?? 0), 0)
        : undefined;
    return [
      {
        key: "new",
        title: t("columns.new"),
        orders: pick(BOARD_COLUMNS.new),
        count: sum(BOARD_COLUMNS.new),
        empty: t("empty.new"),
      },
      {
        key: "inProcess",
        title: t("columns.inProcess"),
        orders: pick(BOARD_COLUMNS.inProcess),
        count: sum(BOARD_COLUMNS.inProcess),
        empty: t("empty.inProcess"),
      },
      {
        key: "ready",
        title: t("columns.ready"),
        orders: pick(BOARD_COLUMNS.ready),
        count: sum(BOARD_COLUMNS.ready),
        empty: t("empty.ready"),
      },
    ];
  }, [board.data, counts.data, t]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <Button
          variant={soundOn ? "secondary" : "outline"}
          size="sm"
          onClick={enable}
        >
          {soundOn ? (
            <BellRingIcon className="me-2 size-4" />
          ) : (
            <BellIcon className="me-2 size-4" />
          )}
          {soundOn ? t("soundOn") : t("enableSound")}
        </Button>
      </div>

      {board.isError ? (
        <div
          role="alert"
          className="border-destructive/40 rounded-lg border p-4 text-sm"
        >
          <p className="mb-2">{errorText(board.error, t("loadFailed"))}</p>
          <Button size="sm" variant="outline" onClick={() => board.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : board.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {columns.map((c) => (
            <Column
              key={c.key}
              title={c.title}
              count={c.count}
              orders={c.orders}
              empty={c.empty}
              onReject={setRejecting}
            />
          ))}
        </div>
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
