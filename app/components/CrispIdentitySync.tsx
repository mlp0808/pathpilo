'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { isCrispDismissed } from '../utils/crisp'

type StoredUser = {
  id?: number | string
  firstName?: string
  lastName?: string
  email?: string
  role?: string
  companyName?: string
  activeCompany?: {
    id?: number | string
    name?: string
  }
}

declare global {
  interface Window {
    $crisp?: Array<unknown>
  }
}

function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    return JSON.parse(raw) as StoredUser
  } catch {
    return null
  }
}

function pushCrisp(command: unknown[]) {
  window.$crisp = window.$crisp || []
  window.$crisp.push(command)
}

export function CrispIdentitySync() {
  const pathname = usePathname()

  useEffect(() => {
    if (isCrispDismissed()) return

    let cancelled = false

    const sync = () => {
      if (cancelled || !window.$crisp) return false

      const user = getStoredUser()
      if (!user?.email) {
        pushCrisp(['do', 'session:reset'])
        return true
      }

      const firstName = String(user.firstName || '').trim()
      const lastName = String(user.lastName || '').trim()
      const companyName = String(user.activeCompany?.name || user.companyName || '').trim()
      const nickname = `${firstName} ${lastName}`.trim() || String(user.email).trim()

      pushCrisp(['set', 'user:email', [String(user.email).trim()]])
      pushCrisp(['set', 'user:nickname', [nickname]])

      const sessionData: [string, string][] = []
      if (user.id != null) sessionData.push(['userId', String(user.id)])
      if (user.role) sessionData.push(['role', String(user.role)])
      if (companyName) sessionData.push(['companyName', companyName])
      if (sessionData.length > 0) {
        pushCrisp(['set', 'session:data', [sessionData]])
      }

      return true
    }

    if (sync()) return

    const onReady = () => {
      sync()
    }
    window.addEventListener('pathpilo-crisp-ready', onReady)

    let attempts = 0
    const interval = window.setInterval(() => {
      attempts += 1
      const done = sync()
      if (done || attempts >= 30) {
        window.clearInterval(interval)
      }
    }, 1000)

    return () => {
      cancelled = true
      window.clearEventListener('pathpilo-crisp-ready', onReady)
      window.clearInterval(interval)
    }
  }, [pathname])

  return null
}
