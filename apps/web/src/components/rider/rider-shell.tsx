'use client';

import { Banknote, BriefcaseBusiness, TrendingUp, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useRiderMe } from '@/lib/rider/hooks';
import { cn } from '@/lib/utils';
import { LocaleSwitch } from './locale-switch';

const TABS = [
  { href: '/rider/home', key: 'jobs', icon: BriefcaseBusiness, match: ['/rider/home', '/rider/job'] },
  { href: '/rider/earnings', key: 'earnings', icon: TrendingUp, match: ['/rider/earnings'] },
  { href: '/rider/cod', key: 'cod', icon: Banknote, match: ['/rider/cod'] },
  { href: '/rider/profile', key: 'profile', icon: UserRound, match: ['/rider/profile', '/rider/register'] },
] as const;

function OnlinePill() {
  const t = useTranslations('rider.shell');
  const me = useRiderMe();
  if (!me.data || me.data.status !== 'APPROVED') return null;
  const online = me.data.isOnline;
  return (
    <Link
      href="/rider/home"
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors',
        online ? 'bg-success/15 text-success-text' : 'bg-muted text-muted-foreground',
      )}
    >
      <span className="relative flex size-2.5">
        {online ? (
          <span className="bg-success absolute inline-flex size-full animate-ping rounded-full opacity-60" />
        ) : null}
        <span
          className={cn('relative inline-flex size-2.5 rounded-full', online ? 'bg-success' : 'bg-muted-foreground/60')}
        />
      </span>
      {online ? t('online') : t('offline')}
    </Link>
  );
}

function Brand({ className }: { className?: string }) {
  const t = useTranslations('rider');
  const common = useTranslations('common');
  return (
    <Link href="/rider/home" className={cn('flex items-center gap-2', className)}>
      <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-semibold">
        D
      </span>
      <span className="leading-tight">
        <span className="block font-semibold tracking-tight">{common('appName')}</span>
        <span className="text-muted-foreground block text-[11px] font-medium">{t('badge')}</span>
      </span>
    </Link>
  );
}

/** Desktop sidebar: the same four destinations as the phone tab bar, with a sliding active marker. */
function SideNav({ activeIndex, initial }: { activeIndex: number; initial: string }) {
  const t = useTranslations('rider');
  const me = useRiderMe();
  return (
    <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e lg:flex">
      <div className="border-sidebar-border flex h-16 items-center border-b px-5">
        <Brand />
      </div>
      <nav aria-label={t('shell.tabs')} className="relative flex-1 overflow-y-auto p-3">
        <ul className="relative">
          {activeIndex >= 0 ? (
            <span
              aria-hidden
              style={{ ['--i' as string]: activeIndex }}
              className="bg-primary pointer-events-none absolute start-0 top-1.5 h-8 w-1 translate-y-[calc(var(--i)*3rem)] rounded-e-full transition-transform duration-500 ease-[var(--ease-spring)]"
            />
          ) : null}
          {TABS.map(({ href, key, icon: Icon }, index) => {
            const active = index === activeIndex;
            return (
              <li key={href} className="mb-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium transition-colors duration-200',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                  )}
                >
                  <Icon className={cn('size-5', active && 'text-primary')} aria-hidden />
                  {t(`nav.${key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Link
        href="/rider/profile"
        className="border-sidebar-border hover:bg-sidebar-accent/60 m-3 flex items-center gap-3 rounded-xl border p-3 transition-colors"
      >
        <span className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {initial}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{me.data?.name ?? t('badge')}</span>
          <span className="text-muted-foreground tabular block truncate text-xs" dir="ltr">
            {me.data?.phone ?? ''}
          </span>
        </span>
      </Link>
    </aside>
  );
}

export function RiderShell({ children, initial }: { children: React.ReactNode; initial: string }) {
  const t = useTranslations('rider');
  const pathname = usePathname();

  // On phones the job screen carries its own fixed action bar, so the tab bar steps aside there.
  const isJobPage = pathname.startsWith('/rider/job/');
  const activeIndex = TABS.findIndex((tab) => tab.match.some((m) => pathname.startsWith(m)));

  return (
    <div className="bg-muted/30 min-h-dvh">
      <SideNav activeIndex={activeIndex} initial={initial} />

      <div className="flex min-h-dvh flex-col lg:ps-64">
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20 border-b backdrop-blur-md">
          <div className="mx-auto flex h-14 w-full items-center gap-2 px-4 md:max-w-5xl md:px-6 lg:h-16 lg:max-w-none lg:px-8">
            <Brand className="lg:hidden" />

            {/* Tablet: the tab bar moves up into the header. */}
            <nav aria-label={t('shell.tabs')} className="mx-4 hidden flex-1 md:block lg:hidden">
              <ul className="flex items-center gap-1">
                {TABS.map(({ href, key, icon: Icon }, index) => {
                  const active = index === activeIndex;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary/12 text-primary'
                            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {t(`nav.${key}`)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="ms-auto flex items-center gap-2">
              <OnlinePill />
              <LocaleSwitch />
              <Link
                href="/rider/profile"
                aria-label={t('nav.profile')}
                className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-full text-sm font-semibold transition-transform active:scale-95 md:hidden"
              >
                {initial}
              </Link>
            </div>
          </div>
        </header>

        <main
          className={cn(
            'mx-auto w-full flex-1 px-4 pt-5 md:max-w-5xl md:px-6 lg:max-w-none lg:px-8 lg:pt-8 lg:pb-10',
            'xl:max-w-[1500px] 2xl:max-w-[1760px]',
            isJobPage ? 'pb-40 md:pb-40' : 'pb-28 md:pb-10',
          )}
        >
          {children}
        </main>

        {isJobPage ? null : (
          <nav
            aria-label={t('shell.tabs')}
            className="bg-background/92 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md md:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <ul className="relative mx-auto flex w-full max-w-3xl items-stretch">
              {activeIndex >= 0 ? (
                <span
                  aria-hidden
                  style={{ ['--i' as string]: activeIndex }}
                  className="pointer-events-none absolute inset-y-0 start-0 flex w-1/4 justify-center transition-transform duration-500 ease-[var(--ease-spring)] ltr:translate-x-[calc(var(--i)*100%)] rtl:-translate-x-[calc(var(--i)*100%)]"
                >
                  <span className="bg-primary h-1 w-12 rounded-b-full" />
                </span>
              ) : null}
              {TABS.map(({ href, key, icon: Icon }, index) => {
                const active = index === activeIndex;
                return (
                  <li key={href} className="flex-1">
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex min-h-[4.25rem] flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-200',
                        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-14 items-center justify-center rounded-full transition-all duration-300',
                          active ? 'bg-primary/12 scale-100' : 'scale-95 group-active:scale-90',
                        )}
                      >
                        <Icon
                          className={cn('size-6 transition-transform duration-300', active && 'scale-110')}
                          aria-hidden
                        />
                      </span>
                      <span>{t(`nav.${key}`)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
