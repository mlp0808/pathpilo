'use client'

import { usePathname } from 'next/navigation'
import FAQContent from './FAQContent'
import { getLocaleFromPathname } from '../lib/i18n'

/** `/faq` — locale from URL prefix when present (e.g. `/en/faq` rewrites here). */
export default function Page() {
  const pathname = usePathname()
  const locale = getLocaleFromPathname(pathname || '/')
  return <FAQContent locale={locale} />
}
