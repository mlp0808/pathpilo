'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowPathIcon, ChatBubbleLeftRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import { SettingsSection } from './SettingsUI'

interface Tier {
  key: string
  label: string
  included: number
  price: number
  currency: string
}

interface SmsResponse {
  configured: boolean
  hasCustomer: boolean
  currency: string
  tiers: Tier[]
  sms: {
    plan: {
      tierKey: string
      status: string
      includedPerMonth: number
      pricePerMonth: number
      currency: string
      currentPeriodEnd: string | null
    } | null
    usage: {
      usedThisPeriod: number
      includedPerMonth: number
      remaining: number
      overage: number
      currency: string
    }
  }
  subscription: {
    status: string
    cancelAtPeriodEnd: boolean
    currentPeriodEnd: string | null
  } | null
}

function formatMoney(amount: number, currency = 'GBP') {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      amount,
    )
  } catch {
    return `£${amount}`
  }
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function SmsBillingSection({
  companyId,
  companySlug,
  canManage,
  refreshSignal = 0,
}: {
  companyId?: number
  companySlug?: string
  canManage: boolean
  refreshSignal?: number
}) {
  const [data, setData] = useState<SmsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'subscribe' | 'cancel' | 'resume'>(null)
  const [index, setIndex] = useState(1)

  const body = useMemo(() => {
    const b: { companyId?: number; companySlug?: string } = {}
    if (companyId) b.companyId = companyId
    if (companySlug) b.companySlug = companySlug
    return b
  }, [companyId, companySlug])

  const fetchSms = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const q = companyId ? `?companyId=${companyId}` : ''
      const res = await fetch(apiUrl(`/stripe/sms${q}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Could not load SMS plan')
      const d = (await res.json()) as SmsResponse
      setData(d)
      const activeKey = d.sms.plan?.status === 'active' ? d.sms.plan.tierKey : null
      const activeIdx = activeKey ? d.tiers.findIndex((t) => t.key === activeKey) : -1
      setIndex(activeIdx >= 0 ? activeIdx : Math.min(1, d.tiers.length - 1))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void fetchSms()
  }, [fetchSms, refreshSignal])

  if (loading) {
    return (
      <SettingsSection title="SMS messaging" description="Add SMS reminders to your automated notifications.">
        <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
          <ArrowPathIcon className="h-4 w-4 animate-spin" /> Loading SMS plan…
        </div>
      </SettingsSection>
    )
  }

  if (!data || !data.configured) return null

  const tiers = data.tiers
  const tier = tiers[index]
  const plan = data.sms.plan
  const usage = data.sms.usage
  const sub = data.subscription
  const isActive = plan?.status === 'active'
  const currentIdx = isActive ? tiers.findIndex((t) => t.key === plan!.tierKey) : -1
  const cancelling = !!sub?.cancelAtPeriodEnd
  const isChange = isActive && index !== currentIdx
  const usedPct = isActive && usage.includedPerMonth > 0
    ? Math.min(100, Math.round((usage.usedThisPeriod / usage.includedPerMonth) * 100))
    : 0

  const subscribe = async () => {
    setBusy('subscribe')
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/sms-checkout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierKey: tier.key, ...body }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not start SMS checkout')
      if (d.url) {
        window.location.href = d.url
        return
      }
      // Switched in place (card already on file)
      await fetchSms()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not subscribe')
    } finally {
      setBusy(null)
    }
  }

  const cancelOrResume = async (resume: boolean) => {
    if (!resume && !confirm('Cancel your SMS plan? It stays active until the end of the current period.'))
      return
    setBusy(resume ? 'resume' : 'cancel')
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/stripe/sms-cancel'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, ...body }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Could not update SMS plan')
      }
      await fetchSms()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update SMS plan')
    } finally {
      setBusy(null)
    }
  }

  return (
    <SettingsSection
      title="SMS messaging"
      description="A monthly SMS bundle for automated reminders. No free trial — billed immediately and renews monthly."
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Active plan summary + usage */}
      {isActive && plan && (
        <div className="mb-6 rounded-2xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-100">
                <ChatBubbleLeftRightIcon className="h-4 w-4 text-accent-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {plan.includedPerMonth.toLocaleString()} SMS / month
                </p>
                <p className="text-xs text-gray-500">
                  {formatMoney(plan.pricePerMonth, plan.currency)} / month
                  {cancelling && sub?.currentPeriodEnd
                    ? ` · cancels ${formatDate(sub.currentPeriodEnd)}`
                    : sub?.currentPeriodEnd
                      ? ` · renews ${formatDate(sub.currentPeriodEnd)}`
                      : ''}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-500 px-2.5 py-0.5 text-xs font-semibold text-white">
              <CheckCircleIcon className="h-3.5 w-3.5" /> {cancelling ? 'Cancelling' : 'Active'}
            </span>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
              <span>
                {usage.usedThisPeriod.toLocaleString()} of {usage.includedPerMonth.toLocaleString()} used
              </span>
              <span>{usage.remaining.toLocaleString()} left</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${usedPct >= 100 ? 'bg-red-500' : 'bg-accent-500'}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            {usage.overage > 0 && (
              <p className="mt-1.5 text-xs text-amber-600">
                {usage.overage.toLocaleString()} over your allowance this period.
              </p>
            )}
          </div>
        </div>
      )}

      {!canManage ? (
        <p className="py-2 text-sm text-gray-500">Only the company owner can manage the SMS plan.</p>
      ) : (
        <>
          {/* Tier slider */}
          <div className="rounded-2xl border border-gray-200 p-5">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-gray-900">{tier.included.toLocaleString()} SMS</p>
                <p className="text-sm text-gray-500">per month</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{formatMoney(tier.price, tier.currency)}</p>
                <p className="text-sm text-gray-500">/ month</p>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={tiers.length - 1}
              step={1}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-accent-500"
            />
            <div className="mt-2 flex justify-between text-[10px] font-medium text-gray-400">
              {tiers.map((t) => (
                <span key={t.key}>{t.included >= 1000 ? `${t.included / 1000}k` : t.included}</span>
              ))}
            </div>

            <button
              type="button"
              onClick={subscribe}
              disabled={busy === 'subscribe' || (isActive && !isChange)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              {busy === 'subscribe' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
              {!isActive
                ? `Subscribe — ${formatMoney(tier.price, tier.currency)}/mo`
                : isChange
                  ? `Switch to ${tier.included.toLocaleString()} SMS — ${formatMoney(tier.price, tier.currency)}/mo`
                  : 'Current plan'}
            </button>
            {isActive && isChange && (
              <p className="mt-2 text-center text-xs text-gray-500">
                Switches immediately · prorated on your next invoice
              </p>
            )}
            {!isActive && (
              <p className="mt-2 text-center text-xs text-gray-500">Card required · cancel anytime</p>
            )}
          </div>

          {/* Cancel / resume */}
          {isActive && (
            <div className="mt-3">
              {cancelling ? (
                <button
                  type="button"
                  onClick={() => cancelOrResume(true)}
                  disabled={busy === 'resume'}
                  className="text-sm font-medium text-accent-700 transition hover:text-accent-800 disabled:opacity-50"
                >
                  {busy === 'resume' ? 'Resuming…' : 'Resume SMS plan'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => cancelOrResume(false)}
                  disabled={busy === 'cancel'}
                  className="text-sm font-medium text-gray-500 transition hover:text-red-600 disabled:opacity-50"
                >
                  {busy === 'cancel' ? 'Cancelling…' : 'Cancel SMS plan'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </SettingsSection>
  )
}
