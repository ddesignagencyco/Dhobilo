'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const registrationSchema = z.object({
  cnic: z.string().min(13).max(15),
  bankAccount: z.string().optional(),
  accountHolder: z.string().optional(),
});

type RegistrationForm = z.infer<typeof registrationSchema>;

export function RiderRegistrationView() {
  const t = useTranslations('rider.register');
  const [step, setStep] = useState<'info' | 'cnic' | 'bank' | 'review'>('info');
  const [cnicPhoto, setCnicPhoto] = useState<File | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
  });

  const onSubmit = async (_data: RegistrationForm) => {
    if (!cnicPhoto || !profilePhoto) {
      toast.error(t('photosRequired'));
      return;
    }
    toast.success(t('registrationSubmitted'));
    setStep('review');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['info', 'cnic', 'bank', 'review'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`size-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </div>
              {i < 3 && <div className="flex-1 h-1 bg-muted" />}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {step === 'info' && (
          <Card className="p-6 space-y-4">
            <h3 className="font-semibold">{t('basicInfo')}</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium">{t('cnic')}</span>
                <Input
                  {...form.register('cnic')}
                  placeholder="12345-1234567-1"
                  className="mt-1"
                />
              </label>
              <Button
                type="button"
                onClick={() => setStep('cnic')}
                className="w-full"
              >
                {t('next')}
              </Button>
            </div>
          </Card>
        )}

        {step === 'cnic' && (
          <Card className="p-6 space-y-4">
            <h3 className="font-semibold">{t('documentVerification')}</h3>
            <div className="space-y-3">
              <label className="block cursor-pointer">
                <span className="text-sm font-medium">{t('cnicPhoto')}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCnicPhoto(e.target.files?.[0] || null)}
                  className="mt-2 block w-full text-sm"
                />
                {cnicPhoto && <p className="text-sm text-green-600 mt-1">✓ {cnicPhoto.name}</p>}
              </label>
              <label className="block cursor-pointer">
                <span className="text-sm font-medium">{t('profilePhoto')}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProfilePhoto(e.target.files?.[0] || null)}
                  className="mt-2 block w-full text-sm"
                />
                {profilePhoto && <p className="text-sm text-green-600 mt-1">✓ {profilePhoto.name}</p>}
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('info')}
                  className="flex-1"
                >
                  {t('back')}
                </Button>
                <Button
                  type="button"
                  onClick={() => setStep('bank')}
                  className="flex-1"
                >
                  {t('next')}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {step === 'bank' && (
          <Card className="p-6 space-y-4">
            <h3 className="font-semibold">{t('bankDetails')}</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium">{t('iban')}</span>
                <Input
                  {...form.register('bankAccount')}
                  placeholder="PK94 ABCD 0123 4567 8900"
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">{t('accountHolder')}</span>
                <Input
                  {...form.register('accountHolder')}
                  placeholder={t('nameHint')}
                  className="mt-1"
                />
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('cnic')}
                  className="flex-1"
                >
                  {t('back')}
                </Button>
                <Button
                  type="button"
                  onClick={() => setStep('review')}
                  className="flex-1"
                >
                  {t('review')}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {step === 'review' && (
          <Card className="p-6 space-y-4">
            <h3 className="font-semibold">{t('reviewInfo')}</h3>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">{t('cnic')}:</span> {form.watch('cnic')}
              </p>
              <p className="text-green-600">✓ {t('documentsUploaded')}</p>
              {form.watch('bankAccount') && (
                <p>
                  <span className="font-medium">{t('bankAccount')}:</span> {form.watch('bankAccount')}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" size="lg">
              {t('completeRegistration')}
            </Button>
          </Card>
        )}
      </form>
    </div>
  );
}
