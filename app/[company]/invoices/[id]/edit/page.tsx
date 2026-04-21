'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'

/**
 * Editing a draft invoice is just the regular invoice creation flow with a
 * pre-filled form. We redirect to /invoices/new?draft=<id> so there is one
 * canonical UI for "build an invoice" — same layout, same line-item picker,
 * same payment toggles, same preview — whether you're starting from
 * scratch or reopening a draft.
 */
export default function EditInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const company = (params?.company as string) || ''
  const id = (params?.id as string) || ''

  useEffect(() => {
    if (!id) {
      router.replace(`/${company}/invoices`)
      return
    }
    router.replace(`/${company}/invoices/new?draft=${encodeURIComponent(id)}`)
  }, [company, id, router])

  return (
    <AppLayout>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    </AppLayout>
  )
}
