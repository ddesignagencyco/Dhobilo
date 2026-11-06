import { cn } from '@/lib/utils';

function initialsOf(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

/** First table column for people and businesses: initials tile, name, and one muted detail line. */
export function EntityCell({
  name,
  detail,
  className,
}: {
  name: string;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <span
        aria-hidden
        className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
      >
        {initialsOf(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        {detail ? <span className="text-muted-foreground block truncate text-xs">{detail}</span> : null}
      </span>
    </div>
  );
}
