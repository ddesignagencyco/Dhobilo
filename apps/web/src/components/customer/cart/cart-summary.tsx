'use client';

import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Cart } from '@dhoblio/shared';
import type { Estimate } from '@/lib/customer/hooks/use-estimate';

interface CartSummaryProps {
  cart: Cart | null;
  estimate: Estimate | null;
  isEstimating?: boolean;
  onCheckout?: () => void;
}

export function CartSummary({ cart, estimate, isEstimating, onCheckout }: CartSummaryProps) {
  if (!cart || cart.items.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 shadow-lg">
      <div className="mx-auto max-w-3xl flex items-center justify-between gap-4">
        <div className="flex-1 space-y-1">
          <p className="text-sm text-muted-foreground">{cart.items.length} item(s)</p>
          {estimate ? (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold">Rs {estimate.total}</span>
              {estimate.discount && <span className="text-xs text-green-600">You save Rs {estimate.discount}</span>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Calculating estimate...</p>
          )}
        </div>

        <Button onClick={onCheckout} disabled={!estimate || isEstimating || cart.items.length === 0}>
          {isEstimating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Proceed
        </Button>
      </div>
    </div>
  );
}
