import type { ReactNode } from 'react';
import {
  Banknote,
  Bike,
  CircleCheck,
  Clock,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  MapPin,
  PackageSearch,
  Store,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BrandLogo } from '@/components/brand/brand-logo';
import { LocaleToggle } from './locale-toggle';

export type AuthRole = 'customer' | 'vendor' | 'rider' | 'admin';

const BENEFIT_ICONS: Record<AuthRole, [LucideIcon, LucideIcon, LucideIcon]> = {
  customer: [Truck, PackageSearch, Banknote],
  vendor: [Store, LayoutGrid, Wallet],
  rider: [Bike, Clock, MapPin],
  admin: [LayoutDashboard, Wallet, LifeBuoy],
};

export const LOGIN_PATH: Record<AuthRole, string> = {
  customer: '/login',
  vendor: '/shop/login',
  rider: '/rider/login',
  admin: '/admin/login',
};

/** Faint ring cluster, anchored to the end corner so it mirrors in RTL. Decorative only. */
function BrandPattern() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 480 480"
      className="text-auth-brand-fg pointer-events-none absolute -end-24 -bottom-24 size-[30rem] opacity-[0.07] rtl:-scale-x-100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="240" cy="240" r="230" />
      <circle cx="240" cy="240" r="170" />
      <circle cx="240" cy="240" r="110" />
      <circle cx="240" cy="240" r="50" />
      <circle cx="380" cy="110" r="22" />
      <circle cx="120" cy="380" r="14" />
    </svg>
  );
}

/**
 * Split sign-in layout: the brand/what-we-do panel on the start side (lg+), the form on the other. Below
 * lg the panel collapses to a compact header so the form is the first thing on a phone.
 */
export async function AuthShell({ role, children }: { role: AuthRole; children: ReactNode }) {
  const t = await getTranslations('auth');
  const icons = BENEFIT_ICONS[role];
  // Staff sign-in is not advertised on the public role pages.
  const others = (Object.keys(LOGIN_PATH) as AuthRole[]).filter(
    (r) => r !== role && (role === 'admin' || r !== 'admin'),
  );

  return (
    <main className="auth-page bg-background grid min-h-dvh lg:grid-cols-2">
      <section
        aria-label={t(`${role}.badge`)}
        className="bg-auth-brand text-auth-brand-fg relative hidden flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16"
      >
        <BrandPattern />
        <div className="relative flex items-center justify-between">
          <BrandLogo tone="inverse" />
          <span className="text-auth-brand-fg rounded-full border border-white/25 px-3 py-1 text-xs font-medium">
            {t(`${role}.badge`)}
          </span>
        </div>

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-4">
            <p className="text-auth-brand-muted text-sm font-medium">{t('slogan')}</p>
            <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance xl:text-5xl">
              {t(`${role}.heading`)}
            </h2>
            <p className="text-auth-brand-muted text-base text-pretty">{t(`${role}.intro`)}</p>
          </div>

          <ul className="space-y-5">
            {(['b1', 'b2', 'b3'] as const).map((key, i) => {
              const Icon = icons[i]!;
              return (
                <li key={key} className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="space-y-0.5">
                    <span className="block font-medium">{t(`${role}.${key}.title`)}</span>
                    <span className="text-auth-brand-muted block text-sm">{t(`${role}.${key}.body`)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative space-y-3">
          <ul className="text-auth-brand-muted flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {(['t1', 't2', 't3'] as const).map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <CircleCheck className="size-4" aria-hidden />
                {t(`${role}.${key}`)}
              </li>
            ))}
          </ul>
          <p className="text-auth-brand-muted flex items-center gap-1.5 text-xs">
            <MapPin className="size-3.5" aria-hidden />
            {t('servingLahore')}
          </p>
        </div>
      </section>

      <div className="flex min-h-dvh flex-col lg:min-h-0">
        <header className="bg-auth-brand text-auth-brand-fg px-5 pt-6 pb-7 lg:hidden">
          <BrandLogo tone="inverse" />
          <p className="mt-4 text-xl font-semibold tracking-tight text-balance">{t('slogan')}</p>
          <p className="text-auth-brand-muted mt-1 text-sm">{t(`${role}.heading`)}</p>
        </header>

        <div className="flex justify-end px-5 pt-4 lg:px-10 lg:pt-6">
          <LocaleToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 lg:px-10">
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{t(`${role}.title`)}</h1>
              <p className="text-muted-foreground text-sm text-pretty">{t(`${role}.help`)}</p>
            </div>

            {children}

            <nav aria-label={t('orSwitch')} className="border-t pt-6">
              <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <li className="w-full text-xs font-medium tracking-wide uppercase">{t('orSwitch')}</li>
                {others.map((r) => (
                  <li key={r}>
                    <Link
                      href={LOGIN_PATH[r]}
                      className="text-primary inline-flex min-h-9 items-center underline-offset-4 hover:underline"
                    >
                      {t(`switch.${r}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </main>
  );
}
