import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { registrySchema, simpleRegistrySchema } from '@dtr/shared';
import type { Registry } from '@dtr/shared';
import { api } from '../../api/client';
export interface PreparedPreview {
  document: Registry;
  token: string;
  yaml: string;
}
export function usePreview(value: unknown, id: string | undefined, enabled: boolean) {
  const serialized = JSON.stringify(value);
  const [debounced, setDebounced] = useState(serialized);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(serialized), 350);
    return () => clearTimeout(timer);
  }, [serialized]);
  const query = useQuery({
    queryKey: ['preview', id, debounced],
    queryFn: () =>
      api<PreparedPreview>('/registries/preview', {
        method: 'POST',
        body: { document: JSON.parse(debounced) as unknown, id },
      }),
    enabled:
      enabled &&
      (registrySchema.safeParse(JSON.parse(debounced) as unknown).success ||
        simpleRegistrySchema.safeParse(JSON.parse(debounced) as unknown).success),
    staleTime: 60000,
    gcTime: 60000,
    retry: false,
  });
  return { ...query, current: serialized === debounced };
}
