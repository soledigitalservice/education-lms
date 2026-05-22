import { cookies } from 'next/headers';

import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE, type Locale } from './config';
import { makeT, type TFunction } from './core';
import { getDict } from './dict';

/** Current locale from the cookie (server components / route handlers). */
export function getLocale(): Locale {
  const v = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Translator for server components: `const t = getT(); t('Inicio')`. */
export function getT(): TFunction {
  return makeT(getDict(getLocale()));
}
