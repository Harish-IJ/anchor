import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Global API Middleware
 * Enforces X-API-KEY authentication on all API routes except public /api/auth callbacks.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const publicAuthPaths = new Set([
    "/api/auth/google/callback",
    "/api/auth/gmail/callback",
  ]);

  if (path.startsWith('/api')) {
    const apiKey = request.headers.get('x-api-key');
    const validKey = process.env.API_SECRET_KEY;
    
    // Fail closed if server has no key and not in dev
    if (!validKey && process.env.NODE_ENV !== "development") {
      return NextResponse.json(
        { success: false, error: 'API middleware is not configured.' },
        { status: 500 }
      );
    }

    if (!publicAuthPaths.has(path) && apiKey !== validKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Missing or invalid X-API-KEY header.' },
        { status: 401 }
      );
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
