"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney } from "@dhoblio/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRiderEarnings } from "@/lib/rider/hooks";

type Period = "today" | "week" | "month";
const DAYS: Record<Period, number> = { today: 0, week: 6, month: 29 };

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function RiderEarningsView() {
  const t = useTranslations("rider.earnings");
  const [period, setPeriod] = useState<Period>("week");

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - DAYS[period]);
    return { from: isoDay(from), to: isoDay(to) };
  }, [period]);

  const { data: earnings, isLoading, isError } = useRiderEarnings(range);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(["today", "week", "month"] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? "default" : "outline"}
            onClick={() => setPeriod(p)}
            className="flex-1"
            size="sm"
          >
            {t(p)}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Card className="bg-muted h-48 animate-pulse" />
      ) : isError || !earnings ? (
        <Card className="p-6">
          <p>{t("error")}</p>
        </Card>
      ) : (
        <>
          <Card className="border-primary border-2 p-6">
            <p className="text-muted-foreground text-sm font-medium">
              {t("totalEarnings")}
            </p>
            <p className="mt-3 text-4xl font-bold">
              {formatMoney(earnings.totals.earned)}
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              {earnings.totals.jobs} {t("deliveries")}
            </p>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 font-semibold">{t("byDay")}</h3>
            {earnings.days.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noEarnings")}</p>
            ) : (
              <div className="space-y-3">
                {[...earnings.days].reverse().map((d) => (
                  <div
                    key={d.day}
                    className="flex items-center justify-between border-b py-3 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{d.day}</p>
                      <p className="text-muted-foreground text-xs">
                        {d.jobs} {t("jobs")}
                      </p>
                    </div>
                    <span className="font-semibold">
                      {formatMoney(d.earned)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
