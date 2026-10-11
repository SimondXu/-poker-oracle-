import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { Barlow_Condensed, Manrope } from 'next/font/google';
import { Toaster } from 'sonner';
import { LocaleSync } from '@/i18n/LocaleSync';
import '../styles/globals.css';

/** Quiet UI face for prose. */
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});

/** Index face for every number and label (utility: `font-index`, `label-index`). */
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  variable: '--font-barlow',
  display: 'swap',
  weight: ['500', '600', '700'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#141c2e',
};

export const metadata = {
  title: "Holdem Lab — No-Limit Hold'em training table",
  description: "Practice No-Limit Hold'em against AI opponents, with a coach at every decision.",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${manrope.variable} ${barlowCondensed.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <LocaleSync />
        {children}
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: 'var(--color-panel-2)',
              border: '1px solid var(--color-line-2)',
              color: 'var(--color-text)',
              fontFamily: 'var(--font-sans)',
            },
          }}
        />
      </body>
    </html>
  );
}
