'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircleIcon, SparklesIcon, UserIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import { markActiveCompanyOnboardedInSession } from '../../utils/sessionClient'

const MONTHLY_PRICE = 39
const ANNUAL_PRICE  = Math.round(MONTHLY_PRICE * 12 * 0.65) // 35% annual saving

const SOLO_FEATURES = [
  'Unlimited jobs & scheduling',
  'Unlimited clients',
  'Invoicing & payments',
  'Lead management',
  'Route planning',
  'Mobile app access',
]

const COMPANY_EXTRAS = [
  'Everything in Solo',
  'Unlimited employees',
  'Employee scheduling & work hours',
  'Role-based access control',
  'Team performance overview',
]

export default function SetupPlanPage() {
  const router  = useRouter()
  const [interval, setInterval]     = useState<'month' | 'year'>('month')
  const [loading, setLoading]       = useState<'solo' | 'company' | null>(null)
  const [error, setError]           = useState<string | null>(null)

  const perMonth   = interval === 'year' ? Math.round(ANNUAL_PRICE / 12) : MONTHLY_PRICE
  const annualTotal = ANNUAL_PRICE
  const saving      = Math.round(MONTHLY_PRICE * 12 - ANNUAL_PRICE)

  // Mark the company onboarded both server-side and in the cached session so
  // navigation gates stop redirecting back into the wizard.
  const completeOnboarding = async () => {
    try {
      const token = localStorage.getItem('token')
      await fetch(apiUrl('/companies/onboarding/complete'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch { /* best effort — session flag below still unblocks navigation */ }
    markActiveCompanyOnboardedInSession()
  }

  const handleSolo = async () => {
    setLoading('solo')
    await completeOnboarding()
    try {
      const userData  = localStorage.getItem('user')
      const userObj   = userData ? JSON.parse(userData) : null
      const slug      = userObj?.activeCompany?.slug || userObj?.companies?.[0]?.slug
      router.replace(slug ? `/${slug}/dashboard` : '/dashboard')
    } catch {
      router.replace('/dashboard')
    }
  }

  const handleCompany = async () => {
    setLoading('company')
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res   = await fetch(apiUrl('/stripe/checkout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout failed')
      // Onboarding is complete regardless of whether they finish paying — they've
      // gone through every wizard step. Stripe success/cancel returns to billing.
      await completeOnboarding()
      window.location.href = data.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-primary-50/30 to-primary-50/50">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-50 text-accent-700 border border-accent-200 mb-4">
            Step 4 of 4
          </div>
          <h1 className="text-3xl font-bold text-primary-800 tracking-tight mb-3">
            Choose your plan
          </h1>
          <p className="text-gray-500 max-w-md mx-auto">
            You can always upgrade or downgrade later from Settings → Plan &amp; billing.
          </p>
        </div>

        {/* Billing interval toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
            <button
              type="button"
              onClick={() => setInterval('month')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${interval === 'month' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval('year')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${interval === 'year' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Annual
              <span className="text-xs font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">Save 35%</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-center">{error}</div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Solo */}
          <div className="bg-white rounded-2xl border border-gray-200 p-7 flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Solo</h2>
                <p className="text-xs text-gray-500">For individuals</p>
              </div>
            </div>

            <div className="my-5">
              <span className="text-4xl font-bold text-gray-900">Free</span>
              <span className="text-sm text-gray-500 ml-1">forever</span>
            </div>

            <ul className="space-y-2.5 mb-8 flex-1">
              {SOLO_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-gray-700">
                  <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  {f}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={handleSolo}
              disabled={loading !== null}
              className="w-full py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading === 'solo'
                ? <span className="flex items-center justify-center gap-2"><ArrowPathIcon className="h-4 w-4 animate-spin" />Going to dashboard…</span>
                : 'Continue with Solo'}
            </button>
          </div>

          {/* Company */}
          <div className="bg-primary-800 rounded-2xl border border-primary-700 p-7 flex flex-col relative overflow-hidden">
            {/* Glow */}
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-accent-500/20 blur-2xl pointer-events-none" />

            <div className="flex items-center gap-3 mb-2 relative">
              <div className="h-9 w-9 rounded-xl bg-accent-500/20 flex items-center justify-center">
                <SparklesIcon className="h-5 w-5 text-accent-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Company</h2>
                <p className="text-xs text-primary-300">For teams &amp; businesses</p>
              </div>
            </div>

            <div className="my-5 relative">
              <span className="text-4xl font-bold text-white">£{perMonth}</span>
              <span className="text-sm text-primary-300 ml-1">/month</span>
              {interval === 'year' && (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-xs text-primary-300">£{annualTotal} billed annually</p>
                  <p className="text-xs font-semibold text-accent-400">You save £{saving}/year</p>
                </div>
              )}
            </div>

            <ul className="space-y-2.5 mb-8 flex-1 relative">
              {COMPANY_EXTRAS.map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-primary-100">
                  <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-accent-400" />
                  {f}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={handleCompany}
              disabled={loading !== null}
              className="relative w-full py-3 rounded-xl bg-accent-500 hover:bg-accent-400 text-sm font-semibold text-white transition shadow-lg shadow-accent-500/30 disabled:opacity-50"
            >
              {loading === 'company'
                ? <span className="flex items-center justify-center gap-2"><ArrowPathIcon className="h-4 w-4 animate-spin" />Redirecting…</span>
                : `Upgrade to Company — £${perMonth}/mo`}
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          Secure payment via Stripe · Cancel anytime · No hidden fees
        </p>
      </div>
    </div>
  )
}
