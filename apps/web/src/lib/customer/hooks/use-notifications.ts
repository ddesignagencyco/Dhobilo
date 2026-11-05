'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { NotificationPrefs } from '../types';

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ['me', 'notification-prefs'],
    queryFn: async () => {
      const result = await apiClient.get<NotificationPrefs>('/me/notification-preferences');
      return result.data;
    },
    staleTime: 1000 * 30,
  });
}

export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: NotificationPrefs) => {
      const result = await apiClient.patch<NotificationPrefs>('/me/notification-preferences', prefs);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'notification-prefs'] });
    },
  });
}
