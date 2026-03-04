import type { ReactNode } from 'react';
import { Inter, Fira_Code } from 'next/font/google';
import { Toaster } from 'sonner';
import '../styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const firaCode = Fira_Code({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
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
    <html lang="zh-CN" className={`${inter.variable} ${firaCode.variable}`}>
      <body>
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
