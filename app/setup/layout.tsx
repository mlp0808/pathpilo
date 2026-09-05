'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  getDashboardHref,
  getStoredUser,
  isClientLoggedIn,
  shouldRedirectAwayFromSetupWizard,
} from '@/app/utils/sessionClient'
import {
  getOwnerOnboardingStep,
  isOwnerUser,
  ownerMustCompleteSetup,
  setupPathForStep,
  setupStepIndex,
} from '@/app/utils/onboardingClient'

function pathToOnboardingStep(pathname: string): string {
  return pathname.includes('/setup/goals') ? 'goals' : 'company'
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!isClientLoggedIn()) {
      setReady(true)
      return
    }

    const user = getStoredUser()
    if (!user) {
      setReady(true)
      return
    }

    if (shouldRedirectAwayFromSetupWizard(user)) {
      router.replace(getDashboardHref(user))
      return
    }

    // Owners answer the two questions in order — no jumping ahead to /setup/goals
    // before the company exists, since the goals step needs its slug.
    if (isOwnerUser(user) && ownerMustCompleteSetup(user)) {
      const required = getOwnerOnboardingStep(user)
      const current = pathToOnboardingStep(pathname)
      if (setupStepIndex(current) > setupStepIndex(required)) {
        router.replace(setupPathForStep(required))
        return
      }
    }

    setReady(true)
  }, [router, pathname])

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a1414]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-400" />
          <p className="mt-2 text-sm text-gray-400">Loading…</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
