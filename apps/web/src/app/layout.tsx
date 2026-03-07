import type { ReactNode } from 'react';
import { Manrope, Noto_Serif_SC, IBM_Plex_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import '../styles/globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-code',
  display: 'swap',
  weight: ['400', '500'],
});

const notoSerifSC = Noto_Serif_SC({
  subsets: ['latin'],
  variable: '--font-brand',
  display: 'swap',
  weight: ['500', '600', '700'],
});

export const metadata = {
  title: 'AiPoker — 专业德州训练室',
  description: '系统性提升你的德州扑克水平',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="zh-CN"
      className={`${manrope.variable} ${plexMono.variable} ${notoSerifSC.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased" suppressHydrationWarning>
        {children}
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-glass-border-strong)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)',
            },
          }}
        />
      </body>
    </html>
  );
}
