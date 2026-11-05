"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { formatMoney } from "@dhoblio/shared";
import { ErrorState } from "@/components/admin/states";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type EarningsRange,
  useVendorEarnings,
} from "@/lib/vendor/hooks/use-vendor-earnings";

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold tabular-nums" dir="ltr">
        {value}
      </p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </Card>
  );
}

export function VendorEarningsDashboard() {
  const t = useTranslations("vendor.earnings");
  const format = useFormatter();
  const [range, setRange] = useState<EarningsRange>("week");
  const { data, isLoading, error, refetch } = useVendorEarnings(range);

  return (
    <div className="space-y-6">
      <Tabs value={range} onValueChange={(v) => setRange(v as EarningsRange)}>
        <TabsList>
          <TabsTrigger value="day">{t("day")}</TabsTrigger>
          <TabsTrigger value="week">{t("week")}</TabsTrigger>
          <TabsTrigger value="month">{t("month")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <>
          <section
            aria-label={t("periodTotals")}
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            <Tile label={t("orders")} value={String(data.totals.orders)} />
            <Tile label={t("gross")} value={formatMoney(data.totals.gross)} />
            <Tile
              label={t("commission")}
              value={formatMoney(data.totals.commission)}
            />
            <Tile label={t("net")} value={formatMoney(data.totals.net)} />
          </section>

          <section
            aria-label={t("balance")}
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            <Tile
              label={t("balanceTotal")}
              value={formatMoney(data.balance.total)}
            />
            <Tile
              label={t("balanceAvailable")}
              value={formatMoney(data.balance.available)}
            />
            <Tile
              label={t("balancePending")}
              value={formatMoney(data.balance.pending)}
            />
            <Tile
              label={t("awaitingCash")}
              value={formatMoney(data.balance.awaitingCash.amount)}
              hint={t("awaitingCashOrders", {
                count: data.balance.awaitingCash.orders,
              })}
            />
          </section>

          <Card className="overflow-hidden p-0">
            <h2 className="px-4 pt-4 text-sm font-semibold">
              {t("deliveredOrders")}
            </h2>
            {data.orders.length === 0 ? (
              <p className="text-muted-foreground px-4 py-10 text-center text-sm">
                {t("empty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("order")}</TableHead>
                      <TableHead>{t("delivered")}</TableHead>
                      <TableHead className="text-end">
                        {t("subtotal")}
                      </TableHead>
                      <TableHead className="text-end">
                        {t("commission")}
                      </TableHead>
                      <TableHead className="text-end">{t("net")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium" dir="ltr">
                          {o.orderNo}
                        </TableCell>
                        <TableCell>
                          {format.dateTime(new Date(o.deliveredAt), {
                            dateStyle: "medium",
                          })}
                        </TableCell>
                        <TableCell className="text-end tabular-nums" dir="ltr">
                          {formatMoney(o.subtotal)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums" dir="ltr">
                          {formatMoney(o.commission)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums" dir="ltr">
                          {formatMoney(o.net)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
