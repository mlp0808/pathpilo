'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import { apiUrl } from '@/app/utils/api'
import Link from 'next/link'
import { ArrowLeftIcon, PaperAirplaneIcon, ArrowDownTrayIcon, PencilSquareIcon, BanknotesIcon, BellAlertIcon, EyeIcon } from '@heroicons/react/24/outline'
import { SettingsToggle } from '@/app/components/settings/SettingsUI'
import { DigitalInvoiceView, type PublicInvoicePayload } from '@/app/components/DigitalInvoiceView'
import { useAppI18n } from '@/app/components/I18nProvider'
import type { MessageKey } from '@/app/i18n'

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
  { value: 'draft', labelKey: 'invoice.detail.statusDraft' as MessageKey, fallback: 'Draft' },
  { value: 'sent', labelKey: 'invoice.detail.statusSent' as MessageKey, fallback: 'Sent' },
  { value: 'overdue', labelKey: 'invoice.detail.statusOverdue' as MessageKey, fallback: 'Overdue' },
  { value: 'paid', labelKey: 'invoice.detail.statusPaid' as MessageKey, fallback: 'Paid' },
] as const

const TIMELINE_ORDER: readonly string[] = ['draft', 'sent', 'overdue', 'paid']

function timelineIndex(status: string | undefined): number {
  const s = status || 'draft'
  if (s === 'overpaid') return TIMELINE_ORDER.indexOf('paid') // treat overpaid as paid for timeline position
  const i = TIMELINE_ORDER.indexOf(s)
  return i >= 0 ? i : 0
}

/** Same placeholders as server (Settings → Messages → First invoice email). */
function applySendInvoicePlaceholders(
  template: string,
  ctx: { invoiceNumber: string; companyName: string; clientFirstName: string }
): string {
  return String(template || '')
    .replace(/\{invoice_number\}/g, ctx.invoiceNumber)
    .replace(/\{Company name\}/g, ctx.companyName)
    .replace(/\{Client first name\}/g, ctx.clientFirstName)
}

export default function InvoicePage() {
  const { t } = useAppI18n()
  const tr = (key: MessageKey, fallback?: string) => t(key, fallback)
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
      ? `/${company}/jobs`
      : '/jobs'

  const backLabel =
    fromParam === 'client'
      ? tr('invoice.detail.backToClient', 'Back to {name}').replace(
          '{name}',
          clientNameParam ? decodeURIComponent(clientNameParam) : tr('invoice.detail.backToClientDefault', 'client'),
        )
      : tr('invoice.detail.backToJobs', 'Back to Jobs')
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
  const [paymentSource, setPaymentSource] = useState('bank_transfer')
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [onlineInvoiceLoading, setOnlineInvoiceLoading] = useState(false)
  const [eInvoice, setEInvoice] = useState<PublicInvoicePayload | null>(null)
  const [hasPaymentMethods, setHasPaymentMethods] = useState(true)
  const [pendingInvoiceReminder, setPendingInvoiceReminder] = useState<{ sendAt: string } | null>(null)
  const [manualReminderLoading, setManualReminderLoading] = useState(false)
  const [manualReminderMessage, setManualReminderMessage] = useState<
    { tone: 'success' | 'error'; text: string } | null
  >(null)
  const [dueReminderAutomation, setDueReminderAutomation] = useState<{
    enabled: boolean
    lead_value: number
    lead_unit: 'hours' | 'minutes'
  } | null>(null)
  const [automationToggling, setAutomationToggling] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || !id) {
      setLoading(false)
      setError(!id ? tr('invoice.detail.invalidInvoice', 'Invalid invoice') : tr('invoice.detail.notAuthenticated', 'Not authenticated'))
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
      fetch(apiUrl('/email-templates'), {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
    ])
      .then(([invData, eData, tplData]) => {
        if (cancelled) return
        if (invData.invoice) {
          setInvoice(invData.invoice)
          setPendingInvoiceReminder(invData.pendingInvoiceReminder ?? null)
        } else setError(invData.error || tr('invoice.detail.notFound', 'Invoice not found'))
        if (eData.invoice) {
          setEInvoice(eData.invoice)
          setHasPaymentMethods(Boolean(eData.hasPaymentMethods))
        }
        const reminderSetting = tplData?.automationSettings?.email_invoice_due_reminder
        setDueReminderAutomation({
          enabled: Boolean(reminderSetting?.enabled),
          lead_value: Number(reminderSetting?.lead_value) || 48,
          lead_unit: reminderSetting?.lead_unit === 'minutes' ? 'minutes' : 'hours',
        })
      })
      .catch(() => {
        if (!cancelled) setError(tr('invoice.detail.failedLoad', 'Failed to load invoice'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const openSendModal = () => {
    if ((invoice?.status || 'draft') !== 'draft') return
    setSendConfirmStep('form')
    const email = (invoice?.billing_email || invoice?.email || '').trim()
    setSendTo(email)
    setSendSubject('')
    setSendBody('')
    setSendCc('')
    setSendError(null)
    setSendModalOpen(true)
    const invNo = String(
      invoice?.invoice_number_display || invoice?.invoice_number || invoice?.id || '',
    )
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(apiUrl('/email-templates'), { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        const si = data.templates?.send_invoice
        if (!si) return
        const companyName = String(invoice?.company_name ?? '')
        const first = String(invoice?.name ?? '').trim()
        const ctx = { invoiceNumber: invNo, companyName, clientFirstName: first }
        setSendSubject(applySendInvoicePlaceholders(si.subject || '', ctx))
        setSendBody(applySendInvoicePlaceholders(si.message || '', ctx))
      })
      .catch(() => {})
  }

  const refreshInvoiceReminderStatus = async () => {
    const token = localStorage.getItem('token')
    if (!token || !id) return
    try {
      const res = await fetch(apiUrl(`/invoices/${id}`), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.invoice) setPendingInvoiceReminder(data.pendingInvoiceReminder ?? null)
    } catch {
      /* ignore */
    }
  }

  const handleToggleDueReminderAutomation = async (next: boolean) => {
    if (!dueReminderAutomation) return
    const token = localStorage.getItem('token')
    if (!token) return

    const prev = dueReminderAutomation
    setDueReminderAutomation({ ...prev, enabled: next })
    setAutomationToggling(true)
    try {
      const res = await fetch(apiUrl('/email-templates'), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationSettings: {
            email_invoice_due_reminder: {
              enabled: next,
              lead_value: prev.lead_value,
              lead_unit: prev.lead_unit,
            },
          },
        }),
      })
      if (!res.ok) {
        setDueReminderAutomation(prev)
        return
      }
      await refreshInvoiceReminderStatus()
    } catch {
      setDueReminderAutomation(prev)
    } finally {
      setAutomationToggling(false)
    }
  }

  const handleSendReminderNow = async () => {
    const token = localStorage.getItem('token')
    if (!token || !id) return
    setManualReminderLoading(true)
    setManualReminderMessage(null)
    try {
      const res = await fetch(apiUrl(`/invoices/${id}/send-reminder`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setManualReminderMessage({
          tone: 'success',
          text: data.sentTo
            ? tr('invoice.detail.notificationSentTo', 'Notification sent to {email}.').replace('{email}', String(data.sentTo))
            : tr('invoice.detail.notificationSent', 'Notification sent.'),
        })
        if (data.sentAt) {
          setInvoice((prev: any) =>
            prev ? { ...prev, last_manual_reminder_at: data.sentAt } : prev,
          )
        }
      } else {
        setManualReminderMessage({
          tone: 'error',
          text: data.error || tr('invoice.detail.notificationFailed', 'Failed to send notification.'),
        })
      }
    } catch {
      setManualReminderMessage({
        tone: 'error',
        text: tr('invoice.detail.networkError', 'Network error — please try again.'),
      })
    } finally {
      setManualReminderLoading(false)
    }
  }

  const handleSendInvoice = async () => {
    const to = sendTo.trim()
    if (!to) {
      setSendError(tr('invoice.detail.enterEmail', 'Please enter a recipient email.'))
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
          cc: sendCc.trim() || undefined,
        }),
      })
      const text = await res.text()
      let data: { success?: boolean; error?: string } = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        if (text.startsWith('<') || text.toLowerCase().includes('<!doctype')) {
          setSendError(tr('invoice.detail.serverHtmlError', 'Server returned a web page instead of JSON. The API may be unreachable. Ensure the api-server is running (e.g. port 8000) and, if needed, set NEXT_PUBLIC_API_URL=http://localhost:8000'))
        } else {
          setSendError(tr('invoice.detail.invalidResponse', 'Invalid response from server. Please try again.'))
        }
        return
      }
      if (res.ok && data.success) {
        setInvoice((prev: any) => (prev ? { ...prev, status: 'sent', sent_at: data.sent_at ?? new Date().toISOString() } : prev))
        setSendModalOpen(false)
        setSendConfirmStep('form')
        await refreshInvoiceReminderStatus()
      } else {
        setSendError(data.error || tr('invoice.detail.failedSendEmail', 'Failed to send email'))
      }
    } catch (e) {
      console.error(e)
      setSendError(tr('invoice.detail.failedSendEmailConsole', 'Failed to send email. Check the console and ensure the API server is running.'))
    } finally {
      setSending(false)
    }
  }

  const openPaymentReceivedModal = () => {
    setPaymentAmount(String(invoice?.total ?? ''))
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentSource('bank_transfer')
    setPaymentError(null)
    setPaymentReceivedModalOpen(true)
  }

  const handlePaymentReceived = async () => {
    const amount = paymentAmount.trim()
    if (!amount) {
      setPaymentError(tr('invoice.detail.enterAmount', 'Please enter the amount paid.'))
      return
    }
    const num = parseFloat(amount)
    if (isNaN(num) || num < 0) {
      setPaymentError(tr('invoice.detail.validAmount', 'Please enter a valid amount.'))
      return
    }
    const dateStr = paymentDate.trim()
    if (!dateStr) {
      setPaymentError(tr('invoice.detail.selectDate', 'Please select the payment date.'))
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
          setPaymentError(tr('invoice.detail.serverDatabaseError', 'The server returned a web page instead of data. Make sure your API server is running and supports the payment endpoint (run "node setup-database.js" once to create the required table, then restart the server).'))
        } else {
          setPaymentError(tr('invoice.detail.invalidResponse', 'Invalid response from server. Please try again.'))
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
        if (data.balance !== undefined && data.balance <= 0) setPendingInvoiceReminder(null)
        else await refreshInvoiceReminderStatus()
      } else {
        setPaymentError(data.error || tr('invoice.detail.failedRecordPayment', 'Failed to record payment'))
      }
    } catch (e) {
      console.error(e)
      setPaymentError(tr('invoice.detail.failedRecordPaymentNet', 'Failed to record payment. Check your connection and that the API server is running.'))
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
        alert(data.error || tr('invoice.detail.failedDownloadPdf', 'Failed to download PDF'))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${invoice?.invoice_number_display || invoice?.invoice_number || id}.pdf`
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
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            <p className="mt-2 text-sm text-gray-500">{tr('invoice.detail.loading', 'Loading invoice...')}</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || !invoice) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-red-600">{error || tr('invoice.detail.notFound', 'Invoice not found')}</p>
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
      if (!res.ok) throw new Error(data.error || tr('invoice.detail.couldNotOpenOnline', 'Could not open online invoice'))
      const path = typeof data.path === 'string' ? data.path : ''
      if (!path.startsWith('/')) throw new Error(tr('invoice.detail.invalidResponse', 'Invalid response from server. Please try again.'))
      window.open(`${window.location.origin}${path}`, '_blank', 'noopener,noreferrer')
    } catch (e) {
      alert(e instanceof Error ? e.message : tr('invoice.detail.couldNotOpenOnline', 'Could not open online invoice'))
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
        alert(data.error || tr('invoice.detail.failedUpdateStatus', 'Failed to update status'))
      }
    } catch (e) {
      console.error(e)
      alert(tr('invoice.detail.failedUpdateStatus', 'Failed to update status'))
    } finally {
      setStatusUpdating(false)
    }
  }

  const notificationsHref = company ? `/${company}/settings/notifications` : '/settings/notifications'

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
        ? tr(
            daysUntilOverdue === 1 ? 'invoice.detail.daysUntilOverdueOne' : 'invoice.detail.daysUntilOverdueMany',
            daysUntilOverdue === 1 ? '{n} day until overdue' : '{n} days until overdue',
          ).replace('{n}', String(daysUntilOverdue))
        : daysUntilOverdue === 0
          ? tr('invoice.detail.dueToday', 'Due today')
          : tr(
              daysUntilOverdue === -1 ? 'invoice.detail.daysOverdueOne' : 'invoice.detail.daysOverdueMany',
              daysUntilOverdue === -1 ? '{n} day overdue' : '{n} days overdue',
            ).replace('{n}', String(Math.abs(daysUntilOverdue)))

  const showPaymentReceived =
    (invoice.status === 'sent' || invoice.status === 'overdue') && balance > 0
  const showSendNotification =
    !isDraft && balance > 0 && (invoice.status === 'sent' || invoice.status === 'overdue')

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

        {/* Status timeline — full width above invoice + sidebar */}
        <div className="mb-8 w-full">
          <nav className="flex w-full items-start gap-0" aria-label={tr('invoice.detail.ariaStatus', 'Invoice status')}>
            {TIMELINE_ORDER.map((value, index) => {
              const isOverpaid = currentStatus === 'overpaid'
              const statusRow = INVOICE_STATUSES.find((s) => s.value === value)
              const displayLabel = value === 'paid' && isOverpaid
                ? tr('invoice.detail.statusOverpaid', 'Overpaid')
                : (statusRow ? tr(statusRow.labelKey, statusRow.fallback) : value)
              const isActive = currentIndex === index || (value === 'paid' && isOverpaid)
              const isPast = currentIndex > index && !(value === 'paid' && isOverpaid)
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

        <div className="flex gap-8">
          {/* Invoice document */}
          <div className="min-w-0 flex-1">
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
                {tr('invoice.detail.previewUnavailable', 'Could not load the digital invoice preview. Try refreshing the page.')}
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
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{tr('invoice.detail.client', 'Client')}</p>
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
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{tr('invoice.detail.balanceOverview', 'Balance overview')}</p>
              </div>
              <div className="p-4 space-y-0">
                {/* Opening: invoice total */}
                <div className="flex items-center justify-between gap-2 py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">{tr('invoice.detail.invoiceTotal', 'Invoice total')}</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">+ {formatNumber(total)} {currency}</span>
                </div>
                {/* Running balance after each transaction */}
                {transactions.length === 0 ? (
                  <div className="py-2 text-sm text-gray-400">{tr('invoice.detail.noTransactions', 'No payments or extra charges yet.')}</div>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {transactions.map((tx: any) => {
                      const amt = Number(tx.amount) || 0
                      const isPayment = tx.type === 'payment'
                      const sourceLabel = (() => {
                        const map: Record<string, string> = {
                          bank_transfer: tr('invoice.detail.paymentSource.bankTransfer', 'Bank transfer'),
                          mobilepay: tr('invoice.detail.paymentSource.mobilepay', 'MobilePay'),
                          card: tr('invoice.detail.paymentSource.card', 'Card'),
                          cash: tr('invoice.detail.paymentSource.cash', 'Cash'),
                          check: tr('invoice.detail.paymentSource.check', 'Check'),
                          other: tr('invoice.detail.paymentSource.other', 'Other'),
                          // Legacy values from before the structured enum.
                          bank: tr('invoice.detail.paymentSource.bankTransfer', 'Bank transfer'),
                        }
                        const key = String(tx.payment_source || '').toLowerCase()
                        return map[key] || tx.payment_source || ''
                      })()
                      const label = isPayment
                        ? (tx.description || tr('invoice.detail.transaction.payment', 'Payment')) + (sourceLabel ? ` (${sourceLabel})` : '')
                        : (tx.description || tr('invoice.detail.transaction.charge', 'Charge'))
                      const dateStr = tx.transaction_date ? formatDate(tx.transaction_date) : ''
                      return (
                        <li key={tx.id} className="flex flex-col gap-0.5 py-2.5">
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
                {/* Current balance — compact */}
                <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-500">{tr('invoice.detail.currentBalance', 'Current balance')}</span>
                  {balance > 0 ? (
                    <span className="text-sm font-semibold tabular-nums text-gray-900">
                      {formatNumber(balance)} {currency}{' '}
                      <span className="font-normal text-gray-500">{tr('invoice.detail.balanceOwed', 'owed')}</span>
                    </span>
                  ) : balance < 0 ? (
                    <span className="text-sm font-semibold tabular-nums text-blue-700">
                      {formatNumber(Math.abs(balance))} {currency}{' '}
                      <span className="font-normal text-blue-600">{tr('invoice.detail.balanceWeOwe', 'we owe you')}</span>
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-green-700">{tr('invoice.detail.paidOff', 'Paid off')}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                  {showPaymentReceived && (
                    <button
                      type="button"
                      onClick={openPaymentReceivedModal}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent-500 bg-accent-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
                    >
                      <BanknotesIcon className="h-5 w-5" />
                      {tr('invoice.detail.paymentReceived', 'Payment received')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openOnlineInvoice}
                    disabled={onlineInvoiceLoading}
                    className="inline-flex w-full items-center justify-center gap-1.5 text-sm font-medium text-accent-700 hover:text-accent-800 disabled:opacity-60"
                  >
                    <EyeIcon className="h-4 w-4" aria-hidden />
                    {onlineInvoiceLoading
                      ? tr('invoice.detail.opening', 'Opening…')
                      : isDraft
                        ? tr('invoice.detail.previewInvoice', 'Preview e-invoice')
                        : tr('invoice.detail.viewInvoice', 'View invoice')}
                  </button>
                </div>
              </div>
            </div>

            {(invoice.status === 'draft' || !invoice.status) && (
              <Link
                href={`/${company}/invoices/${id}/edit`}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
              >
                <PencilSquareIcon className="h-5 w-5" />
                {tr('invoice.detail.edit', 'Edit')}
              </Link>
            )}
            {isDraft && (
              <button
                type="button"
                onClick={openSendModal}
                disabled={cannotLeaveDraftWithoutPayments}
                title={
                  cannotLeaveDraftWithoutPayments
                    ? tr('invoice.detail.enablePaymentMethodWarn', 'Enable at least one payment method in Extensions before sending.')
                    : undefined
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent-600 bg-accent-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PaperAirplaneIcon className="h-5 w-5" aria-hidden />
                {tr('invoice.detail.completeAndSend', 'Complete and send')}
              </button>
            )}
            {showSendNotification && (
              <div className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3">
                <div className="flex items-start gap-2">
                  <BellAlertIcon className="h-5 w-5 shrink-0 text-gray-700 mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{tr('invoice.detail.sendNotification', 'Send notification')}</p>
                    <p className="text-xs text-gray-600 mt-0.5 leading-snug">
                      {tr('invoice.detail.sendNotificationDesc', 'Email the client a reminder right now. The scheduled automatic reminder still runs as planned.')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSendReminderNow}
                  disabled={manualReminderLoading}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PaperAirplaneIcon className="h-4 w-4" aria-hidden />
                  {manualReminderLoading ? tr('invoice.detail.sending', 'Sending…') : tr('invoice.detail.sendNotification', 'Send notification')}
                </button>
                {manualReminderMessage && (
                  <p
                    className={`mt-2 text-xs leading-snug ${
                      manualReminderMessage.tone === 'success' ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {manualReminderMessage.text}
                  </p>
                )}
                {!manualReminderMessage && invoice.last_manual_reminder_at && (
                  <p className="mt-2 text-[11px] text-gray-500">
                    {tr('invoice.detail.lastSent', 'Last sent {time}').replace(
                      '{time}',
                      new Date(invoice.last_manual_reminder_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    )}
                  </p>
                )}

                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">
                      {dueReminderAutomation?.enabled
                        ? tr('invoice.detail.automaticNotificationsOn', 'Automatic notifications')
                        : tr('invoice.detail.turnOnAutomatic', 'Turn on automatic notifications')}
                    </p>
                    <SettingsToggle
                      checked={dueReminderAutomation?.enabled ?? false}
                      onChange={handleToggleDueReminderAutomation}
                      disabled={automationToggling || dueReminderAutomation == null}
                      label={tr('invoice.detail.automaticNotificationsToggle', 'Automatic due-date reminders')}
                    />
                  </div>
                  <Link
                    href={notificationsHref}
                    className="mt-2 inline-block text-xs text-gray-400 transition-colors hover:text-gray-600"
                  >
                    {tr('invoice.detail.goToSettings', 'Go to settings')}
                  </Link>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfDownloading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="h-5 w-5" aria-hidden />
              {pdfDownloading ? tr('invoice.detail.downloading', 'Downloading…') : tr('invoice.detail.downloadPdf', 'Download as PDF')}
            </button>
          </div>
        </div>

        {/* Send to client modal */}
        {sendModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
              {sendConfirmStep === 'confirm' ? (
                <>
                  <h2 className="text-lg font-semibold text-gray-900">{tr('invoice.detail.areYouSure', 'Are you sure?')}</h2>
                  <p className="mt-2 text-sm text-gray-600">
                    {tr('invoice.detail.sendConfirm', 'Once you send this invoice, there is no going back. The invoice will be marked as sent and cannot be edited. The invoice is final as is.')}
                  </p>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSendConfirmStep('form')}
                      disabled={sending}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {tr('invoice.detail.goBack', 'Go back')}
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
                          {tr('invoice.detail.sending', 'Sending…')}
                        </>
                      ) : (
                        <>
                          <PaperAirplaneIcon className="h-4 w-4" />
                          {tr('invoice.detail.yesSend', 'Yes, send')}
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
              <h2 className="text-lg font-semibold text-gray-900">{tr('invoice.detail.sendTitle', 'Send invoice to client')}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {tr('invoice.detail.sendDescription', 'Sends an email with a button to open the e-invoice (no PDF). Subject and message come from your First invoice email template in Settings → Messages (placeholders filled for this client). After sending, you can schedule an automatic due reminder there too.')}
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{tr('invoice.detail.sendToLabel', 'To (email)')}</label>
                  <input
                    type="email"
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                    placeholder={tr('invoice.detail.sendToPlaceholder', 'client@example.com')}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{tr('invoice.detail.sendSubjectLabel', 'Subject (preview)')}</label>
                  <input
                    type="text"
                    readOnly
                    value={sendSubject}
                    placeholder={tr('invoice.detail.sendLoadingTemplate', 'Loading from template…')}
                    className="mt-1 w-full cursor-default rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{tr('invoice.detail.sendBodyLabel', 'Message (preview)')}</label>
                  <textarea
                    readOnly
                    value={sendBody}
                    placeholder={tr('invoice.detail.sendLoadingTemplate', 'Loading from template…')}
                    rows={4}
                    className="mt-1 w-full cursor-default resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{tr('invoice.detail.sendCcLabel', 'CC (optional)')}</label>
                  <input
                    type="email"
                    value={sendCc}
                    onChange={(e) => setSendCc(e.target.value)}
                    placeholder={tr('invoice.detail.sendCcPlaceholder', 'another@example.com')}
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
                  {tr('invoice.detail.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const to = sendTo.trim()
                    if (!to) {
                      setSendError(tr('invoice.detail.enterEmail', 'Please enter a recipient email.'))
                      return
                    }
                    setSendError(null)
                    setSendConfirmStep('confirm')
                  }}
                  disabled={sending}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  {tr('invoice.detail.sendBtn', 'Send')}
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
              <h2 className="text-lg font-semibold text-gray-900">{tr('invoice.detail.paymentTitle', 'Payment received')}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {tr('invoice.detail.paymentDesc', 'Record how much was paid and when. The invoice will be marked as paid.')}
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{tr('invoice.detail.amountPaid', 'Amount paid')}</label>
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
                  <label className="block text-sm font-medium text-gray-700">{tr('invoice.detail.paymentDate', 'Payment date')}</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {tr('invoice.detail.paymentSourceLabel', 'How was it paid?')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={paymentSource}
                    onChange={(e) => setPaymentSource(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  >
                    <option value="bank_transfer">{tr('invoice.detail.paymentSource.bankTransfer', 'Bank transfer')}</option>
                    <option value="mobilepay">{tr('invoice.detail.paymentSource.mobilepay', 'MobilePay')}</option>
                    <option value="card">{tr('invoice.detail.paymentSource.card', 'Card')}</option>
                    <option value="cash">{tr('invoice.detail.paymentSource.cash', 'Cash')}</option>
                    <option value="check">{tr('invoice.detail.paymentSource.check', 'Check')}</option>
                    <option value="other">{tr('invoice.detail.paymentSource.other', 'Other')}</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {tr('invoice.detail.paymentSourceHint', 'Used by your bookkeeping export to map this payment to the right account.')}
                  </p>
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
                  {tr('invoice.detail.cancel', 'Cancel')}
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
                      {tr('invoice.detail.recording', 'Recording…')}
                    </>
                  ) : (
                    <>
                      <BanknotesIcon className="h-4 w-4" />
                      {tr('invoice.detail.markAsPaid', 'Mark as paid')}
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
