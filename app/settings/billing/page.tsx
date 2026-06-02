'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  SparklesIcon,
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

// ─── Small helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ─── Plan cards used in the upgrade UI ───────────────────────────────────────

const MONTHLY_PRICE = 39
const ANNUAL_PRICE = Math.round(MONTHLY_PRICE * 12 * 0.65) // 35% off

function PlanCard({
  interval,
  selected,
  onSelect,
}: {
  interval: 'month' | 'year'
  selected: boolean
  onSelect: () => void
}) {
  const price = interval === 'year' ? ANNUAL_PRICE : MONTHLY_PRICE * 12
  const perMonth = interval === 'year' ? Math.round(ANNUAL_PRICE / 12) : MONTHLY_PRICE
  const saving = interval === 'year' ? Math.round(MONTHLY_PRICE * 12 - ANNUAL_PRICE) : 0

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'relative flex flex-col gap-1 rounded-xl border-2 px-5 py-4 text-left transition-all',
        selected
          ? 'border-gray-900 bg-gray-50'
          : 'border-gray-200 bg-white hover:border-gray-300',
      ].join(' ')}
    >
      <span className="text-sm font-medium text-gray-700">
        {interval === 'year' ? 'Annual' : 'Monthly'}
      </span>
      <span className="text-2xl font-bold text-gray-900">
        £{perMonth}
        <span className="text-sm font-normal text-gray-500">/mo</span>
      </span>
      {interval === 'year' && (
        <>
          <span className="text-xs text-gray-500">£{price} billed once a year</span>
          <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
            Save £{saving}
          </span>
        </>
      )}
      {selected && (
        <CheckCircleIcon className="absolute right-4 top-4 h-5 w-5 text-gray-900" />
      )}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingSettingsPage() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  const [upgrading, setUpgrading] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [flash, setFlash] = useState<'success' | 'cancelled' | null>(null)

  // Detect ?success=true or ?cancelled=true returned by Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') setFlash('success')
    if (params.get('cancelled') === 'true') setFlash('cancelled')
    // Clean the URL without a full reload
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/subscription'), {
        headers: { Authorization: `Bearer ${token}` },
      })
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
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
      const res = await fetch(apiUrl('/stripe/portal'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not open billing portal')
      window.location.href = data.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal')
      setOpeningPortal(false)
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <SettingsHeader title="Plan & billing" />
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
            Loading billing status…
          </div>
        </div>
      </div>
    )
  }

  // ── Derive display values ──────────────────────────────────────────────────
  const isPro = status?.plan === 'pro'
  const hasActiveSub = !!(status?.subscription && status.subscription.status === 'active')
  const isTrialing = isPro && !hasActiveSub && (status?.trialDaysLeft ?? 0) > 0
  const trialExpired = isPro && !hasActiveSub && (status?.trialDaysLeft ?? 0) === 0

  let planLabel = 'Solo — Free'
  if (isPro && hasActiveSub) {
    planLabel = `Company — £${status!.subscription!.interval === 'year' ? Math.round(ANNUAL_PRICE / 12) : MONTHLY_PRICE}/mo`
  } else if (isTrialing) {
    planLabel = `Company — Trial (${status!.trialDaysLeft} day${status!.trialDaysLeft === 1 ? '' : 's'} left)`
  } else if (trialExpired) {
    planLabel = 'Company — Trial ended'
  }

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <SettingsHeader
          title="Plan & billing"
          description="Manage your Vevago subscription, payment method and receipts. This is separate from the invoices you send to your own clients."
        />

        {/* Flash messages from Stripe redirect */}
        {flash === 'success' && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">You&apos;re now on the Company plan!</p>
              <p className="text-sm text-green-700">Your subscription is active. You can manage it below.</p>
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
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Trial expired notice */}
        {trialExpired && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-800">Your trial has ended</p>
              <p className="text-sm text-amber-700">You&apos;ve been moved to the Solo plan. Upgrade below to restore team features.</p>
            </div>
          </div>
        )}

        {/* ── Current plan ────────────────────────────────────────────────── */}
        <SettingsSection title="Current plan">
          <SettingsRow
            title={planLabel}
            description={
              hasActiveSub && status?.subscription
                ? `Renews ${status.subscription.cancelAtPeriodEnd ? 'cancelled — ends' : 'on'} ${formatDate(status.subscription.currentPeriodEnd)}`
                : isPro && isTrialing
                  ? `Enjoy all Company features free during your trial.`
                  : `The Solo plan is always free. Unlimited jobs, clients, invoices — just no team members.`
            }
            control={
              hasActiveSub ? (
                <button
                  type="button"
                  onClick={handlePortal}
                  disabled={openingPortal}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  {openingPortal
                    ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    : <ArrowTopRightOnSquareIcon className="h-4 w-4" />}
                  {openingPortal ? 'Opening…' : 'Manage billing'}
                </button>
              ) : undefined
            }
          />
        </SettingsSection>

        {/* ── Upgrade section (shown when not on a paid sub) ──────────────── */}
        {!hasActiveSub && (
          <SettingsSection title="Upgrade to Company">
            <div className="pb-2">
              <p className="mb-4 text-sm text-gray-500">
                Add unlimited team members, employee scheduling, and more for £{MONTHLY_PRICE}/month.
              </p>

              {/* Billing interval toggle */}
              <div className="mb-5 grid grid-cols-2 gap-3">
                <PlanCard interval="month" selected={interval === 'month'} onSelect={() => setInterval('month')} />
                <PlanCard interval="year" selected={interval === 'year'} onSelect={() => setInterval('year')} />
              </div>

              {/* What you get */}
              <ul className="mb-6 space-y-2">
                {[
                  'Unlimited employees & team members',
                  'Employee scheduling & work hours',
                  'Role-based access (owner, manager, employee)',
                  'Everything in Solo — always included',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-green-500" />
                    {item}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={handleUpgrade}
                disabled={upgrading}
                className="flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {upgrading
                  ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  : <SparklesIcon className="h-4 w-4" />}
                {upgrading ? 'Redirecting to checkout…' : `Upgrade — £${interval === 'year' ? Math.round(ANNUAL_PRICE / 12) : MONTHLY_PRICE}/mo`}
              </button>

              {interval === 'year' && (
                <p className="mt-2 text-xs text-gray-500">
                  Billed as £{ANNUAL_PRICE} today. Cancel anytime.
                </p>
              )}
            </div>
          </SettingsSection>
        )}

        {/* ── Active subscription details ─────────────────────────────────── */}
        {hasActiveSub && status?.subscription && (
          <SettingsSection title="Subscription">
            <SettingsRow
              title="Billing cycle"
              description={status.subscription.interval === 'year' ? 'Annual — billed yearly' : 'Monthly — billed every month'}
              control={<span className="text-sm text-gray-600 capitalize">{status.subscription.interval}ly</span>}
            />
            <SettingsRow
              title={status.subscription.cancelAtPeriodEnd ? 'Access until' : 'Next renewal'}
              description={
                status.subscription.cancelAtPeriodEnd
                  ? 'Your subscription is cancelled and will not renew.'
                  : 'The date your card will be charged next.'
              }
              control={
                <span className="text-sm text-gray-600">
                  {formatDate(status.subscription.currentPeriodEnd)}
                </span>
              }
            />
            <SettingsRow
              title="Receipts & invoices"
              description="Download payment receipts and update your payment method in the Stripe billing portal."
              control={
                <button
                  type="button"
                  onClick={handlePortal}
                  disabled={openingPortal}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 disabled:opacity-50"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  Open portal
                </button>
              }
            />
          </SettingsSection>
        )}
      </div>
    </div>
  )
}
