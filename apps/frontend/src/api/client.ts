import type { ApiErrorBody } from '@dtr/shared';
let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(body.message);
  }
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    etag?: string;
    signal?: AbortSignal;
    previewToken?: string;
  } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    signal: options.signal,
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      'X-DTR-Client': 'web',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(options.etag ? { 'If-Match': options.etag } : {}),
      ...(options.previewToken ? { 'X-Preview-Token': options.previewToken } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) {
    const body = (await response.json()) as ApiErrorBody;
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('dtr:unauthorized'));
    throw new ApiError(response.status, body);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/yaml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
