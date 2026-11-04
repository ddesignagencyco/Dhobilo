'use client';

import { useCallback } from 'react';
import type { VendorRegistration } from '@dhoblio/shared';

const DB_NAME = 'dhoblio_vendor';
const STORE_NAME = 'registration_draft';
const DRAFT_KEY = 'current_draft';

/**
 * IndexedDB hook for vendor registration draft persistence.
 * Survives app crashes; resumes on refresh.
 */
export function useRegistrationDraft() {
  const getDb = useCallback(async (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }, []);

  const saveDraft = useCallback(
    async (step: number, data: Partial<VendorRegistration>) => {
      const db = await getDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ step, data, savedAt: Date.now() }, DRAFT_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    [getDb],
  );

  const loadDraft = useCallback(async (): Promise<{ step: number; data: Partial<VendorRegistration> } | null> => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(DRAFT_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }, [getDb]);

  const clearDraft = useCallback(async () => {
    const db = await getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(DRAFT_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }, [getDb]);

  return { saveDraft, loadDraft, clearDraft };
}
