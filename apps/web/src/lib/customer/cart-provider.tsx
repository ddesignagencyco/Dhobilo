'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Cart } from '@dhoblio/shared';
import { apiClient } from '@/lib/api/client';
import { cartReducer, loadCartDraft, saveCartDraft } from './cart-store';

interface CartContextValue {
  cart: Cart | null;
  hydrated: boolean;
  itemCount: number;
  addItem: (vendorId: string, itemId: string, quantity?: number) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

interface ServerCart {
  vendorId: string;
  items: { serviceItemId: string; qty: number }[];
}

/**
 * Local-first cart: the draft lives in IndexedDB so it survives a reload, and every change is mirrored
 * to the server cart (PUT /cart) so a reorder or another device picks up the same basket.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, dispatch] = useReducer(cartReducer, null);
  const [hydrated, setHydrated] = useState(false);
  const savedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      let local: Cart | null = null;
      try {
        local = await loadCartDraft();
      } catch {
        local = null;
      }
      if (cancelled) return;

      if (local && local.items.length > 0) {
        dispatch({ type: 'SET', payload: local });
      } else {
        try {
          const result = await apiClient.get<ServerCart[]>('/cart');
          const first = result.data?.[0];
          if (!cancelled && first && first.items.length > 0) {
            dispatch({
              type: 'SET',
              payload: {
                vendorId: first.vendorId,
                items: first.items.map((item) => ({ itemId: item.serviceItemId, quantity: item.qty })),
              },
            });
          }
        } catch {
          // Not signed in yet or offline: the local draft is still usable.
        }
      }

      if (!cancelled) setHydrated(true);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const previous = savedOnce.current;
    savedOnce.current = true;

    const timer = setTimeout(() => {
      void saveCartDraft(cart).catch(() => undefined);
      if (cart && cart.items.length > 0) {
        void apiClient
          .put('/cart', {
            vendorId: cart.vendorId,
            items: cart.items.map((item) => ({ serviceItemId: item.itemId, qty: item.quantity })),
          })
          .catch(() => undefined);
      } else if (previous) {
        void apiClient.delete('/cart').catch(() => undefined);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [cart, hydrated]);

  const addItem = useCallback((vendorId: string, itemId: string, quantity = 1) => {
    dispatch({ type: 'ADD_ITEM', payload: { vendorId, itemId, quantity } });
  }, []);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', payload: { itemId, quantity } });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    dispatch({ type: 'REMOVE_ITEM', payload: { itemId } });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      hydrated,
      itemCount: cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    }),
    [cart, hydrated, addItem, updateQuantity, removeItem, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside <CartProvider>');
  return value;
}
