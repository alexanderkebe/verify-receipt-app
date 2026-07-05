// ============================================
// Route Protection Middleware (edge runtime)
// Uses the edge-safe authConfig only.
// ============================================

import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

// Routes accessible without a session
const PUBLIC_PREFIXES = ['/login', '/register', '/forgot-password', '/verify-email', '/api/business/register'];
const PUBLIC_EXACT = ['/'];

// Authenticated areas
const ADMIN_PREFIX = '/admin';
const OWNER_MANAGER_PREFIXES = ['/employees', '/accounts', '/alerts', '/reports', '/settings'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = session?.user?.role;

  // Always allow Next internals & the auth API
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const loggedIn = Boolean(session?.user);

  // Public routes: if already logged in, bounce auth pages to the dashboard
  if (isPublic(pathname)) {
    if (loggedIn && (pathname === '/login' || pathname === '/register')) {
      return NextResponse.redirect(new URL(role === 'PLATFORM_ADMIN' ? '/admin' : '/dashboard', req.nextUrl));
    }
    return NextResponse.next();
  }

  // From here on, a session is required
  if (!loggedIn) {
    const url = new URL('/login', req.nextUrl);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  // Admin area requires PLATFORM_ADMIN
  if (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)) {
    if (role !== 'PLATFORM_ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
    }
    return NextResponse.next();
  }

  // Owner/Manager-only areas
  if (OWNER_MANAGER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (role !== 'OWNER' && role !== 'MANAGER') {
      return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  // Run on everything except static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json)$).*)'],
};
