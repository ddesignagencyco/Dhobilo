'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function CodCollectionScreen() {
  const t = useTranslations('rider.cod');
  const [balance, setBalance] = useState(8750);
  const [depositAmount, setDepositAmount] = useState('');
  const [showDepositForm, setShowDepositForm] = useState(false);

  const codHistory = [
    { id: 'ORD001', amount: 2500, collectedAt: '2 hours ago', status: 'COLLECTED' },
    { id: 'ORD002', amount: 1850, collectedAt: '4 hours ago', status: 'COLLECTED' },
    { id: 'ORD003', amount: 3400, collectedAt: 'Today, 9:30 AM', status: 'COLLECTED' },
  ];

  const handleDeposit = () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      toast.error(t('invalidAmount'));
      return;
    }
    toast.success(t('depositSubmitted'));
    setBalance((prev) => prev - amount);
    setDepositAmount('');
    setShowDepositForm(false);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-200">
        <p className="text-sm text-muted-foreground font-medium">{t('cashBalance')}</p>
        <p className="text-4xl font-bold mt-3">Rs. {balance.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-2">
          {t('hint')}: {balance > 0 ? t('readyToDeposit') : t('noCash')}
        </p>
      </Card>

      {!showDepositForm ? (
        <Button
          onClick={() => setShowDepositForm(true)}
          className="w-full"
          size="lg"
          disabled={balance === 0}
        >
          {t('depositCash')}
        </Button>
      ) : (
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('amount')}</label>
              <div className="relative mt-2">
                <span className="absolute left-3 top-2.5 text-muted-foreground">Rs.</span>
                <Input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-10"
                  max={balance}
                  step="50"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('available')}: Rs. {balance.toLocaleString()}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDepositForm(false)}
                className="flex-1"
              >
                {t('cancel')}
              </Button>
              <Button onClick={handleDeposit} className="flex-1">
                {t('confirmDeposit')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div>
        <h3 className="font-semibold mb-4">{t('collectionHistory')}</h3>
        <div className="space-y-3">
          {codHistory.map((entry) => (
            <Card key={entry.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{entry.id}</p>
                  <p className="text-sm text-muted-foreground">{entry.collectedAt}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">Rs. {entry.amount.toLocaleString()}</p>
                  <Badge className="mt-1">{t('collected')}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/50 p-4 rounded-lg">
        <p className="font-medium mb-2">{t('notice')}</p>
        <p>{t('noticeText')}</p>
      </div>
    </div>
  );
}
