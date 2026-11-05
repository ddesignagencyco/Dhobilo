'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type PaymentMethod = 'COD' | 'CARD' | 'JAZZCASH' | 'EASYPAISA' | 'RAAST';

export interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
  total: number;
}

export function PaymentMethodSelector({ selectedMethod, onSelect, total }: PaymentMethodSelectorProps) {
  const t = useTranslations('customer.checkout');

  const methods: { id: PaymentMethod; label: string; fee: number; status: 'available' | 'coming' }[] = [
    { id: 'COD', label: t('cod'), fee: 0, status: 'available' },
    { id: 'CARD', label: t('card'), fee: 35, status: 'coming' },
    { id: 'JAZZCASH', label: t('jazzcash'), fee: 0, status: 'available' },
    { id: 'EASYPAISA', label: t('easypaisa'), fee: 0, status: 'coming' },
    { id: 'RAAST', label: t('raast'), fee: 0, status: 'coming' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t('paymentMethod')}</h3>

      <div className="grid grid-cols-1 gap-3">
        {methods.map((method) => (
          <Card
            key={method.id}
            className={`p-4 cursor-pointer transition-all ${
              selectedMethod === method.id
                ? 'ring-2 ring-primary border-primary'
                : 'hover:border-primary/50'
            } ${method.status === 'coming' ? 'opacity-60' : ''}`}
            onClick={() => method.status === 'available' && onSelect(method.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`size-5 rounded-full border-2 flex items-center justify-center ${
                    selectedMethod === method.id ? 'border-primary bg-primary' : 'border-gray-300'
                  }`}
                >
                  {selectedMethod === method.id && <div className="size-2 bg-white rounded-full" />}
                </div>
                <div>
                  <p className="font-medium">{method.label}</p>
                  {method.fee > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t('fee')}: Rs. {method.fee}
                    </p>
                  )}
                </div>
              </div>
              {method.status === 'coming' && <Badge variant="outline">{t('comingSoon')}</Badge>}
            </div>
          </Card>
        ))}
      </div>

      {selectedMethod === 'COD' && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-900">{t('codInfo')}</p>
        </Card>
      )}

      {selectedMethod === 'JAZZCASH' && (
        <Card className="p-4 bg-purple-50 border-purple-200">
          <p className="text-sm text-purple-900">{t('jazzcashInfo')}</p>
        </Card>
      )}

      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between">
          <span className="text-sm">{t('total')}:</span>
          <span className="text-2xl font-bold">
            Rs. {(total + (methods.find((m) => m.id === selectedMethod)?.fee || 0)).toFixed(2)}
          </span>
        </div>
      </Card>

      <Button className="w-full" size="lg">
        {selectedMethod === 'COD' ? t('continueWithCod') : t('proceedToPayment')}
      </Button>
    </div>
  );
}
