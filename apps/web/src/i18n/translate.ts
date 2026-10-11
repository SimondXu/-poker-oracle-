/**
 * Pure i18n core: lookup, `{var}` interpolation, number formatting.
 * No React, no store, so node tests and non-React code can use it.
 */
import { catalog, type MessageKey } from './catalog.ts';
import { LOCALE_TAGS, type Locale, type MessageVars } from './types.ts';

const numberFormats = new Map<string, Intl.NumberFormat>();

/** Locale-aware number (1240 → "1,240"). Formatters are cached per locale + options. */
export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  const cacheKey = options ? `${locale}|${JSON.stringify(options)}` : locale;
  let format = numberFormats.get(cacheKey);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE_TAGS[locale], options);
    numberFormats.set(cacheKey, format);
  }
  return format.format(value);
}

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Replaces `{name}` with `vars.name`. Numbers go through `formatNumber`; pass a
 * string to keep a value as-is (e.g. `formatChips(12_500)` → "12.5k").
 * An unknown placeholder stays visible as `{name}` so a missing var is easy to spot.
 */
export function interpolate(template: string, vars: MessageVars | undefined, locale: Locale): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = vars[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value, locale) : value;
  });
}

type Table = Readonly<Record<string, string>>;

/** Message for `key` in `locale`; falls back to English, then to the key itself. */
export function translate(locale: Locale, key: MessageKey, vars?: MessageVars): string {
  const dot = key.indexOf('.');
  const bundle = (catalog as unknown as Record<string, Record<Locale, Table>>)[key.slice(0, dot)];
  const name = key.slice(dot + 1);
  const template = bundle?.[locale]?.[name] ?? bundle?.en?.[name] ?? key;
  return interpolate(template, vars, locale);
}

export type TFunction = (key: MessageKey, vars?: MessageVars) => string;
