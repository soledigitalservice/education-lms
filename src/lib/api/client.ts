'use client';

import type { ApiErrorBody } from './errors';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(Array.isArray(body.message) ? body.message.join(', ') : body.message);
    this.name = 'HttpError';
  }
}

interface ClientOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * Browser-side fetch wrapper used by client components.
 * - JSON-encodes the body
 * - Sends cookies (cookies are the source of truth for auth)
 * - Throws HttpError on non-2xx with the normalized API error body
 */
export async function apiFetch<T>(path: string, opts: ClientOptions = {}): Promise<T> {
  const { body, headers, ...rest } = opts;
  const finalHeaders = new Headers(headers ?? {});
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders.set('content-type', 'application/json');
  }

  const res = await fetch(path, {
    ...rest,
    headers: finalHeaders,
    credentials: 'include',
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    throw new HttpError(
      res.status,
      (data ?? {
        statusCode: res.status,
        error: res.statusText || 'Error',
        message: res.statusText || 'Request failed',
        requestId: '',
        timestamp: new Date().toISOString(),
        path,
      }) as ApiErrorBody,
    );
  }
  return data as T;
}
