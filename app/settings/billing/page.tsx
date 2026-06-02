'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  SparklesIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import {
  SettingsHeader,
  SettingsSection,
  SettingsRow,
} from '../../components/settings/SettingsUI'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubscriptionStatus {
  plan: 'standard' | 'pro'
  trialDaysLeft: number | null
  subscription: {
    status: string
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
    interval: 'month' | 'year'
  } | null
  hasStripeCustomer: boolean
}

const MONTHLY_PRICE = 39
const ANNUAL_PRICE  = Math.round(MONTHLY_PRICE * 12 * 0.65) // 35% off
const ANNUAL_PER_MO = Math.round(ANNUAL_PRICE / 12)
const ANNUAL_SAVING = Math.round(MONTHLY_PRICE * 12 - ANNUAL_PRICE)

const SOLO_FEATURES    = ['Unlimited jobs & scheduling', 'Unlimited clients', 'Invoicing & payments']
const COMPANY_FEATURES = ['Everything in Solo', 'Unlimited employees', 'Employee scheduling & roles']

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingSettingsPage() {
  const [status, setStatus]             = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [interval, setInterval]         = useState<'month' | 'year'>('month')
  const [upgrading, setUpgrading]       = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [flash, setFlash]               = useState<'success' | 'cancelled' | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true')   setFlash('success')
    if (params.get('cancelled') === 'true')  setFlash('cancelled')
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const fetchStatus = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/subscription'), { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Could not load billing status')
      setStatus(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleUpgrade = async () => {
    setUpgrading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/checkout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout failed')
      window.location.href = data.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Checkout failed')
      setUpgrading(false)
    }
  }

  const handlePortal = async () => {
    setOpeningPortal(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/portal'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not open billing portal')
      window.location.href = data.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal')
      setOpeningPortal(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <SettingsHeader title="Plan & billing" />
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ArrowPathIcon className="h-4 w-4 animate-spin" /> Loading billing status…
          </div>
        </div>
      </div>
    )
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const isPro         = status?.plan === 'pro'
  const hasActiveSub  = !!(status?.subscription && status.subscription.status === 'active')
  const isTrialing    = isPro && !hasActiveSub && (status?.trialDaysLeft ?? 0) > 0
  const trialExpired  = isPro && !hasActiveSub && (status?.trialDaysLeft ?? 0) === 0
  // "On Company" means there's an active paid subscription. Trial counts as Company too.
  const onCompany     = hasActiveSub || isTrialing
  const onSolo        = !onCompany

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <SettingsHeader
          title="Plan & billing"
          description="Manage your Vevago subscription, payment method and receipts. This is separate from the invoices you send to your own clients."
        />

        {/* Flash + errors */}
        {flash === 'success' && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">You&apos;re now on the Company plan!</p>
              <p className="text-sm text-green-700">Your subscription is active.</p>
            </div>
          </div>
        )}
        {flash === 'cancelled' && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
            <p className="text-sm text-amber-800">Checkout was cancelled. No charges were made.</p>
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {trialExpired && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-800">Your trial has ended</p>
              <p className="text-sm text-amber-700">You&apos;ve been moved to the Solo plan. Upgrade below to restore team features.</p>
            </div>
          </div>
        )}

        {/* ── Plan cards ──────────────────────────────────────────────────── */}
        <SettingsSection title="Your plan">
          <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2">

            {/* Solo */}
            <div className={[
              'relative flex flex-col rounded-2xl border-2 p-5 transition-all',
              onSolo ? 'border-accent-500 bg-accent-50/40' : 'border-gray-200 bg-white',
            ].join(' ')}>
              {onSolo && (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-accent-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                  <CheckCircleIcon className="h-3.5 w-3.5" /> Current plan
                </span>
              )}
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                  <UserIcon className="h-4 w-4 text-gray-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Solo</h3>
              </div>
              <div className="mb-4">
                <span className="text-2xl font-bold text-gray-900">Free</span>
                <span className="ml-1 text-sm text-gray-500">forever</span>
              </div>
              <ul className="mb-2 flex-1 space-y-2">
                {SOLO_FEATURES.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-gray-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div className={[
              'relative flex flex-col rounded-2xl border-2 p-5 transition-all',
              onCompany ? 'border-accent-500 bg-accent-50/40' : 'border-gray-200 bg-white',
            ].join(' ')}>
              {onCompany && (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-accent-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                  <CheckCircleIcon className="h-3.5 w-3.5" /> {isTrialing ? 'On trial' : 'Current plan'}
                </span>
              )}
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-100">
                  <SparklesIcon className="h-4 w-4 text-accent-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Company</h3>
              </div>

              {/* Price reflects the active sub interval, or the selected interval when upgrading */}
              <div className="mb-4">
                <span className="text-2xl font-bold text-gray-900">
                  £{hasActiveSub
                    ? (status!.subscription!.interval === 'year' ? ANNUAL_PER_MO : MONTHLY_PRICE)
                    : (interval === 'year' ? ANNUAL_PER_MO : MONTHLY_PRICE)}
                </span>
                <span className="ml-1 text-sm text-gray-500">/month</span>
              </div>

              <ul className="mb-4 flex-1 space-y-2">
                {COMPANY_FEATURES.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-accent-500" /> {f}
                  </li>
                ))}
              </ul>

              {/* Upgrade controls (only when not already paying) */}
              {!hasActiveSub && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="billing-interval" className="mb-1.5 block text-xs font-medium text-gray-500">
                      Billing period
                    </label>
                    <select
                      id="billing-interval"
                      value={interval}
                      onChange={(e) => setInterval(e.target.value as 'month' | 'year')}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                    >
                      <option value="month">Monthly — £{MONTHLY_PRICE}/mo</option>
                      <option value="year">Annual — £{ANNUAL_PER_MO}/mo (save £{ANNUAL_SAVING}/yr)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleUpgrade}
                    disabled={upgrading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
                  >
                    {upgrading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
                    {upgrading ? 'Redirecting…' : 'Upgrade'}
                  </button>

                  {interval === 'year' && (
                    <p className="text-center text-xs text-gray-500">£{ANNUAL_PRICE} billed annually · cancel anytime</p>
                  )}
                </div>
              )}

              {/* Manage controls (active subscription) */}
              {hasActiveSub && (
                <button
                  type="button"
                  onClick={handlePortal}
                  disabled={openingPortal}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  {openingPortal ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowTopRightOnSquareIcon className="h-4 w-4" />}
                  {openingPortal ? 'Opening…' : 'Manage billing'}
                </button>
              )}
            </div>
          </div>
        </SettingsSection>

        {/* ── Active subscription details ─────────────────────────────────── */}
        {hasActiveSub && status?.subscription && (
          <SettingsSection title="Subscription">
            <SettingsRow
              title="Billing period"
              description={status.subscription.interval === 'year' ? 'Annual — billed once a year' : 'Monthly — billed every month'}
              control={<span className="text-sm capitalize text-gray-600">{status.subscription.interval === 'year' ? 'Annual' : 'Monthly'}</span>}
            />
            <SettingsRow
              title={status.subscription.cancelAtPeriodEnd ? 'Access until' : 'Next renewal'}
              description={status.subscription.cancelAtPeriodEnd ? 'Your subscription is cancelled and will not renew.' : 'The date your card will be charged next.'}
              control={<span className="text-sm text-gray-600">{formatDate(status.subscription.currentPeriodEnd)}</span>}
            />
            <SettingsRow
              title="Receipts & payment method"
              description="Update your card or download payment receipts in the Stripe billing portal."
              control={
                <button
                  type="button"
                  onClick={handlePortal}
                  disabled={openingPortal}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 disabled:opacity-50"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" /> Open portal
                </button>
              }
            />
          </SettingsSection>
        )}
      </div>
    </div>
  )
}
