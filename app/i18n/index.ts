import en from './messages/en.json'
import da from './messages/da.json'

export const messages = { en, da } as const
export type SupportedLocale = keyof typeof messages
export type MessageKey = keyof typeof en

export const DEFAULT_LOCALE: SupportedLocale = 'en'

/**
 * Client-only: persisted UI locale (survives `localStorage.user` overwrites that omit `languageCode`).
 */
export const UI_LOCALE_STORAGE_KEY = 'vevago_ui_locale'

/** Call on logout so the next account doesn’t inherit the previous UI language. */
export function clearClientLocaleStorage(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(UI_LOCALE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function normalizeLocale(value?: string | null): SupportedLocale {
  const locale = String(value || '').toLowerCase()
  if (locale.startsWith('da')) return 'da'
  return 'en'
}

export function t(locale: string | null | undefined, key: MessageKey, fallback?: string): string {
  const normalized = normalizeLocale(locale)
  return messages[normalized][key] || messages.en[key] || fallback || key
}

