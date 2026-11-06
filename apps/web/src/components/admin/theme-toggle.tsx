'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export const THEME_KEY = 'dh-theme';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

export function setDark(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  // The cookie lets the server render the right theme on first paint (no white flash); localStorage is the
  // client's own record for the effect in AdminShell.
  document.cookie = `${THEME_KEY}=${dark ? 'dark' : 'light'}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  } catch {
    // Private mode: the theme just will not persist.
  }
}

export function ThemeToggle() {
  const t = useTranslations('adminShell');
  const dark = useIsDark();
  const label = dark ? t('toLight') : t('toDark');

  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={() => setDark(!dark)}>
      <span key={dark ? 'moon' : 'sun'} className="animate-pop flex">
        {dark ? <Sun /> : <Moon />}
      </span>
    </Button>
  );
}
