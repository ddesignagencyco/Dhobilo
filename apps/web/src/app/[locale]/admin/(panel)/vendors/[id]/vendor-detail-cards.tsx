'use client';

import { useState } from 'react';
import { Eye, FileText, Loader2, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/admin/status-badge';
import type { AdminVendorDetail } from '@/lib/api/types';
import { formatDateTime, humanise } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * The CNIC reveal.
 *
 * The list and detail endpoints only ever return a masked CNIC; the full number needs a separate call to
 * GET /admin/vendors/:id/cnic, which the API writes to the audit log against the calling admin. So this is
 * a deliberate, one-at-a-time action with the consequence stated up front, not a field that happens to be
 * on screen.
 */
function CnicReveal({ vendorId, masked }: { vendorId: string; masked: string | null }) {
  const t = useTranslations('vendors');
  const [revealed, setRevealed] = useState<string | null>(null);

  const reveal = useAdminMutation<{ cnic: string }, void>({
    request: () => ({ path: `/admin/vendors/${vendorId}/cnic`, options: { method: 'GET' } }),
    successMessage: t('cnicRevealed'),
    onSuccess: (data) => setRevealed(data?.cnic ?? null),
  });

  if (!masked && !revealed) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm" dir="ltr">
        {revealed ?? masked}
      </span>
      {!revealed ? (
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => reveal.mutate()}
          disabled={reveal.isPending}
          title={t('cnicHint')}
          aria-label={t('cnicReveal')}
        >
          {reveal.isPending ? <Loader2 className="animate-spin" /> : <Eye />}
        </Button>
      ) : null}
    </div>
  );
}

export function VendorDetailCards({ vendor, cityName }: { vendor: AdminVendorDetail; cityName: string }) {
  const t = useTranslations();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {vendor.status === 'REJECTED' && vendor.rejectionReason ? (
        <Alert variant="destructive" className="lg:col-span-2">
          <ShieldAlert />
          <AlertDescription>
            <span className="text-muted-foreground">{t('vendors.rejectionReason')}: </span>
            {vendor.rejectionReason}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('vendors.profile')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <Field label={t('vendors.business')}>{vendor.businessName}</Field>
            <Field label={t('common.city')}>{cityName}</Field>
            <Field label={t('vendors.availability')}>
              <StatusBadge status={vendor.availability} />
            </Field>
            <Field label={t('vendors.rating')}>
              {vendor.ratingCount > 0 ? (
                <span className="tabular">
                  {Number(vendor.ratingAvg).toFixed(1)} ({vendor.ratingCount})
                </span>
              ) : (
                <span className="text-muted-foreground">{t('vendors.noRating')}</span>
              )}
            </Field>
            <Field label={t('common.createdAt')}>{formatDateTime(vendor.createdAt)}</Field>
            <Field label={t('vendors.location')}>
              {vendor.lat !== null && vendor.lng !== null ? (
                <a
                  className="text-primary hover:underline"
                  href={`https://www.google.com/maps/search/?api=1&query=${vendor.lat},${vendor.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                >
                  {vendor.lat.toFixed(4)}, {vendor.lng.toFixed(4)}
                </a>
              ) : (
                '—'
              )}
            </Field>
            {vendor.description ? (
              <div className="col-span-2">
                <Field label={t('common.details')}>{vendor.description}</Field>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('vendors.contact')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <Field label={t('common.name')}>{vendor.owner?.name ?? '—'}</Field>
            <Field label={t('common.phone')}>
              <a className="font-mono text-primary hover:underline" href={`tel:${vendor.owner?.phone}`} dir="ltr">
                {vendor.owner?.phone ?? '—'}
              </a>
            </Field>
            <Field label={t('common.email')}>
              <span className="break-all" dir="ltr">
                {vendor.owner?.email ?? '—'}
              </span>
            </Field>
            <Field label={t('vendors.cnic')}>
              <CnicReveal vendorId={vendor.id} masked={vendor.cnicMasked} />
            </Field>
          </dl>
          <p className="text-muted-foreground mt-4 text-xs">{t('vendors.cnicHint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('vendors.operations')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4">
            <Field label={t('vendors.serviceRadius')}>
              <span className="tabular">{t('vendors.km', { count: Number(vendor.serviceRadiusKm) })}</span>
            </Field>
            <Field label={t('vendors.respondWithin')}>
              <span className="tabular">{t('vendors.minutes', { count: vendor.respondWithinMin })}</span>
            </Field>
            <Field label={t('vendors.slotCapacity')}>
              <span className="tabular">{t('vendors.orders', { count: vendor.slotCapacity })}</span>
            </Field>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('vendors.documentsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {vendor.documents.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('vendors.noDocuments')}</p>
          ) : (
            <ul className="divide-y">
              {vendor.documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <FileText className="text-muted-foreground size-4 shrink-0" />
                  <span className="flex-1 truncate text-sm">{humanise(doc.type)}</span>
                  <Badge variant={doc.verifiedAt ? 'success' : 'muted'}>
                    {doc.verifiedAt ? t('vendors.verified') : t('vendors.unverified')}
                  </Badge>
                  {doc.signedUrl ? (
                    <Button variant="outline" size="sm" asChild>
                      {/* noreferrer matters: the signed Cloudinary link must not leak in a Referer header. */}
                      <a href={doc.signedUrl} target="_blank" rel="noreferrer noopener">
                        {t('vendors.viewDocument')}
                      </a>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground mt-4 text-xs">{t('vendors.documentsHint')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
