'use client';

import { useEffect } from 'react';
import { useLocaleStore } from './locale-store';
import { LOCALE_TAGS } from './types';

/**
 * Mount once in the root layout. Restores the saved locale after hydration and
 * keeps `<html lang>` in step with it. Renders nothing.
 */
export function LocaleSync() {
  const locale = useLocaleStore((state) => state.locale);

  useEffect(() => {
    void useLocaleStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    document.documentElement.lang = LOCALE_TAGS[locale];
  }, [locale]);

  return null;
}
