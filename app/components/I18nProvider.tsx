'use client'

import { I18nProvider } from 'react-aria-components'

export function ClientI18nProvider({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="en-US">{children}</I18nProvider>
}
