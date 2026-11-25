import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from './apiClient';

function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.isClientError) {
    return false; // Never retry 400/404/422 validation or state-machine errors
  }
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Suppress duplicate toasts on silent background polls if cached data already exists
      if (query.state.data !== undefined) return;
      const message =
        error instanceof Error ? error.message : 'Failed to fetch data from server.';
      toast.error(message, { id: `query-error-${String(query.queryHash)}` });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Skip global toast if the mutation explicitly handles its own toast
      if (mutation.meta?.skipGlobalErrorToast) return;
      const message =
        error instanceof Error ? error.message : 'Action could not be completed.';
      toast.error(message);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 15_000, // Data stays fresh for 15s before background revalidation
      gcTime: 5 * 60_000, // Retain unused cache entries for 5 minutes
      retry: shouldRetryRequest,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.isClientError) return false;
        return failureCount < 1;
      },
    },
  },
});