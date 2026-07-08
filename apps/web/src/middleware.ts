export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/((?!$|login|signup|careers|api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons).*)',
  ],
};
