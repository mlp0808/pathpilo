'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import {
  CheckCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  SparklesIcon,
  UserIcon,
  CreditCardIcon,
  ArrowDownTrayIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import { SettingsHeader, SettingsSection } from '../../components/settings/SettingsUI'
import SmsBillingSection from '../../components/settings/SmsBillingSection'
import {
  MONTHLY_PRICE,
  ANNUAL_PRICE,
  ANNUAL_SAVING,
  ANNUAL_SAVE_PERCENT,
} from '@/app/config/planPricing'
import { getStoredUser, isCompanyOwner, isOwnerOfSlug } from '@/app/utils/sessionClient'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Money {
  amount: number
  currency: string
}

interface SubscriptionInfo {
  id: string
  status: string
  interval: 'month' | 'year'
  startedAt: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  trialEnd: string | null
  amount: Money | null
}

interface InvoiceInfo {
  id: string
  number: string | null
  status: string
  paid: boolean
  amountDue: Money | null
  amountPaid: Money | null
  total: Money | null
  created: string | null
  periodStart: string | null
  periodEnd: string | null
  dueDate: string | null
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
}

interface UpcomingInvoice {
  amountDue: Money | null
  total: Money | null
  periodStart: string | null
  periodEnd: string | null
  nextPaymentAttempt: string | null
  date: string | null
}

interface CardInfo {
  id: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  wallet: string | null
}

interface BillingSnapshot {
  plan: 'standard' | 'pro'
  billingInterval: 'month' | 'year'
  trialUsed: boolean
  trialEligible: boolean
  trialDaysLeft: number | null
  configured: boolean
  hasCustomer: boolean
  subscription: SubscriptionInfo | null
  nextInvoice: UpcomingInvoice | null
  upcomingInvoice: UpcomingInvoice | null
  card: CardInfo | null
  invoices: InvoiceInfo[]
  error: string | null
}

const SOLO_FEATURES = ['Unlimited jobs & scheduling', 'Unlimited clients', 'Invoicing & payments']
const COMPANY_FEATURES = ['Everything in Solo', 'Unlimited employees', 'Employee scheduling & roles']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatMoney(m: Money | null) {
  if (!m) return '—'
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency || 'GBP' }).format(
      m.amount,
    )
  } catch {
    return `${m.amount} ${m.currency}`
  }
}

function brandLabel(brand: string | null) {
  if (!brand) return 'Card'
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: 'Paid', cls: 'bg-green-50 text-green-700 border-green-200' },
  open: { label: 'Due', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  draft: { label: 'Draft', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  uncollectible: { label: 'Unpaid', cls: 'bg-red-50 text-red-700 border-red-200' },
  void: { label: 'Void', cls: 'bg-gray-50 text-gray-400 border-gray-200' },
}

function resolveBillingContext(companySlug: string | undefined) {
  const user = getStoredUser()
  if (!user) return { companyId: undefined as number | undefined, canManage: false }
  const companies = user.companies as Array<{ id?: number; slug?: string }> | undefined
  const match = companySlug ? companies?.find((c) => c.slug === companySlug) : undefined
  const active = user.activeCompany as { id?: number; slug?: string } | undefined
  const companyId = match?.id ?? active?.id ?? (user.companyId as number | undefined)
  const canManage = companySlug ? isOwnerOfSlug(user, companySlug) : isCompanyOwner(user)
  return { companyId, companySlug, canManage }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingSettingsPage() {
  const params = useParams()
  const companySlug = typeof params?.company === 'string' ? params.company : undefined
  const billingContext = useMemo(() => resolveBillingContext(companySlug), [companySlug])

  const [data, setData] = useState<BillingSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  const [busy, setBusy] = useState<null | 'upgrade' | 'card' | 'cancel' | 'resume' | 'portal'>(null)
  const [flash, setFlash] = useState<'success' | 'cancelled' | 'card_updated' | 'sms_success' | null>(null)
  const [smsRefresh, setSmsRefresh] = useState(0)

  const billingBody = useMemo(() => {
    const body: { companyId?: number; companySlug?: string } = {}
    if (billingContext.companyId) body.companyId = billingContext.companyId
    if (companySlug) body.companySlug = companySlug
    return body
  }, [billingContext.companyId, companySlug])

  const fetchBilling = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const query = billingContext.companyId ? `?companyId=${billingContext.companyId}` : ''
      const res = await fetch(apiUrl(`/stripe/billing${query}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Could not load billing details')
      const snap = (await res.json()) as BillingSnapshot
      setData(snap)
      if (snap.subscription?.interval) setInterval(snap.subscription.interval)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [billingContext.companyId])

  // Handle return from Stripe (checkout / card update) once on mount.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    const sessionId = qs.get('session_id')
    const isSuccess = qs.get('success') === 'true'
    const isCancelled = qs.get('cancelled') === 'true'
    const cardUpdated = qs.get('card_updated') === 'true'
    const cardCancelled = qs.get('card_cancelled') === 'true'
    const smsSuccess = qs.get('sms_success') === 'true'
    const smsCancelled = qs.get('sms_cancelled') === 'true'
    window.history.replaceState({}, '', window.location.pathname)

    const token = localStorage.getItem('token')

    const run = async () => {
      if (smsSuccess && sessionId) {
        try {
          await fetch(apiUrl('/stripe/confirm-sms-checkout'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, ...billingBody }),
          })
          setFlash('sms_success')
        } catch {
          /* ignore */
        }
        setSmsRefresh((n) => n + 1)
        await fetchBilling()
        return
      }
      if (smsCancelled) {
        setFlash('cancelled')
        await fetchBilling()
        return
      }
      if (isCancelled || cardCancelled) {
        setFlash('cancelled')
        await fetchBilling()
        return
      }
      if (cardUpdated && sessionId) {
        try {
          await fetch(apiUrl('/stripe/confirm-card-update'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, ...billingBody }),
          })
          setFlash('card_updated')
        } catch {
          /* ignore */
        }
        await fetchBilling()
        return
      }
      if (isSuccess && sessionId) {
        try {
          const res = await fetch(apiUrl('/stripe/confirm-checkout'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, ...billingBody }),
          })
          if (res.ok) setFlash('success')
          else {
            const d = await res.json().catch(() => ({}))
            setError(d.error || 'Payment succeeded but we could not activate your plan. Contact support.')
          }
        } catch {
          setError('Payment succeeded but we could not confirm your subscription. Refresh or contact support.')
        }
        await fetchBilling()
        return
      }
      if (isSuccess) setFlash('success')
      await fetchBilling()
    }

    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount / return from Stripe
  }, [])

  // ── Actions ────────────────────────────────────────────────────────────────
  const startCheckout = async () => {
    setBusy('upgrade')
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/checkout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval, ...billingBody }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Checkout failed')
      window.location.href = d.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Checkout failed')
      setBusy(null)
    }
  }

  const updateCard = async () => {
    setBusy('card')
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/update-payment-method'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(billingBody),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not start card update')
      window.location.href = d.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update card')
      setBusy(null)
    }
  }

  const cancelSubscription = async () => {
    if (!confirm('Cancel your subscription? You keep access until the end of the current period.')) return
    setBusy('cancel')
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/cancel'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(billingBody),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Could not cancel')
      }
      await fetchBilling()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not cancel subscription')
    } finally {
      setBusy(null)
    }
  }

  const resumeSubscription = async () => {
    setBusy('resume')
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/resume'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(billingBody),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Could not resume')
      }
      await fetchBilling()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not resume subscription')
    } finally {
      setBusy(null)
    }
  }

  const openPortal = async () => {
    setBusy('portal')
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/portal'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(billingBody),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not open billing portal')
      window.location.href = d.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal')
      setBusy(null)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <SettingsHeader title="Plan & billing" />
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ArrowPathIcon className="h-4 w-4 animate-spin" /> Loading billing details…
          </div>
        </div>
      </div>
    )
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const sub = data?.subscription || null
  const isTrialing = sub?.status === 'trialing'
  const isActive = sub?.status === 'active'
  const isPastDue = sub?.status === 'past_due'
  const hasSub = !!sub && ['active', 'trialing', 'past_due'].includes(sub.status)
  const cancelling = !!sub?.cancelAtPeriodEnd
  const onCompany = hasSub
  const onSolo = !onCompany
  const canManage = billingContext.canManage
  const trialEligible = data?.trialEligible ?? true
  const upcoming = data?.upcomingInvoice || data?.nextInvoice || null
  const card = data?.card || null

  const ctaLabel = trialEligible ? 'Start 14-day free trial' : 'Subscribe'

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <SettingsHeader
          title="Plan & billing"
          description="Manage your PathPilo subscription, payment method and receipts. This is separate from the invoices you send to your own clients."
        />

        {/* Flash + errors */}
        {flash === 'success' && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">You&apos;re on the Company plan!</p>
              <p className="text-sm text-green-700">
                {isTrialing
                  ? 'Your free trial is active — no charge until it ends.'
                  : 'Your subscription is active.'}
              </p>
            </div>
          </div>
        )}
        {flash === 'card_updated' && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            <p className="text-sm text-green-800">Your payment method was updated.</p>
          </div>
        )}
        {flash === 'sms_success' && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            <p className="text-sm text-green-800">Your SMS plan is active.</p>
          </div>
        )}
        {flash === 'cancelled' && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
            <p className="text-sm text-amber-800">No changes were made.</p>
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {isPastDue && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-800">Payment failed</p>
              <p className="text-sm text-red-700">Update your card to keep your Company plan active.</p>
            </div>
          </div>
        )}

        {/* ── Plan cards ──────────────────────────────────────────────────── */}
        <SettingsSection title="Your plan">
          <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2">
            {/* Solo */}
            <div
              className={[
                'relative flex flex-col rounded-2xl border-2 p-5 transition-all',
                onSolo ? 'border-accent-500 bg-accent-50/40' : 'border-gray-200 bg-white',
              ].join(' ')}
            >
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
                {SOLO_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-gray-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div
              className={[
                'relative flex flex-col rounded-2xl border-2 p-5 transition-all',
                onCompany ? 'border-accent-500 bg-accent-50/40' : 'border-gray-200 bg-white',
              ].join(' ')}
            >
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

              <div className="mb-4">
                {(hasSub ? sub!.interval === 'year' : interval === 'year') ? (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-1">
                      <span className="text-2xl font-bold text-gray-900">£{ANNUAL_PRICE}</span>
                      <span className="text-sm text-gray-500">/year</span>
                    </div>
                    {!hasSub && (
                      <p className="mt-2 inline-flex rounded-lg border border-accent-200 bg-accent-50 px-2.5 py-1 text-sm font-bold text-accent-700">
                        Save £{ANNUAL_SAVING}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-x-1">
                    <span className="text-2xl font-bold text-gray-900">£{MONTHLY_PRICE}</span>
                    <span className="text-sm text-gray-500">/month</span>
                  </div>
                )}
              </div>

              <ul className="mb-4 flex-1 space-y-2">
                {COMPANY_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-accent-500" /> {f}
                  </li>
                ))}
              </ul>

              {/* Subscribe / trial controls */}
              {!hasSub && !canManage && (
                <p className="text-sm text-gray-500">
                  Only the company owner can manage the plan.
                </p>
              )}
              {!hasSub && canManage && (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="billing-interval"
                      className="mb-1.5 block text-xs font-medium text-gray-500"
                    >
                      Billing period
                    </label>
                    <select
                      id="billing-interval"
                      value={interval}
                      onChange={(e) => setInterval(e.target.value as 'month' | 'year')}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                    >
                      <option value="month">Monthly — £{MONTHLY_PRICE}/mo</option>
                      <option value="year">Annual — £{ANNUAL_PRICE}/yr (save {ANNUAL_SAVE_PERCENT}%)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={startCheckout}
                    disabled={busy === 'upgrade'}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
                  >
                    {busy === 'upgrade' ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <SparklesIcon className="h-4 w-4" />
                    )}
                    {busy === 'upgrade' ? 'Redirecting…' : ctaLabel}
                  </button>

                  <p className="text-center text-xs text-gray-500">
                    {trialEligible
                      ? 'Card required · no charge for 14 days · cancel anytime'
                      : 'Cancel anytime'}
                  </p>
                  <p className="text-center text-xs text-gray-500">
                    Have a promo code? Enter it on the Stripe checkout page.
                  </p>
                </div>
              )}

              {hasSub && (
                <div className="space-y-2">
                  {cancelling ? (
                    <button
                      type="button"
                      onClick={resumeSubscription}
                      disabled={busy === 'resume'}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
                    >
                      {busy === 'resume' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
                      Resume subscription
                    </button>
                  ) : (
                    canManage && (
                      <button
                        type="button"
                        onClick={cancelSubscription}
                        disabled={busy === 'cancel'}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {busy === 'cancel' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
                        Cancel subscription
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </SettingsSection>

        {/* ── Subscription status ─────────────────────────────────────────── */}
        {hasSub && sub && (
          <SettingsSection title="Subscription">
            <div className="divide-y divide-gray-100">
              <StatRow
                label="Status"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isTrialing ? 'bg-blue-500' : isActive ? 'bg-green-500' : 'bg-amber-500'
                      }`}
                    />
                    <span className="capitalize">
                      {cancelling ? 'Cancelling' : isTrialing ? 'Free trial' : sub.status}
                    </span>
                  </span>
                }
              />
              <StatRow
                label="Billing period"
                value={sub.interval === 'year' ? 'Annual' : 'Monthly'}
              />
              {isTrialing && sub.trialEnd && (
                <StatRow
                  label="Free trial ends"
                  value={formatDate(sub.trialEnd)}
                  hint={
                    upcoming?.total
                      ? `First charge of ${formatMoney(upcoming.total)} on this date`
                      : sub.amount
                        ? `Then ${formatMoney(sub.amount)} / ${sub.interval === 'year' ? 'year' : 'month'}`
                        : undefined
                  }
                />
              )}
              {!isTrialing && (
                <StatRow
                  label={cancelling ? 'Access until' : 'Next renewal'}
                  value={formatDate(sub.currentPeriodEnd)}
                  hint={
                    cancelling
                      ? 'Your subscription will not renew.'
                      : upcoming?.total
                        ? `${formatMoney(upcoming.total)} will be charged`
                        : undefined
                  }
                />
              )}
              {sub.amount && (
                <StatRow
                  label="Price"
                  value={`${formatMoney(sub.amount)} / ${sub.interval === 'year' ? 'year' : 'month'}`}
                />
              )}
            </div>
          </SettingsSection>
        )}

        {/* ── Payment method ──────────────────────────────────────────────── */}
        {data?.hasCustomer && (
          <SettingsSection
            title="Payment method"
            description="The card we charge for your subscription."
          >
            <div className="flex flex-wrap items-center justify-between gap-4 py-3">
              {card ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-14 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                    <CreditCardIcon className="h-5 w-5 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {brandLabel(card.brand)} •••• {card.last4}
                    </p>
                    <p className="text-xs text-gray-500">
                      Expires {String(card.expMonth).padStart(2, '0')}/{card.expYear}
                      {card.wallet ? ` · ${card.wallet}` : ''}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No card on file.</p>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={updateCard}
                  disabled={busy === 'card'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 disabled:opacity-50"
                >
                  {busy === 'card' ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCardIcon className="h-4 w-4" />
                  )}
                  {card ? 'Update card' : 'Add card'}
                </button>
              )}
            </div>
          </SettingsSection>
        )}

        {/* ── Invoices ────────────────────────────────────────────────────── */}
        {data?.hasCustomer && (
          <SettingsSection
            title="Billing history"
            description="Your PathPilo subscription invoices and receipts."
          >
            <div className="overflow-hidden">
              {/* Upcoming */}
              {upcoming && upcoming.total && !cancelling && (
                <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      Upcoming · {formatMoney(upcoming.total)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {isTrialing ? 'After your free trial' : 'Next payment'} · {formatDate(upcoming.date)}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Scheduled
                  </span>
                </div>
              )}

              {/* History */}
              {data.invoices.length === 0 ? (
                <p className="py-6 text-sm text-gray-500">No invoices yet.</p>
              ) : (
                data.invoices.map((inv) => {
                  const st = INVOICE_STATUS[inv.status] || {
                    label: inv.status,
                    cls: 'bg-gray-50 text-gray-600 border-gray-200',
                  }
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-4 border-b border-gray-100 py-3.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {formatMoney(inv.total)}{' '}
                          {inv.number && <span className="text-gray-400">· {inv.number}</span>}
                        </p>
                        <p className="text-xs text-gray-500">{formatDate(inv.created)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}
                        >
                          {st.label}
                        </span>
                        {inv.hostedInvoiceUrl && (
                          <a
                            href={inv.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View invoice"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </a>
                        )}
                        {inv.invoicePdf && (
                          <a
                            href={inv.invoicePdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Download PDF"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                          >
                            <ArrowDownTrayIcon className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Stripe portal link (secondary) */}
            {canManage && (
              <div className="pt-4">
                <button
                  type="button"
                  onClick={openPortal}
                  disabled={busy === 'portal'}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-800 disabled:opacity-50"
                >
                  {busy === 'portal' ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  )}
                  Manage everything in the Stripe portal
                </button>
              </div>
            )}
          </SettingsSection>
        )}

        {/* ── SMS add-on ──────────────────────────────────────────────────── */}
        <SmsBillingSection
          companyId={billingContext.companyId}
          companySlug={companySlug}
          canManage={canManage}
          refreshSignal={smsRefresh}
        />
      </div>
    </div>
  )
}

// ─── Small presentational row ──────────────────────────────────────────────

function StatRow({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {hint && <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">{hint}</p>}
      </div>
      <div className="ml-8 flex-shrink-0 text-sm text-gray-700">{value}</div>
    </div>
  )
}
