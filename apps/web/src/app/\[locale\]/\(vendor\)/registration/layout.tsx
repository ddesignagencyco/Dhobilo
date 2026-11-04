import { WizardHeader } from '@/components/vendor/wizard/wizard-header';

export default async function RegistrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Parse step from URL if available (placeholder; client will handle step routing)
  const currentStep = 1; // Default to step 1

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold">Register Your Shop</h1>
        <p className="text-muted-foreground">Complete 4 steps to start selling on Dhoblio</p>
      </div>
      <WizardHeader currentStep={currentStep} />
      <div className="rounded-lg border bg-card p-6">{children}</div>
    </div>
  );
}
