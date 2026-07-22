'use client'

import { pushCtaClick } from '../../lib/dataLayer'

const REGISTER_URL = 'https://app.pathpilo.com/register'

/**
 * Get-started button for industry pages. Industry pages are English-first
 * (no locale prefix), so we link straight to the app register URL and fire
 * the standard cta_click dataLayer event for GTM.
 */
export default function IndustryCTA({
  label = 'Get started free',
  location,
  variant = 'primary',
  industry,
  className = '',
}: {
  label?: string
  location: string
  variant?: 'primary' | 'light' | 'pill'
  industry: string
  className?: string
}) {
  const base =
    variant === 'light'
      ? 'inline-flex items-center justify-center rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-primary-800 shadow-lg transition hover:bg-primary-50 hover:scale-[1.02]'
      : variant === 'pill'
        ? 'inline-flex items-center justify-center rounded-full bg-accent-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:bg-accent-600 hover:scale-[1.02]'
        : 'btn-primary inline-flex items-center justify-center !px-7 !py-3.5 !text-base'

  return (
    <a
      href={REGISTER_URL}
      className={`${base} ${className}`}
      onClick={() =>
        pushCtaClick({
          ctaType: 'register',
          ctaLabel: label,
          linkUrl: REGISTER_URL,
          location,
          featureKey: `industry_${industry}`,
        })
      }
    >
      {label}
    </a>
  )
}
