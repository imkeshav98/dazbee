'use client'

import { createContext, type ReactNode, useContext } from 'react'

import { CATALOGS, type Locale } from './index.ts'

const LocaleContext = createContext<Locale>('en')

export const useLocale = () => useContext(LocaleContext)
export const useMessages = () => CATALOGS[useLocale()]

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}
