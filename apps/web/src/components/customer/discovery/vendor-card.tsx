'use client';

import { Link } from '@/i18n/navigation';
import { Star, MapPin } from 'lucide-react';

interface VendorCardProps {
  id: string;
  name: string;
  rating?: number;
  ratingCount?: number;
  distance?: number;
  minPrice?: string;
  openNow: boolean;
}

export function VendorCard({ id, name, rating, ratingCount, distance, minPrice, openNow }: VendorCardProps) {
  return (
    <Link href={`/vendor/${id}`}>
      <div className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-all hover:shadow-md">
        {/* Badge */}
        {!openNow && <div className="absolute top-2 right-2 bg-destructive/90 text-destructive-foreground px-2 py-1 rounded text-xs font-medium">Closed</div>}

        {/* Header */}
        <h3 className="font-semibold text-base line-clamp-1">{name}</h3>

        {/* Rating */}
        {rating !== undefined && (
          <div className="flex items-center gap-1 mt-2">
            <Star className="size-4 fill-yellow-400 text-yellow-400" />
            <span className="text-sm font-medium">{rating.toFixed(1)}</span>
            {ratingCount !== undefined && <span className="text-xs text-muted-foreground">({ratingCount})</span>}
          </div>
        )}

        {/* Details */}
        <div className="flex flex-col gap-1 mt-3 text-sm text-muted-foreground">
          {distance !== undefined && (
            <div className="flex items-center gap-1">
              <MapPin className="size-4" />
              <span>{distance.toFixed(1)} km away</span>
            </div>
          )}
          {minPrice !== undefined && <div className="flex items-center gap-1">Starting from Rs {minPrice}</div>}
        </div>
      </div>
    </Link>
  );
}
