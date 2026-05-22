/** i18n configuration. Spanish is the source language (string = key). */
export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALE_COOKIE = 'locale';

export function isLocale(v: string | undefined | null): v is Locale {
  return v === 'es' || v === 'en';
}
