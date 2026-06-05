'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircleIcon, SparklesIcon, UserIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import { markActiveCompanyOnboardedInSession } from '../../utils/sessionClient'
import SetupWizardLayout from '@/app/components/setup/SetupWizardLayout'
import {
  MONTHLY_PRICE,
  ANNUAL_PRICE,
  ANNUAL_SAVING,
  ANNUAL_SAVE_PERCENT,
} from '@/app/config/planPricing'

const TRIAL_DAYS = 14

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

  const getCompanyIdFromSession = (): number | undefined => {
    try {
      const userObj = JSON.parse(localStorage.getItem('user') || '{}')
      const fromUser = userObj?.activeCompany?.id ?? userObj?.companyId
      if (fromUser) return Number(fromUser)
      const company = JSON.parse(localStorage.getItem('company') || '{}')
      if (company?.id) return Number(company.id)
    } catch { /* ignore */ }
    return undefined
  }

  const applyPlanResponse = (data: { token?: string; company?: { slug?: string } }) => {
    if (data.token) localStorage.setItem('token', data.token)
    markActiveCompanyOnboardedInSession()
    import('@/app/utils/onboardingClient').then(({ patchSessionOnboardingStep }) => {
      patchSessionOnboardingStep('done', true)
    })
    try {
      const userData = localStorage.getItem('user')
      if (userData) {
        const userObj = JSON.parse(userData)
        if (data.company?.slug) {
          userObj.activeCompany = { ...userObj.activeCompany, slug: data.company.slug }
        }
        localStorage.setItem('user', JSON.stringify(userObj))
      }
    } catch { /* ignore */ }
    const slug =
      data.company?.slug ||
      (() => {
        try {
          const u = JSON.parse(localStorage.getItem('user') || '{}')
          return u?.activeCompany?.slug || u?.companies?.[0]?.slug
        } catch {
          return undefined
        }
      })()
    router.replace(slug ? `/${slug}/dashboard` : '/dashboard')
  }

  const selectPlan = async (plan: 'solo' | 'company') => {
    const token = localStorage.getItem('token')
    const companyId = getCompanyIdFromSession()
    const res = await fetch(apiUrl('/companies/onboarding/select-plan'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan,
        interval: plan === 'company' ? interval : undefined,
        companyId,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to select plan')
    return data
  }

  const handleSolo = async () => {
    setLoading('solo')
    setError(null)
    try {
      const data = await selectPlan('solo')
      applyPlanResponse(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(null)
    }
  }

  const handleCompany = async () => {
    setLoading('company')
    setError(null)
    try {
      const data = await selectPlan('company')
      // Onboarding is now complete; store the refreshed token before leaving.
      if (data.token) localStorage.setItem('token', data.token)
      markActiveCompanyOnboardedInSession()
      const { patchSessionOnboardingStep } = await import('@/app/utils/onboardingClient')
      patchSessionOnboardingStep('done', true)
      try {
        const userData = localStorage.getItem('user')
        if (userData && data.company?.slug) {
          const userObj = JSON.parse(userData)
          userObj.activeCompany = { ...userObj.activeCompany, slug: data.company.slug }
          localStorage.setItem('user', JSON.stringify(userObj))
        }
      } catch { /* ignore */ }

      // Card-before-trial: send the owner to Stripe Checkout to add a card and
      // start the 14-day free trial. Pro is granted when checkout completes.
      const token = localStorage.getItem('token')
      const companyId = getCompanyIdFromSession()
      const res = await fetch(apiUrl('/stripe/checkout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interval,
          companyId,
          companySlug: data.company?.slug || undefined,
        }),
      })
      const checkout = await res.json()
      if (!res.ok || !checkout.url) {
        throw new Error(checkout.error || 'Could not start checkout')
      }
      window.location.href = checkout.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(null)
    }
  }

  const handleBack = () => router.push('/setup/clients')

  return (
    <SetupWizardLayout
      step={4}
      title="Choose your plan"
      description="You can always upgrade or downgrade later from Settings → Plan & billing."
      onBack={handleBack}
    >
        {/* Billing interval toggle */}
        <div className="flex mb-6">
          <div className="inline-flex bg-gray-100 border border-gray-200 rounded-xl p-1 gap-1">
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
              <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">-{ANNUAL_SAVE_PERCENT}%</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Solo */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-xl bg-gray-200/80 flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Solo</h2>
                <p className="text-xs text-gray-500">For individuals</p>
              </div>
            </div>

            <div className="mb-5">
              <span className="text-3xl font-bold text-gray-900">Free</span>
              <span className="text-sm text-gray-500 ml-1">forever</span>
            </div>

            <ul className="space-y-2 mb-7 flex-1">
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
              className="w-full py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white disabled:opacity-50"
            >
              {loading === 'solo'
                ? <span className="flex items-center justify-center gap-2"><ArrowPathIcon className="h-4 w-4 animate-spin" />Going to dashboard…</span>
                : 'Continue with Solo'}
            </button>
          </div>

          {/* Company */}
          <div className="bg-primary-800 border border-accent-500/40 rounded-2xl p-6 pt-8 flex flex-col relative overflow-visible ring-1 ring-accent-500/20">
            <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-accent-500/20 blur-3xl pointer-events-none" />

            <span className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-900 shadow-lg shadow-accent-500/30">
              {TRIAL_DAYS} days free
            </span>

            <div className="flex items-center gap-3 mb-4 relative">
              <div className="h-9 w-9 rounded-xl bg-accent-500/20 flex items-center justify-center">
                <SparklesIcon className="h-5 w-5 text-accent-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-white">Company</h2>
                  <span className="inline-flex rounded-full border border-accent-400/40 bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold text-accent-400">
                    Free trial
                  </span>
                </div>
                <p className="text-xs text-white/60">For teams &amp; businesses</p>
              </div>
            </div>

            <div className="mb-5 relative">
              <p className="text-xs font-medium text-accent-400 mb-1">
                {TRIAL_DAYS}-day free trial, then
              </p>
              {interval === 'year' ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-1">
                    <span className="text-3xl font-bold text-white">£{ANNUAL_PRICE}</span>
                    <span className="text-sm text-white/60">/year</span>
                  </div>
                  <p className="mt-2.5 inline-flex rounded-lg border border-accent-400/35 bg-accent-500/15 px-3 py-1 text-sm font-bold tracking-tight text-accent-400">
                    Save £{ANNUAL_SAVING}
                  </p>
                  <p className="mt-1.5 text-xs text-white/45">After your free trial</p>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-1">
                    <span className="text-3xl font-bold text-white">£{MONTHLY_PRICE}</span>
                    <span className="text-sm text-white/60">/month</span>
                  </div>
                  <p className="mt-1 text-xs text-white/50">Billed monthly after your trial ends</p>
                </>
              )}
            </div>

            <ul className="space-y-2 mb-7 flex-1 relative">
              {COMPANY_EXTRAS.map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-white/75">
                  <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-accent-400" />
                  {f}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={handleCompany}
              disabled={loading !== null}
              className="relative z-10 w-full py-3 rounded-xl bg-accent-500 hover:bg-accent-400 text-sm font-semibold text-white transition shadow-lg shadow-accent-500/30 disabled:opacity-50"
            >
              {loading === 'company'
                ? <span className="flex items-center justify-center gap-2"><ArrowPathIcon className="h-4 w-4 animate-spin" />Starting trial…</span>
                : 'Start free trial'}
            </button>
            <p className="mt-2 text-center text-[10px] text-white/45">
              Card required · No charge for {TRIAL_DAYS} days · Cancel anytime
            </p>
          </div>
        </div>

        <p className="mt-6 text-xs text-gray-400 text-center sm:text-left">
          Company plan starts with a {TRIAL_DAYS}-day free trial. We&apos;ll ask for a card so your
          plan continues automatically after the trial — cancel anytime before then and you won&apos;t be charged.
        </p>
    </SetupWizardLayout>
  )
}
