import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { currentRider } from "@/lib/rider/server";

export default async function RiderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const rider = await currentRider();
  if (!rider) redirect(`/${locale}/rider/login`);

  const t = await getTranslations();
  const initial = (rider.name?.trim() || rider.phone || "?")
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="bg-muted/30 flex min-h-dvh flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
          <Link href="/rider/home" className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-sm font-semibold">
              D
            </span>
            <span className="font-semibold tracking-tight">
              {t("common.appName")}
            </span>
          </Link>

          <div className="text-xs text-muted-foreground ms-2 hidden sm:block">
            {t("rider.badge")}
          </div>

          <div className="ms-auto flex items-center gap-3">
            <Link
              href="/rider/cod"
              className="text-sm hover:text-primary transition-colors"
              aria-label={t("rider.nav.cod")}
            >
              {t("rider.nav.cod")}
            </Link>
            <Link
              href="/rider/earnings"
              className="text-sm hover:text-primary transition-colors"
              aria-label={t("rider.nav.earnings")}
            >
              {t("rider.nav.earnings")}
            </Link>
            <Link
              href="/rider/profile"
              className="bg-accent text-accent-foreground flex size-9 items-center justify-center rounded-full text-sm font-semibold"
              aria-label={t("rider.nav.profile")}
            >
              {initial}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-6">
        {children}
      </main>
    </div>
  );
}
