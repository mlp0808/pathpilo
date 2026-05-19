'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

/** Legacy route — redirects to the main jobs calendar. */
export default function CompletedJobsRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const company = params?.company as string | undefined

  useEffect(() => {
    router.replace(company ? `/${company}/jobs` : '/jobs')
  }, [company, router])

  return (
    <div className="flex items-center justify-center min-h-screen bg-page">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent" />
    </div>
  )
}
