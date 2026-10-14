'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from '@/app/components/I18nProvider'
import CrownIcon from '@/app/components/icons/CrownIcon'
import { apiUrl } from '@/app/utils/api'
import { getStoredUser } from '@/app/utils/sessionClient'
import {
  MONTHLY_PRICE,
  ANNUAL_PRICE,
  ANNUAL_SAVING,
  ANNUAL_SAVE_PERCENT,
} from '@/app/config/planPricing'

const FEATURES = [
  'Unlimited team members',
  'Employee roles & permissions',
  'Team scheduling & assignments',
  'Team performance overview',
]

/**
 * Starts the 14-day free trial from the Team guide. Card is required, nothing is
 * charged today, and the card is billed automatically when the trial ends.
 * After Stripe checkout the user returns to `returnPath` and the guide continues.
 */
export default function StartTrialModal({
  companySlug,
  returnPath,
  onClose,
}: {
  companySlug: string
  returnPath: string
  onClose: () => void
}) {
  const { t } = useAppI18n()
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  const [trialEligible, setTrialEligible] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(apiUrl('/stripe/subscription'), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setTrialEligible(d.trialEligible !== false)
      })
      .catch(() => {
        /* assume eligible; the server decides */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const startCheckout = async () => {
    setBusy(true)
    setError('')
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
          nextPath: returnPath,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout failed')
      window.location.href = data.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Checkout failed')
      setBusy(false)
    }
  }

  const price = interval === 'year' ? ANNUAL_PRICE : MONTHLY_PRICE
  const perLabel =
    interval === 'year' ? t('app.proGate.perYear', '/ year') : t('app.proGate.perMonth', '/ month')
  const hasTrial = trialEligible !== false

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-trial-title"
        className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-6 shadow-2xl sm:rounded-2xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={t('guide.trial.close', 'Close')}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-200/80">
            <CrownIcon className="h-7 w-7 text-amber-500" />
          </div>
          <h2 id="start-trial-title" className="text-xl font-bold text-gray-900">
            {hasTrial
              ? t('guide.trial.title', 'Start your 14-day free trial')
              : t('guide.trial.titleNoTrial', 'Unlock team features')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            {hasTrial
              ? t(
                  'guide.trial.body',
                  'Invite employees, assign jobs and run the schedule as a team. Add a card to begin — you will not be charged today.',
                )
              : t(
                  'guide.trial.bodyNoTrial',
                  'Your free trial has already been used, so the Company plan starts today. You can cancel anytime in billing.',
                )}
          </p>
        </div>

        <ul className="mt-5 space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-sm text-gray-700">
              <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-accent-500" />
              {f}
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
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
            <span className="text-2xl font-bold text-gray-900">£{price}</span>
            <span className="text-sm text-gray-500">{perLabel}</span>
          </div>
          {interval === 'year' && (
            <p className="mt-1 text-xs text-green-700">
              {t('app.proGate.annualSaving', 'Save £{{amount}} vs monthly').replace(
                '{{amount}}',
                String(ANNUAL_SAVING),
              )}
            </p>
          )}

          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            {hasTrial
              ? t(
                  'guide.trial.terms',
                  '£0 today. After 14 days your card is charged automatically — no need to pick a plan again. Cancel or switch plan anytime in billing.',
                )
              : t(
                  'guide.trial.termsNoTrial',
                  'Your card is charged today. Cancel or switch plan anytime in billing.',
                )}
          </p>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => void startCheckout()}
            disabled={busy}
            className="w-full rounded-xl bg-accent-500 px-4 py-3 text-sm font-bold text-primary-500 shadow-sm transition-colors hover:bg-accent-600 disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-flex items-center justify-center gap-2">
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                {t('app.proGate.redirecting', 'Redirecting to checkout…')}
              </span>
            ) : hasTrial ? (
              t('guide.trial.cta', 'Add card & start free trial')
            ) : (
              t('guide.trial.ctaNoTrial', 'Continue to checkout')
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            {t('guide.trial.notNow', 'Not now')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
