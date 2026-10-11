import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { DEFAULT_LOCALE, isLocale, type Locale } from './types.ts';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

/** localStorage that never throws (private mode, blocked storage, SSR). */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Storage unavailable: the choice lasts for this page only.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

/**
 * UI locale, default English, persisted to localStorage (`aipoker-locale`).
 * `skipHydration`: the server and the first client render both use 'en';
 * `<LocaleSync />` rehydrates after mount so hydration never mismatches.
 */
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => set({ locale }),
      toggleLocale: () => set((state) => ({ locale: state.locale === 'en' ? 'zh' : 'en' })),
    }),
    {
      name: 'aipoker-locale',
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      partialize: (state) => ({ locale: state.locale }),
      merge: (persisted, current) => {
        const locale = (persisted as { locale?: unknown } | undefined)?.locale;
        return isLocale(locale) ? { ...current, locale } : current;
      },
    },
  ),
);
