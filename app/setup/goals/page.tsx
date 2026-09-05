'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon } from '@heroicons/react/24/solid'
import { useUser } from '../../hooks/useUser'
import { USAGE_GOALS } from '../../config/companyOnboarding'
import SetupWizardLayout from '@/app/components/setup/SetupWizardLayout'
import { completeOnboardingWizard, getCompanySlug } from '../../utils/onboardingClient'

export default function GoalsSetupPage() {
  const { user } = useUser()
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]))
  }

  const finish = async () => {
    setIsLoading(true)
    setError('')
    try {
      const result = await completeOnboardingWizard({
        companyId: user?.companyId ?? undefined,
        usageGoals: selected,
      })
      if (!result) {
        setError('Could not save your answers. Please try again.')
        return
      }
      const slug = getCompanySlug(user as unknown as Record<string, unknown>)
      // Full reload so every layout picks up the now-onboarded session.
      window.location.href = slug ? `/${slug}/dashboard` : '/select-company'
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <SetupWizardLayout
      step={2}
      title="What do you want to use PathPilo for?"
      description="Pick anything that sounds like you. This just helps us point you at the right features — you can change your mind later."
      onBack={() => router.push('/setup/company')}
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-600">{error}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {USAGE_GOALS.map((goal) => {
            const isSelected = selected.includes(goal.id)
            return (
              <button
                key={goal.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(goal.id)}
                className={[
                  'inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all',
                  isSelected
                    ? 'border-accent-500 bg-accent-500/10 text-accent-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                ].join(' ')}
              >
                {isSelected && <CheckIcon className="h-4 w-4 flex-none text-accent-600" />}
                {goal.label}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={finish}
          disabled={isLoading}
          className="mt-2 w-full rounded-xl bg-accent-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition-all hover:bg-accent-400 hover:shadow-accent-500/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Finishing up…
            </span>
          ) : (
            'Go to my dashboard →'
          )}
        </button>

        <p className="text-center text-xs text-gray-400">
          {selected.length === 0
            ? 'You can skip this and head straight to your dashboard.'
            : `${selected.length} selected`}
        </p>
      </div>
    </SetupWizardLayout>
  )
}
