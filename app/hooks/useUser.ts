'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '@/app/utils/api'
import { hasAppWorkspace } from '@/app/utils/sessionClient'

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
  } | null
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

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
          const merged = {
            ...user,
            firstName: p.firstName ?? user.firstName,
            lastName: p.lastName ?? user.lastName,
            email: p.email ?? user.email,
            languageCode: p.languageCode ?? user.languageCode,
            role: p.role ?? user.role,
            ...(Array.isArray(p.companies) ? { companies: p.companies } : {}),
            ...(p.pendingInvites !== undefined ? { pendingInvites: p.pendingInvites } : {}),
            ...(p.activeCompany !== undefined ? { activeCompany: p.activeCompany } : {}),
            ...(p.companyId !== undefined ? { companyId: p.companyId } : {}),
            ...(p.companyName !== undefined ? { companyName: p.companyName } : {}),
          }
          localStorage.setItem('user', JSON.stringify(merged))
          setUser(merged)
        })
        .catch(() => {
          // Keep existing local session payload if sync fails.
        })
      
      // Check if user has workspace (membership and/or pending invitations)
      if (!hasAppWorkspace(user as Record<string, unknown>)) {
        router.push('/setup/company')
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




