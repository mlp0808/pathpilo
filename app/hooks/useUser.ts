'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '@/app/utils/api'
import { hasAppWorkspace } from '@/app/utils/sessionClient'
import {
  getOwnerSetupResumePath,
  mergeOnboardingStep,
  mergeSessionUserPreservingOnboarding,
  ownerMustCompleteSetup,
} from '@/app/utils/onboardingClient'
import { SESSION_UPDATED_EVENT } from '@/app/utils/sessionEvents'
import { forceReLogin, maybeRefreshSession, refreshSession } from '@/app/utils/sessionRefresh'
import { installAuthFetchRecovery } from '@/app/utils/authFetchGuard'

interface User {
  id: number
  firstName: string
  lastName: string
  email: string
  languageCode?: string
  role: string
  companyId: number | null
  companyName: string | null
  companies?: Array<{
    id: number
    name: string
    slug?: string
    countryCode?: string
    suspendedAt?: string | null
    role: string
    isOwner: boolean
  }>
  pendingInvites?: Array<{
    token: string
    role: string
    companyName: string
    companySlug?: string
    expiresAt: string
    invitedByName?: string
  }>
  activeCompany?: {
    id: number
    name: string
    slug?: string
    countryCode?: string
    suspendedAt?: string | null
    role: string
    isOwner: boolean
    onboardingCompleted?: boolean
    onboardingStep?: string
  } | null
}

export { SESSION_UPDATED_EVENT }

function readStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const onSessionUpdated = () => {
      const stored = readStoredUser()
      if (stored) setUser(stored)
    }
    window.addEventListener(SESSION_UPDATED_EVENT, onSessionUpdated)
    return () => window.removeEventListener(SESSION_UPDATED_EVENT, onSessionUpdated)
  }, [])

  // Recover globally from a stale token on any /api/* call, one time per tab.
  useEffect(() => {
    installAuthFetchRecovery()
  }, [])

  // Coming back to a tab that's been away for a while is exactly when a
  // long-lived token is most likely to have gone quiet — renew it then too.
  useEffect(() => {
    const onFocusLike = () => {
      if (document.visibilityState === 'visible') maybeRefreshSession()
    }
    document.addEventListener('visibilitychange', onFocusLike)
    window.addEventListener('focus', onFocusLike)
    return () => {
      document.removeEventListener('visibilitychange', onFocusLike)
      window.removeEventListener('focus', onFocusLike)
    }
  }, [])

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      router.push('/login')
      return
    }

    try {
      const user = JSON.parse(userData)
      setUser(user)

      // Renew the token in the background before it's anywhere near expiry —
      // see sessionRefresh.ts. Keeps an open/idle tab from ever hitting a
      // hard "Invalid or expired token" wall on its next request.
      maybeRefreshSession()

      // Keep desktop session user in sync with backend profile so edits made
      // from mobile are reflected after a web refresh.
      fetch(apiUrl('/user/profile'), {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          if (res.status === 401 || res.status === 403) {
            // The token didn't survive the trip (e.g. a laptop asleep past
            // the proactive-renew window) — one more attempt before giving up.
            if ((await refreshSession()) === 'expired') forceReLogin()
            return null
          }
          if (!res.ok) return null
          return res.json()
        })
        .then((data) => {
          const p = data?.user
          if (!p) return
          const storedActive = user.activeCompany
          const companies = Array.isArray(p.companies) ? p.companies : user.companies
          let activeCompany = p.activeCompany !== undefined ? p.activeCompany : user.activeCompany
          // Keep the user's chosen workspace when profile sync runs before JWT catches up.
          if (storedActive?.id && Array.isArray(companies)) {
            const match = companies.find((c: { id?: number }) => c.id === storedActive.id)
            if (match) {
              activeCompany = {
                ...storedActive,
                ...match,
                id: match.id,
                onboardingCompleted: match.onboardingCompleted || storedActive.onboardingCompleted,
                onboardingStep: mergeOnboardingStep(
                  storedActive.onboardingStep,
                  match.onboardingStep
                ),
              }
            }
          }
          const membershipRole = activeCompany?.role
          const merged = mergeSessionUserPreservingOnboarding(
            {
              ...user,
              firstName: p.firstName ?? user.firstName,
              lastName: p.lastName ?? user.lastName,
              email: p.email ?? user.email,
              languageCode: p.languageCode ?? user.languageCode,
              role: membershipRole ?? p.role ?? user.role,
              ...(Array.isArray(companies) ? { companies } : {}),
              ...(p.pendingInvites !== undefined ? { pendingInvites: p.pendingInvites } : {}),
              activeCompany: activeCompany ?? null,
              companyId: activeCompany?.id ?? p.companyId ?? user.companyId,
              companyName: activeCompany?.name ?? p.companyName ?? user.companyName,
            },
            p
          )
          localStorage.setItem('user', JSON.stringify(merged))
          setUser(merged)
        })
        .catch(() => {
          // Keep existing local session payload if sync fails.
        })
      
      // Owners answer the two company questions before entering the app;
      // employees skip them entirely.
      if (!hasAppWorkspace(user as Record<string, unknown>)) {
        router.push(getOwnerSetupResumePath(user as Record<string, unknown>))
        return
      }

      if (
        ownerMustCompleteSetup(user as Record<string, unknown>) &&
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/setup')
      ) {
        router.push(getOwnerSetupResumePath(user as Record<string, unknown>))
        return
      }

      if (user.activeCompany?.suspendedAt) {
        router.push('/suspended')
        return
      }
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }, [router])

  return { user, loading }
}




