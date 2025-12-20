'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()

  useEffect(() => {
    // Get company slug from pathname
    const pathParts = window.location.pathname.split('/')
    const companySlug = pathParts[1] // e.g., /demo-company/settings -> demo-company
    if (companySlug) {
      router.replace(`/${companySlug}/settings/user`)
    } else {
      router.replace('/settings/user')
    }
  }, [router])

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Redirecting to settings...</p>
        </div>
      </div>
    </div>
  )
}




