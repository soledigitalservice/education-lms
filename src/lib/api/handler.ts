import type { NextRequest, NextResponse } from 'next/server';

import { toErrorResponse } from './errors';

type HandlerCtx<P = Record<string, string>> = { params: P };
type RouteHandler<P> = (req: NextRequest, ctx: HandlerCtx<P>) => Promise<NextResponse | Response>;

/**
 * Wrap a route handler so any thrown error is mapped to a normalised JSON
 * response via `toErrorResponse`. Keeps handler bodies focused on the
 * happy path — throw early, the wrapper takes care of the rest.
 */
export function route<P = Record<string, string>>(handler: RouteHandler<P>): RouteHandler<P> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return toErrorResponse(err, new URL(req.url).pathname);
    }
  };
}
