import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import { showErrorToast } from './errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      showErrorToast(error, 'Failed to load data')
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      showErrorToast(error, 'Operation failed')
    },
  }),
})
