'use client';

import { SuitIcon } from '@/components/poker';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Brass spade + the app name in the index face. The name comes from `common.appName`. */
export function Wordmark({ className }: { className?: string }) {
  const t = useT();
  return (
    <span className={cn('inline-flex items-center gap-2 text-text', className)}>
      <SuitIcon suit="s" className="text-[20px] text-brass" />
      <span className="label-index text-label font-bold tracking-caps-wide">{t('common.appName')}</span>
    </span>
  );
}
