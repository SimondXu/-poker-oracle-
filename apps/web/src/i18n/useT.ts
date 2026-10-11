import { useCallback } from 'react';
import { useLocaleStore } from './locale-store.ts';
import { formatNumber, translate, type TFunction } from './translate.ts';
import type { Locale } from './types.ts';

/** Current UI locale ('en' | 'zh'). */
export function useLocale(): Locale {
  return useLocaleStore((state) => state.locale);
}

/**
 * `const t = useT(); t('table.pot.label')`, `t('actionbar.action.call', { amount: 120 })`.
 * Keys are type-checked; the function identity changes only when the locale does.
 */
export function useT(): TFunction {
  const locale = useLocale();
  return useCallback<TFunction>((key, vars) => translate(locale, key, vars), [locale]);
}

/** Locale-aware number formatter bound to the current locale. */
export function useFormatNumber(): (value: number, options?: Intl.NumberFormatOptions) => string {
  const locale = useLocale();
  return useCallback((value, options) => formatNumber(value, locale, options), [locale]);
}
