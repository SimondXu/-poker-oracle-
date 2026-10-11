/** i18n vocabulary (plain .ts so pure libs and node tests can import it). */

export type Locale = 'en' | 'zh';

export const LOCALES: readonly Locale[] = ['en', 'zh'];
export const DEFAULT_LOCALE: Locale = 'en';

/** `<html lang>` and Intl locale per app locale. */
export const LOCALE_TAGS: Readonly<Record<Locale, string>> = { en: 'en', zh: 'zh-CN' };

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'zh';
}

/**
 * Shape every non-English message table must satisfy: exactly the keys of
 * the English table, string values. Declare `const zh: Translation<typeof en>`
 * and TypeScript rejects missing and extra keys.
 */
export type Translation<T> = { readonly [K in keyof T]: string };

/** Values for `{name}` placeholders. Numbers are formatted for the locale (1,240). */
export type MessageVars = Readonly<Record<string, string | number>>;
