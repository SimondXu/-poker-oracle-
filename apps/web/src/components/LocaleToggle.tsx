'use client';

import { useLocaleStore, useT, type Locale } from '@/i18n';
import { cn } from '@/lib/utils';

export interface LocaleToggleProps {
  className?: string | undefined;
}

const OPTIONS: readonly { locale: Locale; key: 'common.locale.en' | 'common.locale.zh'; lang: string }[] = [
  { locale: 'en', key: 'common.locale.en', lang: 'en' },
  { locale: 'zh', key: 'common.locale.zh', lang: 'zh-CN' },
];

/** EN | 中文 segmented control. Reads and writes the persisted locale store. */
export function LocaleToggle({ className }: LocaleToggleProps) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  return (
    <div
      role="group"
      aria-label={t('common.locale.label')}
      data-layout-box="locale-toggle"
      className={cn(
        'inline-flex h-7 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-line-2 bg-panel p-px',
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const isActive = option.locale === locale;
        return (
          <button
            key={option.locale}
            type="button"
            lang={option.lang}
            aria-pressed={isActive}
            onClick={() => setLocale(option.locale)}
            className={cn(
              'min-w-9 rounded-[3px] px-snug focus-visible:outline-offset-[-2px] text-body font-bold leading-none transition-colors duration-[var(--duration-fast)]',
              option.locale === 'en' && 'font-index tracking-[0.08em]',
              isActive ? 'bg-panel-2 text-text' : 'text-text-3 hover:text-text-2',
            )}
          >
            {t(option.key)}
          </button>
        );
      })}
    </div>
  );
}
