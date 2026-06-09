'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '@/app/utils/api'
import { getDashboardHref, hasAppWorkspace } from '@/app/utils/sessionClient'
import {
  getOwnerSetupResumePath,
  mergeOnboardingStep,
  mergeSessionUserPreservingOnboarding,
  ownerMustCompleteSetup,
} from '@/app/utils/onboardingClient'

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

export const SESSION_UPDATED_EVENT = 'vevago:session-updated'

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

      // Keep desktop session user in sync with backend profile so edits made
      // from mobile are reflected after a web refresh.
      fetch(apiUrl('/user/profile'), {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
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
      
      // Owners must finish setup wizard; employees skip it.
      if (!hasAppWorkspace(user as Record<string, unknown>)) {
        router.push(getOwnerSetupResumePath(user as Record<string, unknown>))
        return
      }

      const href = getDashboardHref(user as Record<string, unknown>)
      const resumePath = ownerMustCompleteSetup(user as Record<string, unknown>)
        ? getOwnerSetupResumePath(user as Record<string, unknown>)
        : href
      const resumeBase = resumePath.split('?')[0]
      const onWizardAppPage =
        typeof window !== 'undefined' &&
        !resumePath.startsWith('/setup/') &&
        window.location.pathname.startsWith(resumeBase)
      if (
        resumePath.startsWith('/setup/') &&
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/setup') &&
        !onWizardAppPage
      ) {
        router.push(resumePath)
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




