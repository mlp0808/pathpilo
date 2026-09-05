'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/app/components/AppLayout'
import { DigitalInvoiceView, type PublicInvoicePayload } from '@/app/components/DigitalInvoiceView'
import { apiUrl } from '@/app/utils/api'
import { ArrowDownTrayIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from '@/app/components/I18nProvider'
import type { MessageKey } from '@/app/i18n'

export default function InvoiceEInvoicePreviewPage() {
  const { t } = useAppI18n()
  const tr = (key: MessageKey, fallback?: string) => t(key, fallback)
  const params = useParams()
  const company = typeof params?.company === 'string' ? params.company : ''
  const id = typeof params?.id === 'string' ? params.id : ''
  const [data, setData] = useState<PublicInvoicePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pdfDownloading, setPdfDownloading] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || !id) {
      setLoading(false)
      setError(!id ? tr('invoice.preview.invalidInvoice', 'Invalid invoice') : tr('invoice.preview.notAuthenticated', 'Not authenticated'))
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/invoices/${id}/e-invoice`), {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || tr('invoice.preview.couldNotLoad', 'Could not load invoice'))
        if (!cancelled && json.invoice) setData(json.invoice)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : tr('invoice.preview.somethingWrong', 'Something went wrong'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const isDraftPreview = data?.badge?.kind === 'draft' || data?.status === 'draft'
  const backHref = isDraftPreview
    ? company
      ? `/${company}/invoices/new?draft=${id}`
      : `/invoices/new?draft=${id}`
    : company
      ? `/${company}/invoices/${id}`
      : `/invoices/${id}`

  const handleDownloadPdf = async () => {
    const token = localStorage.getItem('token')
    if (!token || !id) return
    setPdfDownloading(true)
    try {
      const res = await fetch(apiUrl(`/invoices/${id}/pdf`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        alert(json.error || tr('invoice.detail.failedDownloadPdf', 'Failed to download PDF'))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${data?.invoiceNumber || id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert(tr('invoice.detail.failedDownloadPdf', 'Failed to download PDF'))
    } finally {
      setPdfDownloading(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            <p className="mt-2 text-sm text-gray-500">{tr('invoice.preview.loading', 'Loading preview…')}</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-red-600">{error || tr('invoice.preview.couldNotLoad', 'Could not load invoice')}</p>
          <Link href={backHref} className="mt-4 inline-flex items-center text-sm text-accent-600 hover:text-accent-700">
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            {tr('invoice.preview.backToInvoice', 'Back to invoice')}
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
          {tr('invoice.preview.backToInvoice', 'Back to invoice')}
        </Link>
        <DigitalInvoiceView data={data} variant="preview" extensionsHref={company ? `/${company}/settings/extensions` : '/settings/extensions'} />
        <div className="mx-auto mt-6 max-w-3xl">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfDownloading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-5 w-5" aria-hidden />
            {pdfDownloading
              ? tr('invoice.detail.downloading', 'Downloading…')
              : tr('invoice.detail.downloadPdf', 'Download as PDF')}
          </button>
        </div>
      </div>
    </AppLayout>
  )
}
