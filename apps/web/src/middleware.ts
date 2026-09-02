import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * True when a session holding exactly these `roles` (and this `isSuperAdmin` flag) may
 * only reach the PWA self-service portal (`/me/*`), not any desktop/internal app route.
 *
 * Mirrors the same predicate used by the `/` landing redirect in `app/page.tsx`, so a
 * signed-in Employee never sees a different outcome between the two entry points.
 */
export function isEmployeeOnlySession(roles: string[], isSuperAdmin: boolean): boolean {
  return !isSuperAdmin && !roles.some((role) => role !== 'Employee');
}

/**
 * The one URL prefix an Employee-only session may reach.
 *
 * `apps/web/src/app/(portal)/me/*` is the only route group whose folder name (`me`) is
 * NOT parenthesized, so it is the only desktop-app path that actually shows up in the
 * URL under `(portal)`. Every module page — helpdesk, attendance, leave, payroll,
 * employees, reports, settings, tax, performance, and the rest — lives directly under
 * the `(dashboard)` route GROUP, whose parens are stripped by Next.js and so resolve to
 * their own top-level path (`/helpdesk`, `/attendance`, ...), never under `/dashboard`.
 * Blocking only `/dashboard` therefore left every other module wide open. Allow-listing
 * `/me` instead of enumerating module paths means a page added to either group later is
 * covered automatically, with no middleware change required.
 */
const EMPLOYEE_ALLOWED_PREFIX = '/me';

export function isPortalPath(pathname: string): boolean {
  return pathname === EMPLOYEE_ALLOWED_PREFIX || pathname.startsWith(`${EMPLOYEE_ALLOWED_PREFIX}/`);
}

/** True when this request must be bounced to `/me` before it renders anything. */
export function shouldRedirectToPortal(pathname: string, roles: string[], isSuperAdmin: boolean): boolean {
  return isEmployeeOnlySession(roles, isSuperAdmin) && !isPortalPath(pathname);
}

// This is a redirect for direct/deep-link navigation — it is NOT the security boundary;
// every module's API calls are still gated server-side by @Roles/@Scopes/@SelfService on
// the NestJS controllers regardless of this redirect.
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;
    const roles = (token?.roles as string[] | undefined) ?? [];
    const isSuperAdmin = !!token?.isSuperAdmin;

    if (shouldRedirectToPortal(pathname, roles, isSuperAdmin)) {
      return NextResponse.redirect(new URL('/me', req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      // Preserves the existing behaviour: no valid session -> redirect to /login.
      authorized: ({ token }) => !!token,
    },
  },
);

export const config = {
  matcher: [
    // `qr-display` is excluded on purpose: the location QR screen has no user
    // session and authenticates with its own display token.
    '/((?!$|login|signup|forgot-password|reset-password|careers|qr-display|api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons).*)',
  ],
};
