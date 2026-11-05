"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { formatMoney } from "@dhoblio/shared";
import { EmptyState, ErrorState } from "@/components/admin/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  type LedgerType,
  useVendorLedger,
} from "@/lib/vendor/hooks/use-vendor-earnings";

const FILTERS: ("ALL" | LedgerType)[] = [
  "ALL",
  "ORDER_EARNING",
  "COMMISSION",
  "PAYOUT",
  "ADJUSTMENT",
  "REFUND",
];
const PAGE = 25;

export function VendorLedgerView() {
  const t = useTranslations("vendor.ledger");
  const format = useFormatter();
  const { data, isLoading, error, refetch } = useVendorLedger();
  const [filter, setFilter] = useState<"ALL" | LedgerType>("ALL");
  const [shown, setShown] = useState(PAGE);

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-64" />;

  const rows = data.filter((e) => filter === "ALL" || e.type === filter);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Tabs
          value={filter}
          onValueChange={(v) => {
            setFilter(v as typeof filter);
            setShown(PAGE);
          }}
        >
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f} value={f}>
                {t(`type.${f}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <EmptyState title={t("empty")} hint={t("emptyHint")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("typeLabel")}</TableHead>
                  <TableHead>{t("note")}</TableHead>
                  <TableHead className="text-end">{t("amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, shown).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">
                      {format.dateTime(new Date(e.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={e.amount.startsWith("-") ? "muted" : "success"}
                      >
                        {t(`type.${e.type}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-end tabular-nums" dir="ltr">
                      {formatMoney(e.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {rows.length > shown ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
