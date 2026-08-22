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
};

module.exports = nextConfig;
