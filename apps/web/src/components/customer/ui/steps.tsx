import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Checkout progress: done steps get a tick, the current one is highlighted, the rest stay quiet. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Progress">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="relative flex flex-col items-center gap-1.5" aria-current={active ? 'step' : undefined}>
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className="bg-border absolute start-[calc(50%+1.25rem)] top-3.5 h-0.5 w-[calc(100%-2.5rem)] overflow-hidden rounded-full"
              >
                <span
                  className={cn(
                    'bg-primary absolute inset-0 origin-left transition-transform duration-500 rtl:origin-right',
                    done ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </span>
            ) : null}
            <span
              className={cn(
                'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300',
                done && 'bg-primary text-primary-foreground',
                active && 'bg-background text-primary ring-primary ring-2',
                !done && !active && 'bg-muted text-muted-foreground',
              )}
            >
              {done ? <Check className="dh-tick size-4" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                'text-center text-xs leading-tight font-medium transition-colors',
                active || done ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
