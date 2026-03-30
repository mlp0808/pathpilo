import { notFound } from 'next/navigation'
import { ReactNode } from 'react'
import { isMarketingLocale } from '../lib/i18n'

export default async function MarketingLocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  const resolved = await params
  if (!isMarketingLocale(resolved.lang)) {
    notFound()
  }
  return children
}
