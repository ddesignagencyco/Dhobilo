import { cn } from '@/lib/utils';

/** Stable hue per name so a vendor keeps its colour on every screen without needing a logo upload. */
const HUES = [196, 160, 250, 28, 330, 85, 290, 12];

function hueFor(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return HUES[hash % HUES.length] ?? 196;
}

function initialsFor(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words[1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

const SIZES = {
  sm: 'size-10 rounded-xl text-sm',
  md: 'size-14 rounded-2xl text-lg',
  lg: 'size-20 rounded-3xl text-2xl',
} as const;

export function Monogram({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const hue = hueFor(name);
  return (
    <span
      aria-hidden
      style={{ ['--mh' as string]: hue }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold tracking-tight select-none',
        'bg-[oklch(0.94_0.05_var(--mh))] text-[oklch(0.38_0.1_var(--mh))]',
        'dark:bg-[oklch(0.32_0.07_var(--mh))] dark:text-[oklch(0.88_0.09_var(--mh))]',
        'ring-1 ring-[oklch(0.85_0.06_var(--mh))] dark:ring-[oklch(0.42_0.07_var(--mh))]',
        SIZES[size],
        className,
      )}
    >
      {initialsFor(name)}
    </span>
  );
}
