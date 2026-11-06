'use client';

import { CheckIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const STEPS = [
  { number: 1, key: 'business' },
  { number: 2, key: 'location' },
  { number: 3, key: 'documents' },
  { number: 4, key: 'review' },
];

export function WizardHeader({ currentStep }: { currentStep: number }) {
  const t = useTranslations('vendor.register.steps');
  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="mb-8 space-y-3">
      <ol className="relative flex items-start justify-between">
        <span aria-hidden className="bg-muted absolute inset-x-5 top-5 h-0.5" />
        <span
          aria-hidden
          className="bg-primary absolute inset-s-5 top-5 h-0.5 transition-[width] duration-500 ease-[var(--ease-out)]"
          style={{ width: `calc((100% - 2.5rem) * ${progress / 100})` }}
        />
        {STEPS.map((step) => {
          const done = currentStep > step.number;
          const active = currentStep === step.number;
          return (
            <li
              key={step.number}
              aria-current={active ? 'step' : undefined}
              className="relative z-10 flex w-20 flex-col items-center gap-2 text-center"
            >
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary bg-card text-primary ring-primary/15 ring-4',
                  !done && !active && 'border-border bg-card text-muted-foreground',
                )}
              >
                {done ? (
                  <CheckIcon className="animate-pop size-5" aria-hidden />
                ) : (
                  <span className="tabular">{step.number}</span>
                )}
              </span>
              <span className={cn('text-xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                {t(step.key)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
