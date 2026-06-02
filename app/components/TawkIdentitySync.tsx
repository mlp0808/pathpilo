'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { isTawkDismissed } from '../utils/tawk'

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
    Tawk_API?: {
      setAttributes?: (attributes: Record<string, string>, callback?: (error?: unknown) => void) => void
      logout?: () => void
    }
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

export function TawkIdentitySync() {
  const pathname = usePathname()

  useEffect(() => {
    if (isTawkDismissed()) return

    let cancelled = false

    const trySync = () => {
      if (cancelled) return true
      const api = window.Tawk_API
      if (!api || typeof api.setAttributes !== 'function') return false

      const user = getStoredUser()
      if (!user || !user.email) {
        if (typeof api.logout === 'function') api.logout()
        return true
      }

      const firstName = String(user.firstName || '').trim()
      const lastName = String(user.lastName || '').trim()
      const companyName = String(user.activeCompany?.name || user.companyName || '').trim()

      api.setAttributes(
        {
          name: `${firstName} ${lastName}`.trim() || user.email,
          email: String(user.email).trim(),
          userId: String(user.id || ''),
          role: String(user.role || ''),
          companyName,
        },
        () => {
          // no-op
        }
      )
      return true
    }

    if (trySync()) return

    let attempts = 0
    const interval = window.setInterval(() => {
      attempts += 1
      const synced = trySync()
      if (synced || attempts >= 30) {
        window.clearInterval(interval)
      }
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [pathname])

  return null
}
