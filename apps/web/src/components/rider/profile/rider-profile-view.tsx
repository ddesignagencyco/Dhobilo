"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@dhoblio/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { signOutRider } from "@/lib/rider/actions";
import { useRiderMe } from "@/lib/rider/hooks";

export function RiderProfileView() {
  const t = useTranslations("rider.profile");
  const locale = useLocale();
  const me = useRiderMe();
  const [pending, startTransition] = useTransition();

  const profile = me.data;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-6 text-lg font-semibold">{t("personalInfo")}</h3>
        {me.isLoading ? (
          <div className="bg-muted h-24 animate-pulse rounded" />
        ) : !profile ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              {t("notRegistered")}
            </p>
            <Button asChild className="w-full">
              <Link href="/rider/register">{t("register")}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-muted-foreground text-sm">{t("name")}</p>
              <p className="font-medium break-words">{profile.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">{t("phone")}</p>
              <p className="font-medium" dir="ltr">
                {profile.phone}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">{t("status")}</p>
              <Badge className="mt-1">{t(`statuses.${profile.status}`)}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">{t("today")}</p>
              <p className="font-medium">
                {formatMoney(profile.today.earned)} · {profile.today.jobs}{" "}
                {t("jobs")}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">{t("activeJobs")}</p>
              <p className="font-medium">
                {profile.activeJobs} / {profile.maxActiveJobs}
              </p>
            </div>
          </div>
        )}
      </Card>

      <Button asChild variant="outline" className="w-full">
        <Link href="/rider/cod">{t("cod")}</Link>
      </Button>

      <Button
        variant="destructive"
        className="w-full"
        disabled={pending}
        onClick={() => startTransition(() => signOutRider(locale))}
      >
        {t("logout")}
      </Button>
    </div>
  );
}
