'use client'

import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { I18nProvider } from 'react-aria-components'
import {
  DEFAULT_LOCALE,
  UI_LOCALE_STORAGE_KEY,
  type MessageKey,
  normalizeLocale,
  t as translate,
} from '../i18n'

interface AppI18nContextValue {
  locale: 'en' | 'da'
  setLocale: (next: 'en' | 'da') => void
  t: (key: MessageKey, fallback?: string) => string
}

const AppI18nContext = createContext<AppI18nContextValue | null>(null)

/** Read canonical UI locale: dedicated key first, then user language fields in localStorage. */
function readUiLocale(): 'en' | 'da' {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const stored = localStorage.getItem(UI_LOCALE_STORAGE_KEY)
    if (stored === 'en' || stored === 'da') return stored
    const userRaw = localStorage.getItem('user')
    if (userRaw) {
      const parsed = JSON.parse(userRaw) as Record<string, unknown>
      const code =
        (parsed?.languageCode as string | undefined) ||
        (parsed?.language_code as string | undefined) ||
        (parsed?.language as string | undefined)
      return normalizeLocale(code)
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE
}

export function ClientI18nProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [locale, setLocaleState] = useState<'en' | 'da'>(DEFAULT_LOCALE)

  const applyLocaleFromStorage = useCallback(() => {
    setLocaleState(readUiLocale())
  }, [])

  // Initial sync + whenever route changes (fixes stale React state after back/forward)
  useEffect(() => {
    applyLocaleFromStorage()
  }, [applyLocaleFromStorage, pathname])

  // bfcache: browser "back" can restore an old in-memory tree; re-read disk
  useEffect(() => {
    applyLocaleFromStorage()
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) applyLocaleFromStorage()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [applyLocaleFromStorage])

  // Other tabs: storage. Same tab after login/settings: focus re-reads `user` from disk.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === UI_LOCALE_STORAGE_KEY || e.key === 'user') applyLocaleFromStorage()
    }
    const onFocus = () => applyLocaleFromStorage()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
    }
  }, [applyLocaleFromStorage])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = locale === 'da' ? 'da' : 'en'
  }, [locale])

  const setLocale = useCallback((next: 'en' | 'da') => {
    setLocaleState(next)
    try {
      localStorage.setItem(UI_LOCALE_STORAGE_KEY, next)
      const raw = localStorage.getItem('user')
      if (raw) {
        const user = JSON.parse(raw)
        localStorage.setItem('user', JSON.stringify({ ...user, languageCode: next }))
      }
    } catch {
      // no-op
    }
  }, [])

  const value = useMemo<AppI18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, fallback) => translate(locale, key, fallback),
    }),
    [locale, setLocale]
  )

  const ariaLocale = locale === 'da' ? 'da-DK' : 'en-US'

  return (
    <AppI18nContext.Provider value={value}>
      <I18nProvider locale={ariaLocale}>{children}</I18nProvider>
    </AppI18nContext.Provider>
  )
}

export function useAppI18n() {
  const ctx = useContext(AppI18nContext)
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key: MessageKey, fallback?: string) => fallback || key,
    }
  }
  return ctx
}
