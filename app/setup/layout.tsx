'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getDashboardHref,
  getStoredUser,
  isClientLoggedIn,
  shouldRedirectAwayFromSetupWizard,
} from '@/app/utils/sessionClient'

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!isClientLoggedIn()) {
      setReady(true)
      return
    }
    const user = getStoredUser()
    if (user && shouldRedirectAwayFromSetupWizard(user)) {
      router.replace(getDashboardHref(user))
      return
    }
    setReady(true)
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
          <p className="mt-2 text-gray-600 text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
