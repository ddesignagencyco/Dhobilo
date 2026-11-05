import type { Cart } from '@dhoblio/shared';

export interface CartContextValue {
  cart: Cart | null;
  addItem: (vendorId: string, itemId: string, quantity: number) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
}

interface CartAction {
  type: 'ADD_ITEM' | 'UPDATE_QUANTITY' | 'REMOVE_ITEM' | 'CLEAR' | 'SET';
  payload?: Record<string, unknown>;
}

/**
 * Reducer for cart state (immutable updates).
 */
export function cartReducer(state: Cart | null, action: CartAction): Cart | null {
  switch (action.type) {
    case 'ADD_ITEM': {
      const payload = action.payload as { vendorId: string; itemId: string; quantity: number };
      const { vendorId, itemId, quantity } = payload;
      // Different vendor: replace cart
      if (state && state.vendorId !== vendorId) {
        return { vendorId, items: [{ itemId, quantity }] };
      }
      const existingItems = state?.items ?? [];
      const existingItem = existingItems.find((i) => i.itemId === itemId);
      if (existingItem) {
        return {
          vendorId,
          items: existingItems.map((i) => (i.itemId === itemId ? { ...i, quantity: i.quantity + quantity } : i)),
        };
      }
      return { vendorId, items: [...existingItems, { itemId, quantity }] };
    }
    case 'UPDATE_QUANTITY': {
      if (!state) return state;
      const payload = action.payload as { itemId: string; quantity: number };
      const { itemId, quantity } = payload;
      if (quantity <= 0) {
        return { ...state, items: state.items.filter((i) => i.itemId !== itemId) };
      }
      return { ...state, items: state.items.map((i) => (i.itemId === itemId ? { ...i, quantity } : i)) };
    }
    case 'REMOVE_ITEM': {
      if (!state) return state;
      const payload = action.payload as { itemId: string };
      return { ...state, items: state.items.filter((i) => i.itemId !== payload.itemId) };
    }
    case 'CLEAR':
      return null;
    case 'SET':
      return (action.payload as Cart | null) || null;
    default:
      return state;
  }
}

/**
 * IndexedDB persistence for cart draft (survives app restart)
 */
const DB_NAME = 'dhoblio';
const STORE_NAME = 'cart_draft';

export async function saveCartDraft(cart: Cart | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(cart, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function loadCartDraft(): Promise<Cart | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get('current');
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => resolve(getRequest.result || null);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}
