'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '../components/AppLayout'
import { useUser } from '../hooks/useUser'

export default function InvoicesRedirectPage() {
  const router = useRouter()
  const { user, loading } = useUser()

  useEffect(() => {
    if (loading) return
    const slug = user?.activeCompany?.slug
    if (slug) {
      router.replace(`/${slug}/invoices`)
    }
  }, [loading, user, router])

  return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">{`Redirecting you to your company invoices…`}</p>
      </div>
    </AppLayout>
  )
}
