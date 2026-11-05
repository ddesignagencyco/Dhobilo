"use client";

import { useTranslations } from "next-intl";
import { formatMoney } from "@dhoblio/shared";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useRiderCod } from "@/lib/rider/hooks";

export function CodCollectionScreen() {
  const t = useTranslations("rider.cod");
  const { data, isLoading, isError } = useRiderCod();

  if (isLoading) return <Card className="bg-muted h-48 animate-pulse" />;
  if (isError || !data) {
    return (
      <Card className="p-6">
        <p>{t("error")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <p className="text-muted-foreground text-sm font-medium">
          {t("cashBalance")}
        </p>
        <p className="mt-3 text-4xl font-bold">
          {formatMoney(data.cashInHand)}
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          {data.unsettledOrders} {t("unsettled")}
        </p>
      </Card>

      <div>
        <h3 className="mb-4 font-semibold">{t("collectionHistory")}</h3>
        {data.collections.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noCash")}</p>
        ) : (
          <div className="space-y-3">
            {data.collections.map((entry) => (
              <Card key={entry.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{entry.orderNo}</p>
                    <p className="text-muted-foreground text-sm">
                      {new Date(entry.collectedAt).toLocaleString("en-PK", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold">{formatMoney(entry.amount)}</p>
                    <Badge
                      className="mt-1"
                      variant={entry.settled ? "secondary" : "default"}
                    >
                      {entry.settled ? t("settled") : t("collected")}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="text-muted-foreground bg-muted/50 rounded-lg p-4 text-xs">
        <p className="mb-2 font-medium">{t("notice")}</p>
        <p>{t("noticeText")}</p>
      </div>
    </div>
  );
}
