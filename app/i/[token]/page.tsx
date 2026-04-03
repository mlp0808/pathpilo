'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { DigitalInvoiceView, type PublicInvoicePayload } from '@/app/components/DigitalInvoiceView'
import { apiUrl } from '@/app/utils/api'

export default function PublicInvoicePage() {
  const params = useParams()
  const token = typeof params?.token === 'string' ? params.token : ''
  const [data, setData] = useState<PublicInvoicePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setError('Invalid link')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/public/invoices/${encodeURIComponent(token)}`), {
          credentials: 'omit',
        })
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json.error || 'Could not load invoice')
        }
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
  }, [token])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7f5] px-4">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#193434]/20 border-t-[#3DD57A]" />
          <p className="mt-4 text-sm text-slate-600">Loading your invoice…</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7f5] px-4">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-black/5">
          <p className="text-lg font-semibold text-slate-900">Invoice unavailable</p>
          <p className="mt-2 text-sm text-slate-600">{error || 'This link may be invalid or expired.'}</p>
        </div>
      </div>
    )
  }

  return <DigitalInvoiceView data={data} variant="public" />
}
