/** @type {import('next').NextConfig} */

// GitHub Pages serves a project repo from /<repo>/, so the build needs a basePath.
// The Pages workflow sets NEXT_BASE_PATH; local dev leaves it empty.
const basePath = process.env.NEXT_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,

  // Every route is statically prerenderable, so the site can ship as plain files.
  output: process.env.NEXT_STATIC_EXPORT === '1' ? 'export' : undefined,
  basePath: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,

  // A production build writes to the same directory the dev server is serving
  // from, which leaves that server broken. Set NEXT_BUILD_DIR to build somewhere
  // else while `npm run dev` keeps running:
  //   NEXT_BUILD_DIR=.next-build npm run build
  distDir: process.env.NEXT_BUILD_DIR || '.next',

  // Served by Vercel; a static export has no server to send these, which is
  // one more reason the real host is Vercel. The policy names every origin
  // the portal talks to and nothing else: Supabase for data, files and
  // functions; Google for the typeface. Scripts and styles allow inline
  // because Next's runtime and the style attributes it writes need it; a
  // nonce would need a server render, which the portal does not do.
  async headers() {
    const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co').replace(/\/+$/, '');
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      `img-src 'self' data: blob: ${supabase}`,
      `connect-src 'self' ${supabase} wss://${supabase.replace(/^https?:\/\//, '')}`,
      "worker-src 'self' blob:",
      'upgrade-insecure-requests',
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
