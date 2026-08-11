export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    // `qr-display` is excluded on purpose: the location QR screen has no user
    // session and authenticates with its own display token.
    '/((?!$|login|signup|forgot-password|reset-password|careers|qr-display|api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons).*)',
  ],
};
