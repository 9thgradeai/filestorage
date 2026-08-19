import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Forward every /api/* request to the backend. Resolved at request time from
// the server runtime env, so it works in dev (localhost) and Docker (service
// name) without a rebuild.
export function proxy(request: NextRequest) {
  const backend = process.env.API_BACKEND_URL || 'http://localhost:5000';
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, backend);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: '/api/:path*',
};