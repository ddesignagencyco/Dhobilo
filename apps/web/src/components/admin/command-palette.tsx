'use client';

import { useEffect, useMemo, useState } from 'react';
import { CornerDownLeft, Moon, Search, Sun } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { AdminRole } from '@dhoblio/shared';
import { useRouter, usePathname } from '@/i18n/navigation';
import { LOCALE_LABELS, routing } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { visibleNav } from '@/lib/admin/nav';
import { cn } from '@/lib/utils';
import { setDark, useIsDark } from './theme-toggle';

interface Command {
  id: string;
  label: string;
  group: 'pages' | 'actions';
  icon: React.ReactNode;
  run: () => void;
}

/** ⌘K / Ctrl+K / "/" jump-to: every admin page and the two global toggles, filtered as you type. */
export function CommandPalette({ adminRole }: { adminRole: AdminRole | null }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const dark = useIsDark();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((o) => !o);
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const pages: Command[] = visibleNav(adminRole).flatMap((group) =>
      group.items.map((item) => ({
        id: `page:${item.href || 'home'}`,
        label: t(`nav.${item.labelKey}`),
        group: 'pages' as const,
        icon: <item.icon className="size-4" aria-hidden />,
        run: () => router.push(`/admin${item.href}`),
      })),
    );
    const other = routing.locales.find((l) => l !== locale) ?? routing.locales[0];
    const actions: Command[] = [
      {
        id: 'action:theme',
        label: dark ? t('adminShell.toLight') : t('adminShell.toDark'),
        group: 'actions',
        icon: dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />,
        run: () => setDark(!dark),
      },
      {
        id: 'action:language',
        label: `${t('adminShell.switchLanguage')} · ${LOCALE_LABELS[other]}`,
        group: 'actions',
        icon: <span className="text-xs font-semibold">{other.toUpperCase()}</span>,
        run: () => router.replace(pathname, { locale: other }),
      },
    ];
    return [...pages, ...actions];
  }, [adminRole, dark, locale, pathname, router, t]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  function choose(command: Command | undefined) {
    if (!command) return;
    setOpen(false);
    command.run();
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery('');
      setCursor(0);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="text-muted-foreground hidden h-9 w-64 justify-start gap-2 font-normal md:inline-flex"
        onClick={() => setOpen(true)}
        aria-label={t('adminShell.searchHint')}
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-start">{t('adminShell.searchHint')}</span>
        <kbd className="bg-muted rounded px-1.5 py-0.5 font-sans text-[10px] font-medium">⌘K</kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label={t('adminShell.searchHint')}
      >
        <Search />
      </Button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent showCloseButton={false} className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{t('adminShell.searchHint')}</DialogTitle>
          <DialogDescription className="sr-only">{t('adminShell.searchPlaceholder')}</DialogDescription>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  choose(results[cursor]);
                }
              }}
              placeholder={t('adminShell.searchPlaceholder')}
              className="h-12 w-full bg-transparent text-sm outline-none"
              aria-label={t('adminShell.searchHint')}
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2" role="listbox">
            {results.length === 0 ? (
              <p className="text-muted-foreground px-3 py-8 text-center text-sm">
                {t('adminShell.searchEmpty', { q: query })}
              </p>
            ) : (
              results.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  onMouseMove={() => setCursor(index)}
                  onClick={() => choose(command)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm transition-colors',
                    index === cursor ? 'bg-accent text-accent-foreground' : 'text-foreground',
                  )}
                >
                  <span className="text-muted-foreground flex size-5 items-center justify-center">{command.icon}</span>
                  <span className="flex-1 truncate">{command.label}</span>
                  <span className="text-muted-foreground text-[11px]">{t(`adminShell.${command.group}`)}</span>
                  {index === cursor ? <CornerDownLeft className="text-muted-foreground size-3.5" aria-hidden /> : null}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
