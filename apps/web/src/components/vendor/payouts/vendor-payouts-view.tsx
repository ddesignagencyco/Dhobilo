"use client";

import { useFormatter, useTranslations } from "next-intl";
import { formatMoney } from "@dhoblio/shared";
import { EmptyState, ErrorState } from "@/components/admin/states";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendorEarnings } from "@/lib/vendor/hooks/use-vendor-earnings";
import {
  type PayoutStatus,
  useVendorPayouts,
} from "@/lib/vendor/hooks/use-vendor-payouts";
import { PayoutRequestForm } from "./payout-request-form";

const STATUS_VARIANT: Record<PayoutStatus, BadgeVariant> = {
  REQUESTED: "warning",
  APPROVED: "info",
  PAID: "success",
  REJECTED: "destructive",
};

export function VendorPayoutsView() {
  const t = useTranslations("vendor.payouts");
  const format = useFormatter();
  const earnings = useVendorEarnings("week");
  const payouts = useVendorPayouts();

  return (
    <div className="space-y-6">
      {earnings.data ? (
        <div className="grid grid-cols-2 gap-3">
          <Card className="gap-1 p-4">
            <p className="text-muted-foreground text-xs">{t("available")}</p>
            <p className="text-xl font-semibold tabular-nums" dir="ltr">
              {formatMoney(earnings.data.balance.available)}
            </p>
          </Card>
          <Card className="gap-1 p-4">
            <p className="text-muted-foreground text-xs">{t("pending")}</p>
            <p className="text-xl font-semibold tabular-nums" dir="ltr">
              {formatMoney(earnings.data.balance.pending)}
            </p>
          </Card>
        </div>
      ) : (
        <Skeleton className="h-20" />
      )}

      {earnings.data ? (
        <PayoutRequestForm available={earnings.data.balance.available} />
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t("history")}</h2>
        {payouts.error ? (
          <ErrorState
            error={payouts.error}
            onRetry={() => void payouts.refetch()}
          />
        ) : payouts.isLoading || !payouts.data ? (
          <Skeleton className="h-32" />
        ) : payouts.data.length === 0 ? (
          <Card>
            <EmptyState title={t("empty")} hint={t("emptyHint")} />
          </Card>
        ) : (
          <ul className="space-y-2">
            {payouts.data.map((p) => (
              <li key={p.id}>
                <Card className="flex-row items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums" dir="ltr">
                      {formatMoney(p.amount)}
                    </p>
                    <p className="text-muted-foreground text-xs" dir="ltr">
                      {p.accountRef}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {format.dateTime(new Date(p.requestedAt), {
                        dateStyle: "medium",
                      })}
                      {p.txnRef ? ` · ${p.txnRef}` : ""}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[p.status]}>
                    {t(`status.${p.status}`)}
                  </Badge>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
