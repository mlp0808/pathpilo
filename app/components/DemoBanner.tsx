'use client'

import { BeakerIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from './I18nProvider'
import { leaveDemoForSignup } from '../utils/demoSession'

interface DemoBannerProps {
  expiresAt?: string | null
  className?: string
}

export default function DemoBanner({ expiresAt, className = '' }: DemoBannerProps) {
  const { t } = useAppI18n()
  const day = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  return (
    <div
      className={`flex flex-none items-center gap-3 rounded-2xl bg-gray-900 px-3 py-2.5 text-white shadow-sm sm:px-4 ${className}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <BeakerIcon className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 text-xs leading-snug text-white/80 sm:text-sm">
        <span className="font-semibold text-white">{t('app.demo.bannerTitle', 'This is a demo workspace.')}</span>{' '}
        <span className="hidden sm:inline">
          {t('app.demo.bannerBody', 'Play with anything — emails and texts are never sent.')}{' '}
        </span>
        {day && <span className="text-white/60">{t('app.demo.bannerExpires', 'Deleted on {day}.').replace('{day}', day)}</span>}
      </p>
      <button
        type="button"
        onClick={leaveDemoForSignup}
        className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 transition-colors hover:bg-gray-100"
      >
        {t('app.demo.bannerCta', 'Start for free')}
      </button>
    </div>
  )
}
