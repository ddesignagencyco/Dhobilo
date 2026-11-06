import { cn } from '@/lib/utils';

const HUES = [196, 230, 262, 300, 350, 30, 70, 150];

function hueFor(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

const SKIP = new Set(['al', 'the', 'of', 'and', '&']);

function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !SKIP.has(w.toLowerCase()));
  const parts = meaningful.length > 0 ? meaningful : words;
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** A tonal monogram tile. Decorative colour only (never a status), derived from the name so it is stable. */
export function ShopAvatar({
  name,
  className,
  rounded = 'rounded-lg',
}: {
  name: string;
  className?: string;
  rounded?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ ['--h' as string]: hueFor(name) }}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center text-xs font-semibold select-none',
        'bg-[oklch(0.93_0.04_var(--h))] text-[oklch(0.36_0.09_var(--h))]',
        'dark:bg-[oklch(0.32_0.06_var(--h))] dark:text-[oklch(0.9_0.07_var(--h))]',
        rounded,
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
