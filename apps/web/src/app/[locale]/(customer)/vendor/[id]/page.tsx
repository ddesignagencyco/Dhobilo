import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Star, MapPin, Clock } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = { title: 'Vendor Details' };

interface VendorHours {
  closed: boolean;
  start?: string;
  end?: string;
}

interface CatalogItem {
  id: string;
  nameEn: string;
  nameUr?: string;
  price: string;
  turnaroundHours: number;
}

interface VendorData {
  name: string;
  rating?: number;
  ratingCount?: number;
  serviceRadiusKm?: number;
  openNow: boolean;
  hours?: Record<string, VendorHours>;
  catalog?: Record<string, CatalogItem[]>;
}

async function VendorDetail({ vendorId }: { vendorId: string }) {
  let vendor: VendorData | null = null;
  try {
    const result = await apiClient.get(`/vendors/${vendorId}`);
    vendor = result.data;
  } catch {
    notFound();
  }

  if (!vendor) {
    notFound();
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">{vendor.name}</h1>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {vendor.rating !== undefined && (
              <div className="flex items-center gap-1">
                <Star className="size-4 fill-yellow-400 text-yellow-400" />
                <span>{vendor.rating.toFixed(1)}</span>
                {vendor.ratingCount && <span className="text-sm text-muted-foreground">({vendor.ratingCount})</span>}
              </div>
            )}
            {vendor.serviceRadiusKm && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                <span>Delivers within {vendor.serviceRadiusKm} km</span>
              </div>
            )}
            {!vendor.openNow && <div className="px-2 py-1 bg-destructive/10 text-destructive text-xs rounded font-medium">Currently Closed</div>}
          </div>
        </div>

        {/* Hours */}
        {vendor.hours && (
          <div className="border-t pt-4">
            <h2 className="font-semibold mb-2 flex items-center gap-2">
              <Clock className="size-4" />
              Hours
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {Object.entries(vendor.hours || {}).map(([day, hours]) => (
                <div key={day} className="flex justify-between">
                  <span className="capitalize text-muted-foreground">{day}</span>
                  <span>{hours.closed ? 'Closed' : `${hours.start} – ${hours.end}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Catalog */}
        {vendor.catalog && (
          <div className="border-t pt-4">
            <h2 className="text-lg font-semibold mb-4">Services</h2>
            {Object.entries(vendor.catalog || {}).map(([category, items]) => (
              <div key={category} className="mb-6">
                <h3 className="font-medium mb-2 text-base capitalize">{category}</h3>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between items-start p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{item.nameEn}</p>
                        <p className="text-sm text-muted-foreground">{item.turnaroundHours}h turnaround</p>
                      </div>
                      <p className="font-semibold">Rs {item.price}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
}

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<Skeleton className="h-screen" />}>
      <VendorDetail vendorId={id} />
    </Suspense>
  );
}
