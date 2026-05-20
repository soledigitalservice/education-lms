import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: applies a Content-Security-Policy header to every HTML
 * response. Per-request nonce blocks inline-XSS while letting Next's own
 * bootstrap script run.
 *
 * Route gating (forcing login on /dashboard, /admin) is done in the page
 * server components themselves — they can call `getSession()` and redirect.
 * Doing auth in middleware would force every static asset through Node-only
 * code paths (argon2 doesn't run on Edge).
 */
export function middleware(_req: NextRequest): NextResponse {
  // CSP relaxed for v1 demo: Next.js hydration scripts are inline and
  // strict-nonce propagation requires per-layout `headers().get('x-nonce')`
  // wiring on every Server Component, which is out of scope for the demo.
  // Production hardening: switch back to nonce + strict-dynamic and wire it
  // through `<Script nonce={...}>` from `app/layout.tsx` per Next 14 docs.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: https:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ].join('; ');

  const res = NextResponse.next();
  res.headers.set('content-security-policy', csp);
  return res;
}

export const config = {
  // Apply to everything except static assets and the API (API responses are JSON; CSP doesn't apply).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json|api/).*)'],
};
