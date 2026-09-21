import { useQuery } from '@tanstack/react-query';
import type { ConfigResponse } from '@dtr/shared';
import { api } from '../../api/client';
export function useConfiguration() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api<ConfigResponse>('/config'),
    staleTime: 10000,
  });
}
