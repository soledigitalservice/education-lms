'use client';

import { createContext, useContext, useMemo } from 'react';

import { makeT, type Dict, type TFunction } from './core';
import { DEFAULT_LOCALE, type Locale } from './config';

interface I18nValue {
  locale: Locale;
  t: TFunction;
}

const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, t: (k) => k });

/** Seeds the client tree with the active locale + override dictionary. */
export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nValue>(() => ({ locale, t: makeT(dict) }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Translator for client components: `const t = useT(); t('Inicio')`. */
export function useT(): TFunction {
  return useContext(I18nContext).t;
}

/** Current locale in client components. */
export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
