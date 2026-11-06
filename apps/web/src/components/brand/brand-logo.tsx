import { cn } from '@/lib/utils';

/** The Dhoblio mark: a rounded tile with a "D" whose bowl is a washing bubble. Pure SVG so it scales crisply. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn('size-10 shrink-0', className)}>
      <rect width="40" height="40" rx="10" fill="currentColor" />
      <path
        d="M14 11h6.5a9 9 0 0 1 0 18H14V11Z"
        fill="none"
        stroke="var(--mark-fg, #fff)"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="17" r="1.6" fill="var(--mark-fg, #fff)" opacity=".85" />
    </svg>
  );
}

export function BrandLogo({
  tone = 'default',
  className,
}: {
  /** `inverse` is for the dark brand panel: a white tile with a teal mark. */
  tone?: 'default' | 'inverse';
  className?: string;
}) {
  const inverse = tone === 'inverse';
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark
        className={
          inverse ? 'text-white [--mark-fg:var(--auth-brand)]' : 'text-primary [--mark-fg:var(--primary-foreground)]'
        }
      />
      <span className="flex flex-col leading-none">
        <span
          lang="en"
          className={cn(
            'font-sans text-xl font-semibold tracking-tight',
            inverse ? 'text-auth-brand-fg' : 'text-foreground',
          )}
        >
          Dhoblio
        </span>
        <span
          lang="ur"
          className={cn('mt-1 text-[11px] font-medium', inverse ? 'text-auth-brand-muted' : 'text-muted-foreground')}
        >
          ڈھوبلیو
        </span>
      </span>
    </span>
  );
}
