import type { Dict } from './core';
import type { Locale } from './config';
import { en } from './messages';

/** Active override map for a locale. Spanish is the identity (empty) map. */
export function getDict(locale: Locale): Dict {
  return locale === 'en' ? en : {};
}
