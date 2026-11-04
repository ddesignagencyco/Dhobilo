import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ReceiptText } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Orders' };

export default async function CustomerOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('customer.orders.title')}</h1>

      <Card>
        <CardHeader>
          <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-xl">
            <ReceiptText className="size-5" aria-hidden />
          </div>
          <CardTitle className="text-base">{t('customer.orders.empty')}</CardTitle>
          <CardDescription>{t('customer.orders.emptyHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/">{t('customer.orders.browse')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
