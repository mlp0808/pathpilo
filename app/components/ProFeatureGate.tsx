'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import CrownIcon from './icons/CrownIcon'
import { useAppI18n } from './I18nProvider'
import { useCompanyPlan } from '../hooks/useCompanyPlan'
import { apiUrl } from '../utils/api'
import { getStoredUser } from '../utils/sessionClient'
import {
  MONTHLY_PRICE,
  ANNUAL_PRICE,
  ANNUAL_SAVING,
  ANNUAL_SAVE_PERCENT,
} from '@/app/config/planPricing'

const PRO_FEATURES = [
  'Unlimited team members',
  'Employee roles & permissions',
  'Team scheduling & assignments',
  'Team performance overview',
]

interface ProFeatureGateProps {
  children: React.ReactNode
}

export default function ProFeatureGate({ children }: ProFeatureGateProps) {
  const { t } = useAppI18n()
  const params = useParams()
  const companySlug = (params?.company as string) || ''
  const { loading, hasProAccess } = useCompanyPlan()
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState('')

  const billingHref = companySlug ? `/${companySlug}/settings/billing` : '/settings/billing'

  const handleUpgrade = async () => {
    setUpgrading(true)
    setUpgradeError('')
    try {
      const token = localStorage.getItem('token')
      const user = getStoredUser()
      const companies = user?.companies as Array<{ id?: number; slug?: string }> | undefined
      const companyId =
        companies?.find((c) => c.slug === companySlug)?.id ??
        (user?.activeCompany as { id?: number } | undefined)?.id

      const res = await fetch(apiUrl('/stripe/checkout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interval,
          companyId,
          companySlug: companySlug || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout failed')
      window.location.href = data.url
    } catch (e: unknown) {
      setUpgradeError(e instanceof Error ? e.message : 'Checkout failed')
      setUpgrading(false)
    }
  }

  if (loading || hasProAccess) {
    return <>{children}</>
  }

  return (
    <div className="relative min-h-[calc(100vh-8rem)]">
      <div className="pointer-events-none select-none opacity-[0.35] blur-[0.5px]" aria-hidden="true">
        {children}
      </div>

      <div className="absolute inset-0 z-40 bg-white/90" aria-hidden="true" />

      <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10 sm:py-14">
        <div
          className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-2xl shadow-gray-200/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pro-feature-gate-title"
        >
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-200/80">
              <CrownIcon className="h-7 w-7 text-amber-500" />
            </div>
            <h2 id="pro-feature-gate-title" className="text-xl font-bold text-gray-900">
              {t('app.proGate.title', 'Team is a Pro feature')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {t(
                'app.proGate.description',
                'Invite employees, assign roles, and manage your team on the Company plan. Upgrade to unlock team management and continue growing your business.',
              )}
            </p>
          </div>

          <ul className="mt-6 space-y-2.5">
            {PRO_FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2.5 text-sm text-gray-700">
                <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-accent-500" />
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-gray-500">
                {t('app.proGate.billingInterval', 'Billing')}
              </span>
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setInterval('month')}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    interval === 'month' ? 'bg-primary-500 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('app.proGate.monthly', 'Monthly')}
                </button>
                <button
                  type="button"
                  onClick={() => setInterval('year')}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    interval === 'year' ? 'bg-primary-500 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('app.proGate.annual', 'Annual')}
                  <span className="ml-1 text-[10px] opacity-90">−{ANNUAL_SAVE_PERCENT}%</span>
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900">
                £{interval === 'year' ? ANNUAL_PRICE : MONTHLY_PRICE}
              </span>
              <span className="text-sm text-gray-500">
                {interval === 'year'
                  ? t('app.proGate.perYear', '/ year')
                  : t('app.proGate.perMonth', '/ month')}
              </span>
            </div>
            {interval === 'year' && (
              <p className="mt-1 text-xs text-green-700">
                {t('app.proGate.annualSaving', 'Save £{{amount}} vs monthly').replace(
                  '{{amount}}',
                  String(ANNUAL_SAVING),
                )}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              {t('app.proGate.trialNote', '14-day free trial · cancel anytime')}
            </p>
          </div>

          {upgradeError && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {upgradeError}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void handleUpgrade()}
              disabled={upgrading}
              className="w-full rounded-xl bg-accent-500 px-4 py-3 text-sm font-bold text-primary-500 shadow-sm hover:bg-accent-600 disabled:opacity-60 transition-colors"
            >
              {upgrading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  {t('app.proGate.redirecting', 'Redirecting to checkout…')}
                </span>
              ) : (
                t('app.proGate.upgradeCta', 'Upgrade to Company plan')
              )}
            </button>
            <Link
              href={billingHref}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('app.proGate.viewBilling', 'View plan & billing details')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
