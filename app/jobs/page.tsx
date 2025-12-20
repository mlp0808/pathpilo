'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '../hooks/useUser'

export default function JobsPage() {
  const router = useRouter()
  const { user, loading } = useUser()

  useEffect(() => {
    if (!loading && user) {
      // Redirect to company slug route, preserving query params
      const companySlug = user.activeCompany?.slug || user.companies?.[0]?.slug
      if (companySlug) {
        const searchParams = window.location.search
        router.replace(`/${companySlug}/jobs${searchParams}`)
      }
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return null
}
