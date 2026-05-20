import { NextRequest } from 'next/server';
import { z, type ZodTypeAny } from 'zod';

import { ApiError } from './errors';

/**
 * Read and validate the JSON body of a request against a zod schema.
 * On failure, throws the ZodError — the route wrapper converts it to a 400.
 */
export async function readJson<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw ApiError.badRequest('Request body must be valid JSON');
  }
  return schema.parse(raw);
}

/**
 * Validate URL query parameters against a zod schema.
 *   const { page, q } = readQuery(req, querySchema);
 */
export function readQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  return schema.parse(obj);
}
