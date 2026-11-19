'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDashboardHref, getStoredUser } from '../utils/sessionClient'
import { isDemoWorkspace } from '../utils/demoSession'

/** Demo accounts are for looking around — settings stay out of reach. */
export default function DemoSettingsGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const user = getStoredUser()
    if (isDemoWorkspace(user)) {
      router.replace(user ? getDashboardHref(user) : '/demo')
      return
    }
    setAllowed(true)
  }, [router])

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
