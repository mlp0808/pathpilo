'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../../../utils/api'

interface Money {
  amount: number
  currency: string
}

interface StripeSubscription {
  id: string
  status: string
  interval: string
  startedAt: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  trialEnd: string | null
  amount: Money | null
}

interface StripeInvoice {
  id: string
  number: string | null
  status: string
  paid: boolean
  total: Money | null
  amountDue: Money | null
  amountPaid: Money | null
  created: string | null
  periodStart: string | null
  periodEnd: string | null
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
}

interface StripeSnapshot {
  configured: boolean
  hasCustomer: boolean
  customerId: string | null
  subscription: StripeSubscription | null
  nextInvoice: { date: string | null; amount: Money | null } | null
  invoices: StripeInvoice[]
  error: string | null
}

interface SmsTier {
  key: string
  label: string
  included: number
  price: number
  overageRate: number
  currency: string
}

interface SmsSnapshot {
  plan: {
    tierKey: string
    status: string
    includedPerMonth: number
    pricePerMonth: number
    overageRate: number
    currency: string
    startedAt: string
    currentPeriodStart: string
    currentPeriodEnd: string
  } | null
  usage: {
    usedThisPeriod: number
    includedPerMonth: number
    remaining: number
    overage: number
    overageCost: number
    currency: string
    allTimeSegments: number
    allTimeCost: number
  }
  recentEvents: Array<{
    id: number
    segments: number
    cost: number
    source: string
    note: string | null
    createdAt: string
  }>
}

interface BillingSnapshot {
  companyId: number
  plan: 'standard' | 'pro'
  billingInterval: string | null
  expiresAt: string | null
  suspendedAt: string | null
  createdAt: string
  billingSource: 'free' | 'trial' | 'comp' | 'paid' | 'stripe-trial'
  trial: { expiresAt: string; daysLeft: number; expired: boolean } | null
  stripe: StripeSnapshot
  sms: SmsSnapshot
}

const SOURCE_META: Record<BillingSnapshot['billingSource'], { label: string; cls: string }> = {
  free: { label: 'Free (Standard)', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  trial: { label: 'Pro trial', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  comp: { label: 'Pro (comped)', cls: 'bg-teal-100 text-teal-700 border-teal-200' },
  paid: { label: 'Paid (Stripe)', cls: 'bg-green-100 text-green-700 border-green-200' },
  'stripe-trial': { label: 'Stripe trial', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
}

const INVOICE_STATUS_META: Record<string, string> = {
  paid: 'bg-green-100 text-green-700 border-green-200',
  open: 'bg-amber-100 text-amber-700 border-amber-200',
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  uncollectible: 'bg-red-100 text-red-700 border-red-200',
  void: 'bg-gray-100 text-gray-500 border-gray-200',
}

function fmtMoney(m: Money | null): string {
  if (!m) return '—'
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency }).format(m.amount)
  } catch {
    return `${m.amount} ${m.currency}`
  }
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function BillingPanel({
  companyId,
  onPlanChanged,
}: {
  companyId: string
  onPlanChanged?: () => void
}) {
  const [data, setData] = useState<BillingSnapshot | null>(null)
  const [tiers, setTiers] = useState<SmsTier[]>([])
  const [trialDaysDefault, setTrialDaysDefault] = useState(14)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  // Plan controls
  const [trialDaysInput, setTrialDaysInput] = useState('14')
  const [customDate, setCustomDate] = useState('')
  // SMS controls
  const [smsTierSelect, setSmsTierSelect] = useState('')
  const [adjustSegments, setAdjustSegments] = useState('')
  const [adjustNote, setAdjustNote] = useState('')

  const token = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [billingRes, configRes] = await Promise.all([
        fetch(apiUrl(`/admin/companies/${companyId}/billing`), {
          headers: { Authorization: `Bearer ${token()}` },
        }),
        fetch(apiUrl('/admin/billing/config'), {
          headers: { Authorization: `Bearer ${token()}` },
        }),
      ])
      const billing = await billingRes.json()
      if (!billingRes.ok) {
        setError(billing.error || 'Failed to load billing details')
        return
      }
      setData(billing)
      if (configRes.ok) {
        const config = await configRes.json()
        setTiers(config.smsTiers || [])
        setTrialDaysDefault(config.trialDaysDefault || 14)
        setTrialDaysInput(String(config.trialDaysDefault || 14))
      }
    } catch (e) {
      setError('Network error: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 3500)
  }

  const patchPlan = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/admin/companies/${companyId}/plan`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Failed to update plan')
        return
      }
      flash(d.message || 'Plan updated')
      await load()
      onPlanChanged?.()
    } catch (e) {
      setError('Network error: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const extendBy = (days: number) => {
    const base = data?.expiresAt && new Date(data.expiresAt) > new Date() ? new Date(data.expiresAt) : new Date()
    base.setDate(base.getDate() + days)
    patchPlan({ plan: 'pro', accessMode: 'date', expiresAt: base.toISOString() })
  }

  const updateSmsPlan = async (tierKey: string | null, resetPeriod = false) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/admin/companies/${companyId}/sms-plan`), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierKey, resetPeriod }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Failed to update SMS plan')
        return
      }
      flash(d.message || 'SMS plan updated')
      await load()
    } catch (e) {
      setError('Network error: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const adjustUsage = async () => {
    const seg = parseInt(adjustSegments, 10)
    if (!Number.isFinite(seg) || seg === 0) {
      setError('Enter a non-zero number of segments (negative to subtract).')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/admin/companies/${companyId}/sms-usage/adjust`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: seg, note: adjustNote || undefined }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Failed to adjust usage')
        return
      }
      setAdjustSegments('')
      setAdjustNote('')
      flash('Usage adjusted')
      await load()
    } catch (e) {
      setError('Network error: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        <p className="mt-2 text-sm text-gray-500">Loading billing…</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 text-sm text-red-800">
        {error || 'Could not load billing details.'}
        <button onClick={load} className="ml-3 underline">Retry</button>
      </div>
    )
  }

  const src = SOURCE_META[data.billingSource]
  const sub = data.stripe.subscription
  const sms = data.sms
  const usagePct = sms.usage.includedPerMonth > 0
    ? Math.min(100, Math.round((sms.usage.usedThisPeriod / sms.usage.includedPerMonth) * 100))
    : 0

  return (
    <div className="space-y-6 mb-6">
      {(notice || error) && (
        <div className={`rounded-lg px-4 py-3 text-sm ${error ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {error || notice}
        </div>
      )}

      {/* Plan & billing */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Plan &amp; billing</h2>
            <p className="text-sm text-gray-500 mt-0.5">Member since {fmtDate(data.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${data.plan === 'pro' ? 'bg-violet-100 text-violet-700 border-violet-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
              {data.plan === 'pro' ? 'Pro' : 'Standard'}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${src.cls}`}>
              {src.label}
            </span>
          </div>
        </div>

        {/* Live Stripe subscription summary */}
        {sub ? (
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
            <Stat label="Subscription" value={sub.status} valueCls={sub.status === 'active' ? 'text-green-700' : sub.status === 'past_due' ? 'text-red-700' : 'text-gray-900'} />
            <Stat label="Billing" value={`${fmtMoney(sub.amount)} / ${sub.interval}`} />
            <Stat label="Started" value={fmtDate(sub.startedAt)} />
            <Stat label="Current period" value={`${fmtDate(sub.currentPeriodStart)} → ${fmtDate(sub.currentPeriodEnd)}`} />
            <Stat label="Next invoice" value={data.stripe.nextInvoice?.date ? `${fmtDate(data.stripe.nextInvoice.date)} · ${fmtMoney(data.stripe.nextInvoice.amount)}` : (sub.cancelAtPeriodEnd ? 'Ends at period end' : '—')} />
            {sub.cancelAtPeriodEnd && <Stat label="Cancellation" value={`Cancels ${fmtDate(sub.currentPeriodEnd)}`} valueCls="text-amber-700" />}
            {sub.trialEnd && <Stat label="Stripe trial ends" value={fmtDate(sub.trialEnd)} />}
          </div>
        ) : data.trial ? (
          <div className="mt-5 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <div>
              <p className="text-sm font-semibold text-blue-900">Pro trial / comped access</p>
              <p className="text-xs text-blue-700 mt-0.5">
                {data.trial.expired ? 'Expired ' : 'Expires '} {fmtDate(data.trial.expiresAt)}
                {!data.trial.expired && ` · ${data.trial.daysLeft} day${data.trial.daysLeft === 1 ? '' : 's'} left`}
              </p>
            </div>
          </div>
        ) : data.plan === 'pro' ? (
          <div className="mt-5 rounded-lg border border-teal-100 bg-teal-50/60 p-4 text-sm text-teal-800">
            Pro with no expiry (comped / permanent access). No Stripe subscription on file.
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50/60 p-4 text-sm text-gray-600">
            Standard plan — free forever. No trial or expiry applies.
          </div>
        )}

        {/* Manual plan controls */}
        <div className="mt-5 pt-5 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Manage plan (manual grant)</p>
          <div className="flex flex-wrap items-end gap-2">
            {data.plan === 'standard' ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Trial length (days)</label>
                  <input
                    type="number"
                    min={1}
                    value={trialDaysInput}
                    onChange={(e) => setTrialDaysInput(e.target.value)}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
                <button
                  disabled={busy}
                  onClick={() => patchPlan({ plan: 'pro', accessMode: 'trial', trialDays: Number(trialDaysInput) || trialDaysDefault })}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Start Pro trial
                </button>
                <button
                  disabled={busy}
                  onClick={() => patchPlan({ plan: 'pro', accessMode: 'permanent' })}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                >
                  Upgrade to Pro (comped)
                </button>
              </>
            ) : (
              <>
                <button disabled={busy} onClick={() => extendBy(7)} className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">+7 days</button>
                <button disabled={busy} onClick={() => extendBy(14)} className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">+14 days</button>
                <button disabled={busy} onClick={() => extendBy(30)} className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">+30 days</button>
                <div className="flex items-end gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Set expiry date</label>
                    <input
                      type="date"
                      value={customDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <button
                    disabled={busy || !customDate}
                    onClick={() => patchPlan({ plan: 'pro', accessMode: 'date', expiresAt: new Date(customDate).toISOString() })}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
                <button disabled={busy} onClick={() => patchPlan({ plan: 'pro', accessMode: 'permanent' })} className="px-3 py-2 rounded-lg text-sm font-medium border border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-50">Make permanent</button>
                <button disabled={busy} onClick={() => { if (window.confirm('Downgrade this company to Standard (free)? Trial/expiry will be cleared.')) patchPlan({ plan: 'standard' }) }} className="px-3 py-2 rounded-lg text-sm font-medium border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">Downgrade to Standard</button>
              </>
            )}
          </div>
          {sub && (
            <p className="mt-3 text-xs text-gray-400">
              This company pays through Stripe. Manual grants change access locally but won&apos;t alter their Stripe subscription — change or cancel paid subscriptions from the customer&apos;s Stripe billing portal.
            </p>
          )}
        </div>
      </div>

      {/* Invoices */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Invoices</h2>
          <p className="text-sm text-gray-500 mt-0.5">Billing history from Stripe</p>
        </div>
        {!data.stripe.configured ? (
          <div className="p-6 text-sm text-gray-500">Stripe isn&apos;t configured on this server, so invoice history is unavailable.</div>
        ) : !data.stripe.hasCustomer ? (
          <div className="p-6 text-sm text-gray-500">No Stripe billing account yet — this company hasn&apos;t started a paid checkout (it&apos;s on a free, trial, or comped plan).</div>
        ) : data.stripe.error ? (
          <div className="p-6 text-sm text-red-600">Couldn&apos;t load invoices from Stripe: {data.stripe.error}</div>
        ) : data.stripe.invoices.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No invoices yet for this customer.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Invoice', 'Period', 'Amount', 'Status', 'Date', ''].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.stripe.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{inv.number || inv.id.slice(-8)}</td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {inv.periodStart ? `${fmtDate(inv.periodStart)} → ${fmtDate(inv.periodEnd)}` : '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-900">{fmtMoney(inv.total || inv.amountDue)}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${INVOICE_STATUS_META[inv.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">{fmtDate(inv.created)}</td>
                    <td className="px-6 py-3 text-right text-sm">
                      {inv.hostedInvoiceUrl ? (
                        <a href={inv.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                      ) : inv.invoicePdf ? (
                        <a href={inv.invoicePdf} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">PDF</a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SMS add-on */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-900">SMS add-on</h2>
            <p className="text-sm text-gray-500 mt-0.5">Monthly SMS allowance &amp; usage</p>
          </div>
          {sms.plan && sms.plan.status === 'active' ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-100 text-emerald-700 border-emerald-200">
              {tiers.find((t) => t.key === sms.plan!.tierKey)?.label || sms.plan.tierKey}
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border bg-gray-100 text-gray-500 border-gray-200">
              No SMS plan
            </span>
          )}
        </div>

        {sms.plan && sms.plan.status === 'active' && (
          <div className="mt-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
              <Stat label="Included / month" value={sms.usage.includedPerMonth.toLocaleString('en-GB')} />
              <Stat label="Used this period" value={sms.usage.usedThisPeriod.toLocaleString('en-GB')} />
              <Stat label="Remaining" value={sms.usage.remaining.toLocaleString('en-GB')} />
              <Stat label="Plan price" value={fmtMoney({ amount: sms.plan.pricePerMonth, currency: sms.plan.currency })} />
              <Stat label="Period" value={`${fmtDate(sms.plan.currentPeriodStart)} → ${fmtDate(sms.plan.currentPeriodEnd)}`} />
              {sms.usage.overage > 0 && (
                <Stat label="Overage" value={`${sms.usage.overage.toLocaleString('en-GB')} · ${fmtMoney({ amount: sms.usage.overageCost, currency: sms.usage.currency })}`} valueCls="text-red-700" />
              )}
            </div>
            {/* Usage bar */}
            <div className="mt-3">
              <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full ${sms.usage.overage > 0 ? 'bg-red-500' : usagePct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">{usagePct}% of monthly allowance used</p>
            </div>
          </div>
        )}

        {/* SMS controls */}
        <div className="mt-5 pt-5 border-t border-gray-100 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">SMS tier</label>
            <select
              value={smsTierSelect || (sms.plan?.status === 'active' ? sms.plan.tierKey : '')}
              onChange={(e) => setSmsTierSelect(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 min-w-[180px]"
            >
              <option value="">Select a tier…</option>
              {tiers.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label} — {new Intl.NumberFormat('en-GB', { style: 'currency', currency: t.currency }).format(t.price)}/mo
                </option>
              ))}
            </select>
          </div>
          <button
            disabled={busy || !(smsTierSelect || sms.plan?.tierKey)}
            onClick={() => updateSmsPlan(smsTierSelect || sms.plan!.tierKey)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sms.plan?.status === 'active' ? 'Change plan' : 'Assign plan'}
          </button>
          {sms.plan?.status === 'active' && (
            <>
              <button
                disabled={busy}
                onClick={() => { if (smsTierSelect || sms.plan) updateSmsPlan(smsTierSelect || sms.plan!.tierKey, true) }}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                title="Restart the monthly billing window from today"
              >
                Reset period
              </button>
              <button
                disabled={busy}
                onClick={() => { if (window.confirm('Cancel this company\u2019s SMS plan?')) updateSmsPlan(null) }}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Cancel SMS plan
              </button>
            </>
          )}
        </div>

        {/* Adjust usage */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Adjust usage (segments)</label>
            <input
              type="number"
              value={adjustSegments}
              onChange={(e) => setAdjustSegments(e.target.value)}
              placeholder="e.g. -50 or 120"
              className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
            <input
              type="text"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="Reason for adjustment"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <button
            disabled={busy}
            onClick={adjustUsage}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Sending isn&apos;t wired to a provider yet, so real usage stays at zero until SMS delivery is built. Use adjustments for manual corrections or testing.
        </p>

        {/* Recent events */}
        {sms.recentEvents.length > 0 && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent usage events</p>
            <ul className="space-y-1.5">
              {sms.recentEvents.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    <span className={`font-medium ${e.segments < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {e.segments > 0 ? '+' : ''}{e.segments}
                    </span>
                    <span className="text-gray-400"> · {e.source}</span>
                    {e.note && <span className="text-gray-400"> · {e.note}</span>}
                  </span>
                  <span className="text-xs text-gray-400">{fmtDate(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, valueCls }: { label: string; value: string; valueCls?: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`text-sm font-semibold mt-0.5 ${valueCls || 'text-gray-900'}`}>{value}</dd>
    </div>
  )
}
