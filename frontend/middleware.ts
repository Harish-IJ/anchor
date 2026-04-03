import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Global API Middleware
 * Enforces X-API-KEY authentication on all API routes except public /api/auth callbacks.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Protect /api routes, but explicitly allow auth callbacks through
  if (path.startsWith('/api') && !path.startsWith('/api/auth')) {
    const apiKey = request.headers.get('x-api-key');
    const validKey = process.env.API_SECRET_KEY;
    
    // Safety check: Only enforce if the server is actually configured with a key
    if (validKey && apiKey !== validKey) {
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
