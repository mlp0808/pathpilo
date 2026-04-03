'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import { apiUrl } from '@/app/utils/api'
import Link from 'next/link'
import { ArrowLeftIcon, PaperAirplaneIcon, ArrowDownTrayIcon, PencilSquareIcon, BanknotesIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { DigitalInvoiceView, type PublicInvoicePayload } from '@/app/components/DigitalInvoiceView'

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatNumber(amount: number | string | undefined): string {
  if (amount === undefined || amount === null) return '0.00'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return '0.00'
  return n.toFixed(2)
}

const INVOICE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
] as const

const TIMELINE_ORDER: readonly string[] = ['draft', 'sent', 'overdue', 'paid']

function statusToLabel(status: string): string {
  if (status === 'cancelled') return 'Credited'
  if (status === 'credited') return 'Credited'
  return INVOICE_STATUSES.find((s) => s.value === status)?.label ?? status
}

function timelineIndex(status: string | undefined): number {
  const s = status || 'draft'
  if (s === 'overpaid') return TIMELINE_ORDER.indexOf('paid') // treat overpaid as paid for timeline position
  const i = TIMELINE_ORDER.indexOf(s)
  return i >= 0 ? i : 0
}

function applyInvoiceEmailTemplate(template: string, invoiceNumber: string): string {
  return String(template || '').replace(/\{invoice_number\}/g, invoiceNumber)
}

export default function InvoicePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const company = params?.company as string
  const id = params?.id as string

  const fromParam = searchParams.get('from')
  const clientIdParam = searchParams.get('clientId')
  const clientNameParam = searchParams.get('clientName')

  const backHref =
    fromParam === 'client' && clientIdParam
      ? `/clients/${clientIdParam}`
      : company
      ? `/${company}/jobs/completed`
      : '/jobs/completed'

  const backLabel =
    fromParam === 'client'
      ? `Back to ${clientNameParam ? decodeURIComponent(clientNameParam) : 'client'}`
      : 'Back to Completed'
  const [invoice, setInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [sendConfirmStep, setSendConfirmStep] = useState<'form' | 'confirm'>('form')
  const [sendTo, setSendTo] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [sendBody, setSendBody] = useState('')
  const [sendCc, setSendCc] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [pdfDownloading, setPdfDownloading] = useState(false)
  const [paymentReceivedModalOpen, setPaymentReceivedModalOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentSource, setPaymentSource] = useState('bank')
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [onlineInvoiceLoading, setOnlineInvoiceLoading] = useState(false)
  const [eInvoice, setEInvoice] = useState<PublicInvoicePayload | null>(null)
  const [hasPaymentMethods, setHasPaymentMethods] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || !id) {
      setLoading(false)
      setError(!id ? 'Invalid invoice' : 'Not authenticated')
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch(apiUrl(`/invoices/${id}`), {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
      fetch(apiUrl(`/invoices/${id}/e-invoice`), {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
    ])
      .then(([invData, eData]) => {
        if (cancelled) return
        if (invData.invoice) setInvoice(invData.invoice)
        else setError(invData.error || 'Invoice not found')
        if (eData.invoice) {
          setEInvoice(eData.invoice)
          setHasPaymentMethods(Boolean(eData.hasPaymentMethods))
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load invoice')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const openSendModal = () => {
    setSendConfirmStep('form')
    const email = (invoice?.billing_email || invoice?.email || '').trim()
    setSendTo(email)
    setSendSubject('')
    setSendBody('')
    setSendCc('')
    setSendError(null)
    setSendModalOpen(true)
    const invNo = String(invoice?.invoice_number ?? invoice?.id ?? '')
    const isReminder = (invoice?.status || '') === 'sent'
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(apiUrl('/companies/invoice-defaults'), { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        const d = data.defaults
        if (!d) return
        if (isReminder) {
          setSendSubject(applyInvoiceEmailTemplate(d.invoiceReminderDefaultSubject || '', invNo))
          setSendBody(d.invoiceReminderDefaultBody || '')
        } else {
          setSendSubject(applyInvoiceEmailTemplate(d.invoiceEmailDefaultSubject || '', invNo))
          setSendBody(d.invoiceEmailDefaultBody || '')
        }
      })
      .catch(() => {})
  }

  const handleSendInvoice = async () => {
    const to = sendTo.trim()
    if (!to) {
      setSendError('Please enter a recipient email.')
      return
    }
    const token = localStorage.getItem('token')
    if (!token || !id) return
    setSending(true)
    setSendError(null)
    try {
      const url = apiUrl(`/invoices/${id}/send`)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to,
          subject: sendSubject.trim() || undefined,
          text: sendBody.trim() || undefined,
          cc: sendCc.trim() || undefined,
        }),
      })
      const text = await res.text()
      let data: { success?: boolean; error?: string } = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        if (text.startsWith('<') || text.toLowerCase().includes('<!doctype')) {
          setSendError(
            'Server returned a web page instead of JSON. The API may be unreachable. ' +
            'Ensure the api-server is running (e.g. port 8000) and, if needed, set NEXT_PUBLIC_API_URL=http://localhost:8000'
          )
        } else {
          setSendError('Invalid response from server. Please try again.')
        }
        return
      }
      if (res.ok && data.success) {
        setInvoice((prev: any) => (prev ? { ...prev, status: 'sent', sent_at: data.sent_at ?? new Date().toISOString() } : prev))
        setSendModalOpen(false)
        setSendConfirmStep('form')
      } else {
        setSendError(data.error || 'Failed to send email')
      }
    } catch (e) {
      console.error(e)
      setSendError('Failed to send email. Check the console and ensure the API server is running.')
    } finally {
      setSending(false)
    }
  }

  const openPaymentReceivedModal = () => {
    setPaymentAmount(String(invoice?.total ?? ''))
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentSource('bank')
    setPaymentError(null)
    setPaymentReceivedModalOpen(true)
  }

  const handlePaymentReceived = async () => {
    const amount = paymentAmount.trim()
    if (!amount) {
      setPaymentError('Please enter the amount paid.')
      return
    }
    const num = parseFloat(amount)
    if (isNaN(num) || num < 0) {
      setPaymentError('Please enter a valid amount.')
      return
    }
    const dateStr = paymentDate.trim()
    if (!dateStr) {
      setPaymentError('Please select the payment date.')
      return
    }
    const token = localStorage.getItem('token')
    if (!token || !id) return
    setPaymentSubmitting(true)
    setPaymentError(null)
    try {
      const res = await fetch(apiUrl(`/invoices/${id}/transactions`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'payment',
          amount: num,
          transaction_date: new Date(dateStr).toISOString(),
          payment_source: paymentSource,
        }),
      })
      const text = await res.text()
      let data: { transaction?: unknown; balance?: number; status?: string; error?: string } = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        if (text.startsWith('<') || text.toLowerCase().includes('<!doctype')) {
          setPaymentError(
            'The server returned a web page instead of data. Make sure your API server is running and supports the payment endpoint (run "node setup-database.js" once to create the required table, then restart the server).'
          )
        } else {
          setPaymentError('Invalid response from server. Please try again.')
        }
        return
      }
      if (res.ok && data.transaction != null) {
        setInvoice((prev: any) => {
          if (!prev) return prev
          const transactions = [...(prev.transactions || []), data.transaction]
          return { ...prev, transactions, balance: data.balance, status: data.status }
        })
        setPaymentReceivedModalOpen(false)
      } else {
        setPaymentError(data.error || 'Failed to record payment')
      }
    } catch (e) {
      console.error(e)
      setPaymentError('Failed to record payment. Check your connection and that the API server is running.')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  const handleDownloadPdf = async () => {
    const token = localStorage.getItem('token')
    if (!token || !id) return
    setPdfDownloading(true)
    try {
      const res = await fetch(apiUrl(`/invoices/${id}/pdf`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to download PDF')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${invoice?.invoice_number || id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('Failed to download PDF')
    } finally {
      setPdfDownloading(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            <p className="mt-2 text-sm text-gray-500">Loading invoice...</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || !invoice) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-red-600">{error || 'Invoice not found'}</p>
          <Link
            href={backHref}
            className="mt-4 inline-flex items-center text-sm text-accent-600 hover:text-accent-700"
          >
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            {backLabel}
          </Link>
        </div>
      </AppLayout>
    )
  }

  const total = Number(invoice.total) || 0
  const currency = invoice.currency || 'DKK'
  const transactions = invoice.transactions || []
  const balance = invoice.balance !== undefined && invoice.balance !== null
    ? Number(invoice.balance)
    : (() => {
        let b = total
        transactions.forEach((t: any) => {
          if (t.type === 'charge') b += Number(t.amount) || 0
          else if (t.type === 'payment') b -= Number(t.amount) || 0
        })
        return Math.round(b * 100) / 100
      })()

  const isDraft = (invoice.status || 'draft') === 'draft'
  const cannotLeaveDraftWithoutPayments = isDraft && !hasPaymentMethods

  const openOnlineInvoice = async () => {
    const token = localStorage.getItem('token')
    if (!token || !id) return
    if ((invoice?.status || 'draft') === 'draft') {
      window.open(`${window.location.origin}/${company}/invoices/${id}/preview`, '_blank', 'noopener,noreferrer')
      return
    }
    setOnlineInvoiceLoading(true)
    try {
      const res = await fetch(apiUrl(`/invoices/${id}/online-link`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not open online invoice')
      const path = typeof data.path === 'string' ? data.path : ''
      if (!path.startsWith('/')) throw new Error('Invalid response')
      window.open(`${window.location.origin}${path}`, '_blank', 'noopener,noreferrer')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not open online invoice')
    } finally {
      setOnlineInvoiceLoading(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === (invoice?.status || '')) return
    const token = localStorage.getItem('token')
    if (!token || !id) return
    setStatusUpdating(true)
    try {
      const res = await fetch(apiUrl(`/invoices/${id}/status`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (res.ok && data.invoice) {
        setInvoice((prev: any) => (prev ? { ...prev, status: data.invoice.status } : prev))
      } else {
        alert(data.error || 'Failed to update status')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to update status')
    } finally {
      setStatusUpdating(false)
    }
  }

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={backHref}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            {backLabel}
          </Link>
        </div>

        <div className="flex gap-8">
          {/* Invoice document – professional layout (based on example) */}
          <div className="min-w-0 flex-1">
            {/* Status timeline – full width, connecting lines, modern progress */}
            {(() => {
              const currentStatus = invoice.status || 'draft'
              const currentIndex = timelineIndex(currentStatus)
              const dueDate = invoice.due_date
              const daysUntilOverdue = dueDate
                ? Math.ceil((new Date(dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
                : null
              const overdueLabel =
                daysUntilOverdue === null
                  ? null
                  : daysUntilOverdue > 0
                    ? `${daysUntilOverdue} day${daysUntilOverdue === 1 ? '' : 's'} until overdue`
                    : daysUntilOverdue === 0
                      ? 'Due today'
                      : `${Math.abs(daysUntilOverdue)} day${daysUntilOverdue === -1 ? '' : 's'} overdue`

              return (
                <div className="mb-8 w-full">
                  <nav className="flex w-full items-start gap-0" aria-label="Invoice status">
                    {TIMELINE_ORDER.map((value, index) => {
                      const isOverpaid = currentStatus === 'overpaid'
                      const displayLabel = value === 'paid' && isOverpaid ? 'Overpaid' : (INVOICE_STATUSES.find((s) => s.value === value)?.label ?? value)
                      const isActive = currentIndex === index || (value === 'paid' && isOverpaid)
                      const isPast = currentIndex > index && !(value === 'paid' && isOverpaid)
                      const isFuture = currentIndex < index
                      const showSentDate = value === 'sent' && (isPast || isActive) && invoice.sent_at
                      const showOverdueDate = value === 'overdue' && dueDate
                      const isLast = index === TIMELINE_ORDER.length - 1
                      const segmentIndex = index
                      const showHalfwayDot = segmentIndex === 1 && currentIndex === 1 && currentStatus === 'sent'
                      const paidIsBlue = value === 'paid' && isOverpaid

                      return (
                        <React.Fragment key={value}>
                          <div className="flex flex-shrink-0 flex-col items-center">
                            <span
                              className={`inline-flex items-center rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors ${
                                paidIsBlue
                                  ? 'border-blue-500 text-blue-700'
                                  : isActive
                                  ? 'border-accent-500 text-accent-700'
                                  : isPast
                                  ? 'border-accent-500 text-gray-700'
                                  : 'border-gray-200 text-gray-400'
                              }`}
                            >
                              {displayLabel}
                            </span>
                            {showSentDate && (
                              <span className="mt-1.5 text-xs font-medium text-gray-500">
                                {formatDate(invoice.sent_at)}
                              </span>
                            )}
                            {showOverdueDate && (
                              <span className="mt-1.5 text-xs font-medium text-gray-500">
                                {formatDate(dueDate)}
                              </span>
                            )}
                          </div>
                          {!isLast && (
                            <div
                              className={`relative flex min-w-0 flex-1 items-center px-1 pt-5 ${showHalfwayDot ? 'pb-8' : ''}`}
                            >
                              <div className="h-0.5 w-full flex-1 rounded-full bg-gray-200" aria-hidden />
                              {segmentIndex === 0 && (
                                <div
                                  className="absolute left-0 top-5 h-0.5 rounded-l-full bg-accent-400"
                                  style={{ width: currentIndex >= 1 ? '100%' : '0%' }}
                                />
                              )}
                              {segmentIndex === 1 && (
                                <>
                                  <div
                                    className="absolute left-0 top-5 h-0.5 rounded-full bg-accent-400"
                                    style={{
                                      width: currentIndex >= 2 ? '100%' : currentIndex === 1 ? '50%' : '0%',
                                    }}
                                  />
                                  {showHalfwayDot && (
                                    <div className="absolute left-1/2 top-5 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                                      <span className="h-3 w-3 rounded-full border-2 border-accent-500 bg-white shadow-sm" />
                                      {overdueLabel && (
                                        <span className="mt-3 whitespace-nowrap text-xs font-medium text-gray-600">
                                          {overdueLabel}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                              {segmentIndex === 2 && (
                                <div
                                  className="absolute left-0 top-5 h-0.5 rounded-l-full bg-accent-400"
                                  style={{ width: currentIndex >= 3 ? '100%' : '0%' }}
                                />
                              )}
                            </div>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </nav>
                </div>
              )
            })()}

            {eInvoice ? (
              <div className="overflow-hidden rounded-xl border border-gray-200/80 shadow-sm ring-1 ring-black/5">
                <DigitalInvoiceView
                  data={eInvoice}
                  variant="admin"
                  extensionsHref={company ? `/${company}/settings/extensions` : '/settings/extensions'}
                  adminPaymentMissing={!hasPaymentMethods}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
                Could not load the digital invoice preview. Try refreshing the page.
              </div>
            )}
          </div>

          {/* Right column: balance timeline / overview, then actions */}
          <div className="flex w-64 flex-shrink-0 flex-col gap-4">

            {/* Client card */}
            {invoice.client_id && (
              <Link
                href={`/clients/${invoice.client_id}`}
                className="block rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden hover:border-gray-300 hover:shadow-md transition-all group"
              >
                <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Client</p>
                  <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-2">{invoice.client_name || '—'}</p>
                  <div className="space-y-1.5">
                    {(invoice.billing_email || invoice.email) && (
                      <div className="flex items-start gap-2 text-xs text-gray-500">
                        <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="break-all">{invoice.billing_email || invoice.email}</span>
                      </div>
                    )}
                    {(invoice.billing_phone || invoice.phone) && (
                      <div className="flex items-start gap-2 text-xs text-gray-500">
                        <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span>{invoice.billing_phone || invoice.phone}</span>
                      </div>
                    )}
                    {(invoice.address || invoice.city) && (
                      <div className="flex items-start gap-2 text-xs text-gray-500">
                        <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{[invoice.address, invoice.zip_code, invoice.city].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )}

            {/* Balance timeline – what they owed, payments/charges, current balance */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Balance overview</p>
              </div>
              <div className="p-4 space-y-0">
                {/* Opening: invoice total */}
                <div className="flex items-center justify-between gap-2 py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Invoice total</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">+ {formatNumber(total)} {currency}</span>
                </div>
                {/* Running balance after each transaction */}
                {transactions.length === 0 ? (
                  <div className="py-2 text-sm text-gray-400">No payments or extra charges yet.</div>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {transactions.map((t: any) => {
                      const amt = Number(t.amount) || 0
                      const isPayment = t.type === 'payment'
                      const label = isPayment
                        ? (t.description || 'Payment') + (t.payment_source ? ` (${t.payment_source})` : '')
                        : (t.description || 'Charge')
                      const dateStr = t.transaction_date ? formatDate(t.transaction_date) : ''
                      return (
                        <li key={t.id} className="flex flex-col gap-0.5 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-gray-700 truncate" title={label}>{label}</span>
                            <span className={`text-sm font-medium tabular-nums shrink-0 ${isPayment ? 'text-green-600' : 'text-amber-600'}`}>
                              {isPayment ? '−' : '+'} {formatNumber(amt)} {currency}
                            </span>
                          </div>
                          {dateStr && <span className="text-xs text-gray-400">{dateStr}</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {/* Current balance */}
                <div className={`mt-4 pt-4 border-t-2 rounded-lg px-3 py-3 ${
                  balance > 0 ? 'border-gray-200 bg-gray-50' : balance < 0 ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'
                }`}>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-0.5">Current balance</p>
                  {balance > 0 ? (
                    <p className="text-lg font-bold text-gray-900 tabular-nums">{formatNumber(balance)} {currency} <span className="text-sm font-normal text-gray-600">owed</span></p>
                  ) : balance < 0 ? (
                    <p className="text-lg font-bold text-blue-700 tabular-nums">{formatNumber(Math.abs(balance))} {currency} <span className="text-sm font-normal text-blue-600">we owe you</span></p>
                  ) : (
                    <p className="text-lg font-bold text-green-700 tabular-nums">Paid off</p>
                  )}
                </div>
                <div className="mt-4 pt-2">
                  <button
                    type="button"
                    onClick={openOnlineInvoice}
                    disabled={onlineInvoiceLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary-600/25 bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
                  >
                    <GlobeAltIcon className="h-5 w-5" aria-hidden />
                    {onlineInvoiceLoading
                      ? 'Opening…'
                      : isDraft
                        ? 'Preview e-invoice'
                        : 'Online invoice'}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-gray-500 leading-snug">
                    {isDraft
                      ? 'Staff-only preview (same as the client view). No public link until the invoice is sent.'
                      : 'Opens the secure page your client can use to view this invoice and pay with your enabled methods.'}
                  </p>
                </div>
              </div>
            </div>

            {(invoice.status === 'sent' || invoice.status === 'overdue') && balance > 0 && (
              <button
                type="button"
                onClick={openPaymentReceivedModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent-500 bg-accent-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
              >
                <BanknotesIcon className="h-5 w-5" />
                Payment received
              </button>
            )}
            {(invoice.status === 'draft' || !invoice.status) && (
              <Link
                href={`/${company}/invoices/${id}/edit`}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
              >
                <PencilSquareIcon className="h-5 w-5" />
                Edit
              </Link>
            )}
            <button
              type="button"
              onClick={openSendModal}
              disabled={cannotLeaveDraftWithoutPayments && invoice.status !== 'sent'}
              title={
                cannotLeaveDraftWithoutPayments && invoice.status !== 'sent'
                  ? 'Enable at least one payment method in Extensions before sending.'
                  : undefined
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent-600 bg-accent-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PaperAirplaneIcon className="h-5 w-5" aria-hidden />
              {invoice.status === 'sent' ? 'Send reminder' : 'Complete and send'}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfDownloading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="h-5 w-5" aria-hidden />
              {pdfDownloading ? 'Downloading…' : 'Download as PDF'}
            </button>
          </div>
        </div>

        {/* Send to client modal */}
        {sendModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
              {sendConfirmStep === 'confirm' ? (
                <>
                  <h2 className="text-lg font-semibold text-gray-900">Are you sure?</h2>
                  <p className="mt-2 text-sm text-gray-600">
                    Once you send this invoice, there is no going back. The invoice will be marked as sent and cannot be edited. The invoice is final as is.
                  </p>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSendConfirmStep('form')}
                      disabled={sending}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Go back
                    </button>
                    <button
                      type="button"
                      onClick={handleSendInvoice}
                      disabled={sending}
                      className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                    >
                      {sending ? (
                        <>
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Sending…
                        </>
                      ) : (
                        <>
                          <PaperAirplaneIcon className="h-4 w-4" />
                          Yes, send
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
              <h2 className="text-lg font-semibold text-gray-900">
                {invoice?.status === 'sent' ? 'Send reminder to client' : 'Send invoice to client'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {invoice?.status === 'sent'
                  ? 'Sends another email with a link to the e-invoice. Add an optional reminder message.'
                  : 'Sends an email in the same style as booking confirmations, with a button to open the e-invoice (no PDF). You can edit the subject and message.'}
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">To (email)</label>
                  <input
                    type="email"
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                    placeholder="client@example.com"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Subject</label>
                  <input
                    type="text"
                    value={sendSubject}
                    onChange={(e) => setSendSubject(e.target.value)}
                    placeholder="e.g. Invoice #123"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Message</label>
                  <textarea
                    value={sendBody}
                    onChange={(e) => setSendBody(e.target.value)}
                    placeholder="Optional message to include in the email..."
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">CC (optional)</label>
                  <input
                    type="email"
                    value={sendCc}
                    onChange={(e) => setSendCc(e.target.value)}
                    placeholder="another@example.com"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                </div>
              </div>
              {sendError && (
                <p className="mt-3 text-sm text-red-600">{sendError}</p>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setSendModalOpen(false); setSendConfirmStep('form') }}
                  disabled={sending}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const to = sendTo.trim()
                    if (!to) {
                      setSendError('Please enter a recipient email.')
                      return
                    }
                    setSendError(null)
                    setSendConfirmStep('confirm')
                  }}
                  disabled={sending}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  Send
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Payment received modal – only when status is overdue */}
        {paymentReceivedModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-gray-900">Payment received</h2>
              <p className="mt-1 text-sm text-gray-500">
                Record how much was paid and when. The invoice will be marked as paid.
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount paid</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                  {invoice?.currency && (
                    <p className="mt-0.5 text-xs text-gray-500">{invoice.currency}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Payment date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Where did this money come to?</label>
                  <select
                    value={paymentSource}
                    onChange={(e) => setPaymentSource(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  >
                    <option value="bank">Bank</option>
                  </select>
                </div>
              </div>
              {paymentError && (
                <p className="mt-3 text-sm text-red-600">{paymentError}</p>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentReceivedModalOpen(false)}
                  disabled={paymentSubmitting}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePaymentReceived}
                  disabled={paymentSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                >
                  {paymentSubmitting ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Recording…
                    </>
                  ) : (
                    <>
                      <BanknotesIcon className="h-4 w-4" />
                      Mark as paid
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  )
}
