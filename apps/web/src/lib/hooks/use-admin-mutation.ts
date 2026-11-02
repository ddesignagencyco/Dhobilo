'use client';

import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminErrorMessage, validationSummary } from '@dhoblio/shared';
import { type BffOptions, BffError, bff } from '@/lib/api/bff';

/**
 * A mutation against an admin endpoint, with the three things every admin action needs: a toast on
 * success, a usable message plus request ID on failure, and the affected lists refetched afterwards.
 *
 * Mutations are never retried (see the QueryClient defaults): approving a vendor or paying a payout is a
 * deliberate act, and silently repeating it behind the admin's back is exactly the wrong behaviour even
 * where the server would reject the duplicate.
 */
export function useAdminMutation<TResult, TInput = void>({
  request,
  successMessage,
  invalidate = [],
  onSuccess,
}: {
  request: (input: TInput) => { path: string; options?: BffOptions };
  successMessage: string | ((result: TResult, input: TInput) => string);
  /** Query keys to refetch. Pass the list keys the action changes, including the sidebar counts. */
  invalidate?: QueryKey[];
  onSuccess?: (result: TResult, input: TInput) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation<TResult, Error, TInput>({
    mutationFn: async (input) => {
      const { path, options } = request(input);
      const { data } = await bff<TResult>(path, { method: 'POST', ...options });
      return data;
    },
    onSuccess: (result, input) => {
      toast.success(typeof successMessage === 'function' ? successMessage(result, input) : successMessage);
      for (const key of invalidate) void queryClient.invalidateQueries({ queryKey: key });
      onSuccess?.(result, input);
    },
    onError: (error) => {
      if (error instanceof BffError) {
        // A field-level validation failure is more useful spelled out than as "Some fields need fixing".
        const detail = validationSummary(error.details);
        toast.error(detail || error.message, {
          description: error.requestId ? `Request ${error.requestId}` : undefined,
        });
        return;
      }
      toast.error(adminErrorMessage(undefined, error.message));
    },
  });
}
