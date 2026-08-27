import type { Metadata, Viewport } from 'next';
import { Shell } from '@/components/Shell';
import './globals.css';

// Under a basePath the manifest and icons move with it, and next/metadata does
// not rewrite plain paths.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'FEM Crew Portal',
  description: 'Everything you need for your next Fast Elevate Media assignment.',
  manifest: `${BASE}/manifest.webmanifest`,
  icons: {
    icon: `${BASE}/icon-192.png`,
    apple: `${BASE}/apple-touch-icon.png`,
  },
  appleWebApp: {
    capable: true,
    title: 'Crew Portal',
    // The masthead is obsidian, so a dark status bar that blends into it beats
    // a black bar sitting on top of the design.
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#121111',
  // Installed to a home screen the portal runs edge to edge, so the safe areas
  // have to be reachable -- otherwise the bottom tab bar sits under the home
  // indicator on an iPhone.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
