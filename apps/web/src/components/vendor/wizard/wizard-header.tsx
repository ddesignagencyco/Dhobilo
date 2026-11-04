'use client';

import { CheckCircle2Icon } from 'lucide-react';

interface Step {
  number: number;
  key: string;
}

const STEPS: Step[] = [
  { number: 1, key: 'business' },
  { number: 2, key: 'location' },
  { number: 3, key: 'documents' },
  { number: 4, key: 'review' },
];

export function WizardHeader({ currentStep }: { currentStep: number }) {

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 md:gap-4">
        {STEPS.map((step, idx) => (
          <div key={step.number} className="flex items-center gap-2 md:gap-4">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-semibold transition-colors ${
                currentStep > step.number
                  ? 'border-primary bg-primary text-primary-foreground'
                  : currentStep === step.number
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-muted text-muted-foreground'
              }`}
            >
              {currentStep > step.number ? <CheckCircle2Icon className="size-5" /> : step.number}
            </div>
            <span className="hidden text-sm font-medium md:inline">{`Step ${step.number}`}</span>
            {idx < STEPS.length - 1 && (
              <div className={`hidden h-1 w-8 flex-1 rounded-full md:block ${currentStep > step.number ? 'bg-primary' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
