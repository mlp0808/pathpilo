'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/app/components/AppLayout'
import { DigitalInvoiceView, type PublicInvoicePayload } from '@/app/components/DigitalInvoiceView'
import { apiUrl } from '@/app/utils/api'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'

export default function InvoiceEInvoicePreviewPage() {
  const params = useParams()
  const company = typeof params?.company === 'string' ? params.company : ''
  const id = typeof params?.id === 'string' ? params.id : ''
  const [data, setData] = useState<PublicInvoicePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || !id) {
      setLoading(false)
      setError(!id ? 'Invalid invoice' : 'Not authenticated')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/invoices/${id}/e-invoice`), {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Could not load invoice')
        if (!cancelled && json.invoice) setData(json.invoice)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const backHref = company ? `/${company}/invoices/${id}` : `/invoices/${id}`

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            <p className="mt-2 text-sm text-gray-500">Loading preview…</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-red-600">{error || 'Could not load invoice'}</p>
          <Link href={backHref} className="mt-4 inline-flex items-center text-sm text-accent-600 hover:text-accent-700">
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back to invoice
          </Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" />
          Back to invoice
        </Link>
        <DigitalInvoiceView data={data} variant="preview" extensionsHref={company ? `/${company}/settings/extensions` : '/settings/extensions'} />
      </div>
    </AppLayout>
  )
}
