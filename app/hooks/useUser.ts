'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: number
  firstName: string
  lastName: string
  email: string
  role: string
  companyId: number | null
  companyName: string | null
  companies?: Array<{
    id: number
    name: string
    slug?: string
    role: string
    isOwner: boolean
  }>
  activeCompany?: {
    id: number
    name: string
    slug?: string
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
      
      // Check if user has companies or active company
      // If user has no companies and no activeCompany, redirect to company setup
      const hasCompanies = user.companies && user.companies.length > 0
      const hasActiveCompany = user.activeCompany !== null && user.activeCompany !== undefined
      const hasCompanyId = user.companyId !== null && user.companyId !== undefined
      
      if (!hasCompanies && !hasActiveCompany && !hasCompanyId) {
        router.push('/setup/company')
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




