'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '../../hooks/useUser'
import AppLayout from '../../components/AppLayout'
import EditClientModal from '../../components/EditClientModal'
import CreateJobSlideout from '../../components/CreateJobSlideout'
import JobViewSlideout from '../../components/JobViewSlideout'
import SubscriptionSlideout from '../../components/SubscriptionSlideout'
import CreateSubscription from '../../components/CreateSubscription'
import SendInvoiceModal from '../../components/SendInvoiceModal'
import { apiUrl } from '../../utils/api'
import { useAppI18n } from '../../components/I18nProvider'
import type { MessageKey } from '../../i18n'

interface Client {
  id: number
  client_type: 'person' | 'company'
  name: string
  last_name: string | null
  country: string
  address: string | null
  zip_code: string | null
  city: string | null
  email: string | null
  phone: string | null
  billing_address: string | null
  billing_zip_code: string | null
  billing_city: string | null
  billing_email: string | null
  billing_phone: string | null
  ean_number: string | null
  created_at: string
  updated_at: string
  // Set by the API when a client has been anonymized ("right to be
  // forgotten"). The row is kept so jobs/invoices stay consistent; the UI
  // just relabels the client as "Deleted client".
  deleted_at?: string | null
}

interface ClientSecureNote {
  id: number
  note: string
  updatedAt: string | null
  updatedBy: number | null
  createdAt?: string | null
}

type TabId = 'jobs' | 'subscriptions' | 'invoices' | 'settings'

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtMoney(amount: number, currency = 'DKK') {
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

function getInitials(name: string, lastName?: string | null) {
  return (name?.[0] || '').toUpperCase() + (lastName?.[0] || '').toUpperCase()
}

// ─── sub-components ──────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  'in-progress': 'bg-amber-50 text-amber-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  paid: 'bg-green-50 text-green-700',
  sent: 'bg-blue-50 text-blue-700',
  draft: 'bg-amber-50 text-amber-700',
  overdue: 'bg-red-50 text-red-600',
}

const STATUS_I18N: Record<string, MessageKey> = {
  scheduled: 'app.jobStatus.scheduled',
  'in-progress': 'app.jobStatus.inProgress',
  completed: 'app.jobStatus.completed',
  cancelled: 'app.jobStatus.cancelled',
  paid: 'app.jobStatus.paid',
  sent: 'app.jobStatus.sent',
  draft: 'app.jobStatus.draft',
  overdue: 'app.jobStatus.overdue',
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useAppI18n()
  const label = STATUS_I18N[status] ? t(STATUS_I18N[status]) : status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, ' ')
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[status] || 'bg-gray-100 text-gray-500'}`}>
      {label}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-primary-500">{value}</dd>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent-400 border-t-transparent" />
    </div>
  )
}

function EmptyState({ icon, title, subtitle, action }: { icon: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-12">
      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
        {icon}
      </div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { t, locale } = useAppI18n()
  const dateLocale = locale === 'da' ? 'da-DK' : 'en-GB'
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  const clientId = params.id as string
  const companySlug = user?.activeCompany?.slug ?? ''

  const tabFromUrl = searchParams.get('tab') as TabId | null
  const [activeTab, setActiveTab] = useState<TabId>(tabFromUrl ?? 'jobs')

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Jobs
  const [jobs, setJobs] = useState<any[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobFilter, setJobFilter] = useState<'all' | 'scheduled' | 'completed' | 'cancelled'>('all')
  const [isCreateJobOpen, setIsCreateJobOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<any>(null)

  // Subscriptions
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false)
  const [isCreateSubOpen, setIsCreateSubOpen] = useState(false)
  const [editingSub, setEditingSub] = useState<any>(null)
  const [openSubMenuId, setOpenSubMenuId] = useState<number | null>(null)

  // Invoicing
  const [invoices, setInvoices] = useState<any[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [completedJobs, setCompletedJobs] = useState<any[]>([])
  const [completedJobsLoading, setCompletedJobsLoading] = useState(false)
  const [selectedJobs, setSelectedJobs] = useState<Set<number>>(new Set())
  const [openInvoiceMenuId, setOpenInvoiceMenuId] = useState<number | null>(null)
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null)
  const [deleteJobAction, setDeleteJobAction] = useState<'restore' | 'delete_jobs'>('restore')
  const [sendInvoiceId, setSendInvoiceId] = useState<number | null>(null)
  const [sendInvoiceDefaultSubject, setSendInvoiceDefaultSubject] = useState('')
  const [sendInvoiceDefaultMessage, setSendInvoiceDefaultMessage] = useState('')
  const [sendingInvoice, setSendingInvoice] = useState(false)

  // Modals
  const [isEditClientOpen, setIsEditClientOpen] = useState(false)
  const [isDeletingClient, setIsDeletingClient] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [showClientMenu, setShowClientMenu] = useState(false)
  /** Failsafe confirmation before anonymizing client + wiping notes */
  const [removeClientDataModalOpen, setRemoveClientDataModalOpen] = useState(false)

  // Encrypted standard notes — multiple per client; loaded with the page.
  const [secureNotes, setSecureNotes] = useState<ClientSecureNote[]>([])
  const [secureNoteLoading, setSecureNoteLoading] = useState(true)
  /** null = browsing list; 'new' = composing; number = editing that id */
  const [secureNoteEditingId, setSecureNoteEditingId] = useState<number | 'new' | null>(null)
  const [secureNoteDraft, setSecureNoteDraft] = useState('')
  const [secureNoteSaving, setSecureNoteSaving] = useState(false)
  const [secureNoteError, setSecureNoteError] = useState<string | null>(null)

  // ── fetch client ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) return
    fetchClient()
    fetchSecureNotes()
  }, [clientId])
  useEffect(() => {
    const validTabs: TabId[] = ['jobs', 'subscriptions', 'invoices', 'settings']
    if (tabFromUrl && validTabs.includes(tabFromUrl)) setActiveTab(tabFromUrl)
  }, [tabFromUrl])

  const fetchClient = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/clients/${clientId}`), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok && data.client) setClient(data.client)
      else setError(data.error || t('app.clientDetail.errLoad'))
    } catch { setError(t('app.clientDetail.networkError')) }
    finally { setLoading(false) }
  }

  const fetchSecureNotes = async () => {
    if (!clientId) return
    setSecureNoteLoading(true)
    setSecureNoteError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/clients/${clientId}/secure-notes`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(data.notes)) {
        setSecureNotes(data.notes as ClientSecureNote[])
      } else {
        setSecureNotes([])
        setSecureNoteError(data.error || 'Failed to load secure notes')
      }
    } catch {
      setSecureNotes([])
      setSecureNoteError('Network error while loading secure notes')
    } finally {
      setSecureNoteLoading(false)
    }
  }

  const saveSecureNote = async () => {
    if (!clientId || secureNoteSaving || secureNoteEditingId === null) return
    const trimmed = secureNoteDraft.trim()
    if (!trimmed) {
      setSecureNoteError('Note cannot be empty')
      return
    }
    setSecureNoteSaving(true)
    setSecureNoteError(null)
    try {
      const token = localStorage.getItem('token')
      const isNew = secureNoteEditingId === 'new'
      const url = isNew
        ? apiUrl(`/clients/${clientId}/secure-notes`)
        : apiUrl(`/clients/${clientId}/secure-notes/${secureNoteEditingId}`)
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: secureNoteDraft }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setSecureNoteEditingId(null)
        setSecureNoteDraft('')
        await fetchSecureNotes()
      } else {
        setSecureNoteError(data.error || 'Failed to save secure note')
      }
    } catch {
      setSecureNoteError('Network error while saving secure note')
    } finally {
      setSecureNoteSaving(false)
    }
  }

  const deleteSecureNote = async (noteId: number) => {
    if (!clientId || !window.confirm('Delete this note?')) return
    setSecureNoteError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/clients/${clientId}/secure-notes/${noteId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (secureNoteEditingId === noteId) {
          setSecureNoteEditingId(null)
          setSecureNoteDraft('')
        }
        await fetchSecureNotes()
      } else {
        setSecureNoteError(data.error || 'Failed to delete note')
      }
    } catch {
      setSecureNoteError('Network error while deleting note')
    }
  }

  // ── fetch per-tab data ─────────────────────────────────────────────────────
  const fetchJobs = async () => {
    if (!clientId) return
    setJobsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/clients/${clientId}/jobs`), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok) setJobs(data.jobs || [])
    } catch {}
    finally { setJobsLoading(false) }
  }

  const fetchSubscriptions = async () => {
    if (!clientId) return
    setSubscriptionsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/clients/${clientId}/subscriptions`), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok) setSubscriptions(data.subscriptions || [])
    } catch {}
    finally { setSubscriptionsLoading(false) }
  }

  const fetchInvoices = async () => {
    if (!clientId) return
    setInvoicesLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/clients/${clientId}/invoices`), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok) setInvoices(data.invoices || [])
    } catch {}
    finally { setInvoicesLoading(false) }
  }

  const fetchCompletedJobs = async () => {
    if (!clientId) return
    setCompletedJobsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/clients/${clientId}/jobs`), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok) {
        setCompletedJobs(
          (data.jobs || []).filter((j: any) => j.status === 'completed' && j.services?.length > 0 && !j.invoice_id)
        )
      }
    } catch {}
    finally { setCompletedJobsLoading(false) }
  }

  useEffect(() => {
    if (activeTab === 'jobs') fetchJobs()
    if (activeTab === 'subscriptions') fetchSubscriptions()
    if (activeTab === 'invoices') { fetchInvoices(); fetchCompletedJobs() }
  }, [activeTab, clientId])

  // ── navigation helpers ─────────────────────────────────────────────────────
  const goBackToClients = () => {
    if (companySlug) {
      router.push(`/${companySlug}/clients`)
    } else {
      router.push('/clients')
    }
  }

  // ── client actions ─────────────────────────────────────────────────────────
  const clientDisplayName = client
    ? `${client.name}${client.last_name ? ' ' + client.last_name : ''}`
    : ''

  const openRemoveClientDataModal = () => {
    setShowClientMenu(false)
    setRemoveClientDataModalOpen(true)
  }

  const executeRemoveClientData = async () => {
    if (!clientId) return
    try {
      setIsDeletingClient(true)
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/clients/${clientId}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        setRemoveClientDataModalOpen(false)
        goBackToClients()
      } else {
        const d = await res.json()
        alert(d.error || t('app.clientDetail.errDelete'))
      }
    } catch {
      alert(t('app.clientDetail.errDelete'))
    } finally {
      setIsDeletingClient(false)
    }
  }

  const handlePauseSubscription = async (subscription: any, paused: boolean) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/subscriptions/${subscription.id}/pause`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paused }),
      })
      const data = await res.json()
      if (res.ok) {
        fetchSubscriptions()
        if (editingSub?.id === subscription.id) setEditingSub({ ...editingSub, paused_at: paused ? new Date().toISOString().split('T')[0] : null })
      } else alert(data.error || 'Failed to update')
    } catch { alert('Failed to update subscription') }
  }

  const handleDeleteSubscription = async (id: number) => {
    // Past jobs stay on the timeline because they live in `jobs`, not
    // `recurring_jobs`. The server removes future planned visits (same as
    // pause) and deletes the subscription row so it vanishes from this list.
    if (!confirm('Delete this subscription?\n\nFuture visits will be removed and the subscription will no longer appear on the client profile. Already completed or invoiced jobs are kept.')) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/subscriptions/${id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        let msg = 'Failed to delete subscription'
        try { const d = await res.json(); if (d?.error) msg = d.error } catch {}
        alert(msg)
        return
      }
      // Optimistic: drop it from the local list so the row vanishes without
      // waiting for the refetch — matches the user's "delete = gone" model.
      setSubscriptions(prev => prev.filter((s: any) => s.id !== id))
      fetchSubscriptions()
    } catch (err: any) {
      alert(err?.message || 'Failed to delete subscription')
    }
  }

  // Invoice actions
  const downloadPdf = async (id: number, num?: string) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/invoices/${id}/pdf`), { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { alert('Failed to download PDF'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `invoice-${num || id}.pdf`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch { alert('Failed to download PDF') }
  }

  const markSentExternal = async (id: number) => {
    if (!confirm('Mark this invoice as sent? It will be locked from editing.')) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/invoices/${id}/status`), {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      })
      if (res.ok) { await fetchInvoices(); await fetchCompletedJobs() }
      else { const d = await res.json(); alert(d.error || 'Failed') }
    } catch {}
  }

  const openSendInvoice = async (invoice: any) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/email-templates'), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json().catch(() => ({}))
      const tpl = data?.templates?.send_invoice || {}
      setSendInvoiceDefaultSubject(tpl.subject || `Invoice ${invoice.invoice_number_display || invoice.invoice_number}`)
      setSendInvoiceDefaultMessage(tpl.message || '')
      setSendInvoiceId(invoice.id)
    } catch {
      setSendInvoiceDefaultSubject(`Invoice ${invoice.invoice_number_display || invoice.invoice_number}`)
      setSendInvoiceDefaultMessage('')
      setSendInvoiceId(invoice.id)
    }
  }

  const sendInvoiceEmail = async (payload: { subject: string; message: string }) => {
    if (!sendInvoiceId) return
    try {
      setSendingInvoice(true)
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/invoices/${sendInvoiceId}/send-email`), {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error || 'Failed to send'); return }
      setSendInvoiceId(null)
      await fetchInvoices(); await fetchCompletedJobs()
    } catch { alert('Failed to send invoice') }
    finally { setSendingInvoice(false) }
  }

  const deleteInvoice = async () => {
    if (!deleteInvoiceId) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/invoices/${deleteInvoiceId}`), {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobAction: deleteJobAction }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to delete'); return }
      setDeleteInvoiceId(null)
      await fetchInvoices(); await fetchCompletedJobs()
    } catch { alert('Failed to delete invoice') }
  }


  // ── loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-400 border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  if (error || !client) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-center">
          <div>
            <p className="text-sm text-gray-500 mb-4">{error || t('app.clientDetail.notFound')}</p>
            <button onClick={goBackToClients} className="text-sm text-primary-500 underline">{t('app.clientDetail.back')}</button>
          </div>
        </div>
      </AppLayout>
    )
  }

  // Anonymized ("Right to be forgotten") clients keep the row + jobs/invoices,
  // but PII is wiped server-side and deleted_at is set. We just label the row
  // so reports/history stay readable.
  const isAnonymized = !!client.deleted_at
  const fullName = isAnonymized
    ? t('app.clientDetail.anonymizedLabel') || 'Deleted client'
    : `${client.name}${client.last_name ? ' ' + client.last_name : ''}`
  const initials = isAnonymized ? '—' : getInitials(client.name, client.last_name)
  const location = isAnonymized
    ? ''
    : [client.address, client.zip_code, client.city].filter(Boolean).join(', ')
  const billingLocation = isAnonymized
    ? ''
    : [client.billing_address, client.billing_zip_code, client.billing_city].filter(Boolean).join(', ')

  const fmtDate = (d: string) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })
  }
  const fmtDateShort = (d: string) => {
    if (!d) return '—'
    const date = new Date(d)
    const now = new Date()
    if (date.toDateString() === now.toDateString()) return t('app.date.today')
    if (date.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return t('app.date.yesterday')
    return date.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })
  }

  const filteredJobs = jobs.filter(j => jobFilter === 'all' ? true : j.status === jobFilter)
  const scheduledCount = jobs.filter(j => j.status === 'scheduled').length
  const completedCount = jobs.filter(j => j.status === 'completed').length
  const cancelledCount = jobs.filter(j => j.status === 'cancelled').length

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'jobs', label: t('app.clientDetail.tabJobs'), count: jobs.length },
    { id: 'subscriptions', label: t('app.clientDetail.tabSubscriptions'), count: subscriptions.length },
    { id: 'invoices', label: t('app.clientDetail.tabInvoices'), count: invoices.length },
    { id: 'settings', label: t('app.clientDetail.tabSettings') },
  ]

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  return (
    <AppLayout>
      {/* Top back link (desktop) */}
      <div className="hidden lg:block mb-3">
        <button
          onClick={goBackToClients}
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary-500 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('app.clientDetail.back')}
        </button>
      </div>

      <div className="flex gap-6 items-start min-h-0">

        {/* ── LEFT SIDEBAR (sticky client card) ──────────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-4 w-64 xl:w-72 flex-shrink-0 sticky top-0">

          {/* Client card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            {/* Avatar + name */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-16 h-16 rounded-2xl bg-[#BFD1C5] text-primary-500 flex items-center justify-center text-2xl font-bold mb-3">
                {client.client_type === 'company' ? (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                ) : initials}
              </div>
              <h1 className="font-bold text-base text-primary-500 leading-snug">{fullName}</h1>
              {client.client_type === 'company' && (
                <span className="mt-1 text-[11px] font-semibold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{t('app.clientsList.company')}</span>
              )}
              <p className="text-[11px] text-gray-400 mt-1">{t('app.clientDetail.since').replace('{{date}}', fmtDate(client.created_at))}</p>
            </div>

            {/* Contact details */}
            <div className="space-y-2.5 text-sm">
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-start gap-2.5 text-gray-600 hover:text-primary-500 group transition-colors">
                  <svg className="w-4 h-4 mt-0.5 text-gray-400 group-hover:text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="break-all">{client.email}</span>
                </a>
              )}
              {client.phone && (
                <a href={`tel:${client.phone}`} className="flex items-start gap-2.5 text-gray-600 hover:text-primary-500 group transition-colors">
                  <svg className="w-4 h-4 mt-0.5 text-gray-400 group-hover:text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>{client.phone}</span>
                </a>
              )}
              {location && (
                <div className="flex items-start gap-2.5 text-gray-500">
                  <svg className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{location}</span>
                </div>
              )}
            </div>

            {/* Divider + Quick stats */}
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-primary-500">{jobs.length}</div>
                <div className="text-[10px] text-gray-400">{t('app.clientDetail.statsJobs')}</div>
              </div>
              <div>
                <div className="text-lg font-bold text-primary-500">{subscriptions.filter(s => s.is_active).length}</div>
                <div className="text-[10px] text-gray-400">{t('app.clientDetail.statsActiveSub')}</div>
              </div>
              <div>
                <div className="text-lg font-bold text-primary-500">{invoices.length}</div>
                <div className="text-[10px] text-gray-400">{t('app.clientDetail.statsInvoices')}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-col gap-2">
              {isAnonymized ? (
                <div className="w-full text-center px-3 py-2.5 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-xl">
                  {t('app.clientDetail.anonymizedHint') || 'Personal data has been removed. History is preserved.'}
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditClientOpen(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-primary-500 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {t('app.clientDetail.editClient')}
                  </button>

                  {/* 3-dot / remove personal data */}
                  <div className="relative" ref={menuRef}>
                    <button
                      onClick={() => setShowClientMenu(v => !v)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" />
                      </svg>
                      {t('app.clientDetail.moreOptions')}
                    </button>
                    {showClientMenu && (
                      <div className="absolute bottom-10 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                        <button
                          onClick={openRemoveClientDataModal}
                          disabled={isDeletingClient}
                          className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          {isDeletingClient ? t('app.clientDetail.deleting') : t('app.clientDetail.deleteClient')}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT MAIN CONTENT ────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Mobile breadcrumb + header (shown only on small screens) */}
          <div className="lg:hidden mb-4">
            <button
              onClick={goBackToClients}
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary-500 transition-colors mb-3"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('app.clientDetail.back')}
            </button>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-[#BFD1C5] text-primary-500 flex items-center justify-center text-lg font-bold flex-shrink-0">
                {client.client_type === 'company' ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                ) : initials}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-base text-primary-500 truncate">{fullName}</h1>
                <div className="text-xs text-gray-400 truncate">{client.email || client.phone || location || '—'}</div>
              </div>
              <button onClick={() => setIsEditClientOpen(true)} className="text-xs font-medium text-primary-500 px-3 py-1.5 border border-gray-200 rounded-xl hover:bg-gray-50">{t('app.clientDetail.edit')}</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-5 bg-white border border-gray-200 rounded-xl p-1 w-fit overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-500 hover:text-primary-500 hover:bg-gray-50'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

        {/* ── JOBS TAB ─────────────────────────────────────────────────────── */}
        {activeTab === 'jobs' && (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1">
                {[
                  { id: 'all', label: t('app.clientDetail.jobFilterAll').replace('{{count}}', String(jobs.length)) },
                  { id: 'scheduled', label: t('app.clientDetail.jobFilterScheduled').replace('{{count}}', String(scheduledCount)) },
                  { id: 'completed', label: t('app.clientDetail.jobFilterDone').replace('{{count}}', String(completedCount)) },
                  { id: 'cancelled', label: t('app.clientDetail.jobFilterCancelled').replace('{{count}}', String(cancelledCount)) },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setJobFilter(f.id as typeof jobFilter)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      jobFilter === f.id ? 'bg-primary-500 text-white' : 'text-gray-500 hover:text-primary-500 hover:bg-gray-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setIsCreateJobOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('app.clientDetail.newJob')}
              </button>
            </div>

            {jobsLoading ? <Spinner /> : filteredJobs.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl">
                <EmptyState
                  icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                  title={jobFilter === 'all' ? 'No jobs yet' : `No ${jobFilter} jobs`}
                  subtitle="Jobs will appear here when created"
                  action={jobFilter === 'all' ? (
                    <button onClick={() => setIsCreateJobOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors">
                      Create first job
                    </button>
                  ) : undefined}
                />
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                {filteredJobs.map((job, idx) => {
                  const isCancelled = job.status === 'cancelled'
                  return (
                    <div
                      key={job.id}
                      onClick={() => setEditingJob(job)}
                      className={`flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${idx > 0 ? 'border-t border-gray-100' : ''} ${isCancelled ? 'opacity-60' : ''}`}
                    >
                      {/* Date block */}
                      <div className="w-12 text-center flex-shrink-0">
                        <div className="text-[10px] text-gray-400 uppercase font-medium">
                          {job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString(dateLocale, { month: 'short' }) : ''}
                        </div>
                        <div className="text-lg font-bold text-primary-500 leading-none">
                          {job.scheduled_date ? new Date(job.scheduled_date).getDate() : '—'}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm text-primary-500 truncate ${isCancelled ? 'line-through' : ''}`}>
                            {job.title}
                          </span>
                          <StatusBadge status={job.status} />
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                          {job.services?.length > 0 && (
                            <span>{job.services.length} service{job.services.length !== 1 ? 's' : ''}</span>
                          )}
                          {job.total_price > 0 && (
                            <span>{fmtMoney(job.total_price)}</span>
                          )}
                          {job.scheduled_time_from && (
                            <span>{job.scheduled_time_from}{job.scheduled_time_to ? ` – ${job.scheduled_time_to}` : ''}</span>
                          )}
                          {job.recurring_job_id && (
                            <span className="inline-flex items-center gap-0.5 text-accent-600">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              {t('app.clientDetail.subscriptionBadge')}
                            </span>
                          )}
                        </div>
                      </div>

                      <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SUBSCRIPTIONS TAB ────────────────────────────────────────────── */}
        {activeTab === 'subscriptions' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{subscriptions.length} subscription{subscriptions.length !== 1 ? 's' : ''}</p>
              <button
                onClick={() => setIsCreateSubOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New subscription
              </button>
            </div>

            {subscriptionsLoading ? <Spinner /> : subscriptions.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl">
                <EmptyState
                  icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                  title={t('app.clientDetail.noSubscriptions')}
                  subtitle={t('app.clientDetail.subscriptionsHint')}
                  action={
                    <button onClick={() => setIsCreateSubOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors">
                      {t('app.clientDetail.createSubscription')}
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="grid gap-3">
                {subscriptions.map(sub => {
                  const isPaused = !!sub.paused_at
                  const isInactive = !sub.is_active
                  const recurrenceLabel = sub.recurrence_type === 'monthly'
                    ? `${sub.day_of_month ? `Day ${sub.day_of_month}` : ''} of every ${sub.interval_value > 1 ? `${sub.interval_value} months` : 'month'}`
                    : sub.day_of_week !== null && sub.day_of_week !== undefined
                      ? `Every ${sub.interval_value > 1 ? `${sub.interval_value} weeks on ` : ''}${dayNames[sub.day_of_week]}`
                      : 'Recurring'
                  return (
                    <div key={sub.id} className={`bg-white border border-gray-200 rounded-2xl p-5 ${isInactive ? 'opacity-50' : ''}`}>
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-primary-500">{sub.title}</span>
                            {isInactive ? (
                              <span className="text-[11px] font-semibold px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">{t('app.clientDetail.inactive')}</span>
                            ) : isPaused ? (
                              <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">{t('app.clientDetail.pausedFrom').replace('{{date}}', sub.paused_at)}</span>
                            ) : (
                              <span className="text-[11px] font-semibold px-2 py-0.5 bg-green-50 text-green-700 rounded-full">{t('app.clientDetail.active')}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-gray-400">
                            <span>{recurrenceLabel}</span>
                            {sub.scheduled_time_from && <span>{sub.scheduled_time_from}{sub.scheduled_time_to ? ` – ${sub.scheduled_time_to}` : ''}</span>}
                            {sub.service_count > 0 && <span>{sub.service_count} service{sub.service_count !== 1 ? 's' : ''}</span>}
                            {sub.assigned_user_first_name && <span>{sub.assigned_user_first_name} {sub.assigned_user_last_name}</span>}
                          </div>
                        </div>

                        {/* ⋯ kebab menu */}
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); setOpenSubMenuId(openSubMenuId === sub.id ? null : sub.id) }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                            </svg>
                          </button>

                          {openSubMenuId === sub.id && (
                            <>
                              {/* backdrop to close on outside click */}
                              <div className="fixed inset-0 z-10" onClick={() => setOpenSubMenuId(null)} />
                              <div className="absolute right-0 top-9 z-20 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1 animate-fadeIn">
                                <button
                                  onClick={() => { setEditingSub(sub); setOpenSubMenuId(null) }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Edit
                                </button>

                                {sub.is_active && (
                                  <button
                                    onClick={() => { handlePauseSubscription(sub, !isPaused); setOpenSubMenuId(null) }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    {isPaused ? (
                                      <>
                                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Resume
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Pause
                                      </>
                                    )}
                                  </button>
                                )}

                                <div className="border-t border-gray-100 my-1" />

                                <button
                                  onClick={() => { handleDeleteSubscription(sub.id); setOpenSubMenuId(null) }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── INVOICES TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'invoices' && (() => {
          const invoiceableJobs = completedJobs.filter(j => j.status === 'completed' || j.status === 'sub_completed' || !j.status)
          const allSelected = invoiceableJobs.length > 0 && invoiceableJobs.every(j => selectedJobs.has(j.id))
          const toggleAll = () => {
            if (allSelected) setSelectedJobs(new Set())
            else setSelectedJobs(new Set(invoiceableJobs.map(j => j.id)))
          }
          return (
            <div>
              {/* Top action bar */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                  {completedJobs.length} uninvoiced job{completedJobs.length !== 1 ? 's' : ''}
                  {selectedJobs.size > 0 && <span className="ml-2 text-primary-500 font-medium">· {selectedJobs.size} selected</span>}
                </p>
                <button
                  onClick={() => {
                    const ids = Array.from(selectedJobs).join(',')
                    router.push(`/${companySlug}/invoices/new?jobIds=${ids}`)
                  }}
                  disabled={selectedJobs.size === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent-500 text-white text-sm font-medium rounded-xl hover:bg-accent-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Create invoice{selectedJobs.size > 0 ? ` (${selectedJobs.size})` : ''}
                </button>
              </div>

              {/* Uninvoiced jobs table */}
              {completedJobsLoading ? <Spinner /> : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr className="bg-gray-50/80">
                          <th className="w-10 px-4 py-3.5 text-left">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={toggleAll}
                              disabled={invoiceableJobs.length === 0}
                              className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
                            />
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Job name</th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Total</th>
                          <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500"><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {completedJobs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No completed jobs to invoice yet.</td>
                          </tr>
                        ) : completedJobs.map(job => {
                          const invoiceable = job.status === 'completed' || job.status === 'sub_completed' || !job.status
                          const isSubscription = !!(job.recurring_job_id)
                          return (
                            <tr key={job.id} className={`transition-colors hover:bg-gray-50/50 ${!invoiceable ? 'opacity-60' : ''}`}>
                              <td className="w-10 whitespace-nowrap px-4 py-3.5">
                                {invoiceable ? (
                                  <input
                                    type="checkbox"
                                    checked={selectedJobs.has(job.id)}
                                    onChange={() => {
                                      const next = new Set(selectedJobs)
                                      if (next.has(job.id)) next.delete(job.id); else next.add(job.id)
                                      setSelectedJobs(next)
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
                                  />
                                ) : (
                                  <span className="text-xs text-gray-300" title="Cancelled jobs are not included on invoices">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-gray-900">{job.title || 'Untitled job'}</td>
                              <td className="whitespace-nowrap px-4 py-3.5">
                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  job.status === 'cancelled' ? 'bg-gray-100 text-gray-600'
                                  : job.status === 'sub_completed' ? 'bg-amber-100 text-amber-800'
                                  : 'bg-accent-100 text-accent-800'
                                }`}>
                                  {job.status === 'cancelled' ? 'Cancelled' : job.status === 'sub_completed' ? 'Sub-completed' : 'Completed'}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5">
                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${isSubscription ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                  {isSubscription ? 'Subscription' : 'Manual'}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600">{fmtDateShort(job.scheduled_date)}</td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600">{fmtMoney(job.total_price || 0)}</td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-right">
                                <button
                                  onClick={() => setEditingJob(job)}
                                  className="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-accent-50 hover:text-accent-600"
                                  title="View job"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Invoices section */}
              <section className="border-t border-gray-200 pt-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Invoices</h2>
                    <p className="text-sm text-gray-400 mt-0.5">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} for this client</p>
                  </div>
                  <button onClick={() => { fetchInvoices(); fetchCompletedJobs() }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Refresh</button>
                </div>
                {invoicesLoading ? <Spinner /> : (
                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                          <tr className="bg-gray-50/80">
                            <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Invoice #</th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Issued</th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Due</th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Total</th>
                            <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {invoices.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No invoices yet. Select completed jobs above to create one.</td>
                            </tr>
                          ) : invoices.map(invoice => (
                            <tr
                              key={invoice.id}
                              className="cursor-pointer transition-colors hover:bg-accent-50/50"
                              onClick={() => router.push(`/${companySlug}/invoices/${invoice.id}?from=client&clientId=${clientId}&clientName=${encodeURIComponent(fullName)}`)}
                            >
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm font-semibold text-gray-900">#{invoice.invoice_number}</td>
                              <td className="whitespace-nowrap px-4 py-3.5">
                                <StatusBadge status={invoice.status} />
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600">{fmtDate(invoice.issue_date)}</td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600">{fmtDate(invoice.due_date)}</td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-gray-900">{fmtMoney(invoice.total, invoice.currency)}</td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                                <div className="relative inline-block">
                                  <button
                                    onClick={e => { e.stopPropagation(); setOpenInvoiceMenuId(openInvoiceMenuId === invoice.id ? null : invoice.id) }}
                                    className="inline-flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6h.01M12 12h.01M12 18h.01" />
                                    </svg>
                                  </button>
                                  {openInvoiceMenuId === invoice.id && (
                                    <div className="absolute right-0 top-9 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden" onClick={e => e.stopPropagation()}>
                                      <button onClick={() => { setOpenInvoiceMenuId(null); downloadPdf(invoice.id, invoice.invoice_number_display || invoice.invoice_number) }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">Download PDF</button>
                                      {invoice.status === 'draft' && (
                                        <>
                                          <button onClick={() => { setOpenInvoiceMenuId(null); openSendInvoice(invoice) }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">Send to client…</button>
                                          <button onClick={() => { setOpenInvoiceMenuId(null); markSentExternal(invoice.id) }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">Mark as sent (external)</button>
                                          <div className="border-t border-gray-100" />
                                          <button onClick={() => { setOpenInvoiceMenuId(null); setDeleteJobAction('restore'); setDeleteInvoiceId(invoice.id) }} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">Delete invoice…</button>
                                        </>
                                      )}
                                      {invoice.status !== 'draft' && <p className="px-4 py-2.5 text-xs text-gray-400">Sent invoices are locked.</p>}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )
        })()}

        {/* ── PROFILE TAB (client settings) ────────────────────────────────── */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Contact info */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-primary-500">Contact information</h3>
                <button onClick={() => setIsEditClientOpen(true)} className="text-xs font-medium text-accent-600 hover:underline">Edit</button>
              </div>
              <dl className="space-y-3">
                <InfoRow label="Type" value={client.client_type === 'company' ? 'Company' : 'Person'} />
                <InfoRow label="Name" value={fullName} />
                {client.email && <InfoRow label="Email" value={client.email} />}
                {client.phone && <InfoRow label="Phone" value={client.phone} />}
                {client.address && <InfoRow label="Address" value={[client.address, client.zip_code, client.city, client.country].filter(Boolean).join(', ')} />}
              </dl>
            </div>

            {/* Billing info */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-primary-500">Billing information</h3>
                <button onClick={() => setIsEditClientOpen(true)} className="text-xs font-medium text-accent-600 hover:underline">Edit</button>
              </div>
              {client.billing_address || client.billing_email || client.billing_phone || client.ean_number ? (
                <dl className="space-y-3">
                  {client.billing_address && <InfoRow label="Billing address" value={billingLocation} />}
                  {client.billing_email && <InfoRow label="Billing email" value={client.billing_email} />}
                  {client.billing_phone && <InfoRow label="Billing phone" value={client.billing_phone} />}
                  {client.ean_number && <InfoRow label="EAN / GLN" value={client.ean_number} />}
                </dl>
              ) : (
                <p className="text-xs text-gray-400">No separate billing information — using contact details.</p>
              )}
            </div>

            {/* Standard notes (encrypted). Multiple notes per client; add / edit / delete. */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary-50 text-primary-500 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 11c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm0 0v3m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zM8 11V7a4 4 0 118 0v4" />
                    </svg>
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold text-primary-500">Standard notes</div>
                    <div className="text-[11px] text-gray-400">
                      Encrypted. Only members of this company can read them.
                    </div>
                  </div>
                </div>
                {!secureNoteLoading && secureNoteEditingId === null && (
                  <button
                    type="button"
                    onClick={() => {
                      setSecureNoteDraft('')
                      setSecureNoteEditingId('new')
                      setSecureNoteError(null)
                    }}
                    className="text-xs font-medium text-primary-500 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 whitespace-nowrap"
                  >
                    Add note
                  </button>
                )}
              </div>

              {secureNoteLoading ? (
                <div className="text-xs text-gray-400 py-2">Loading…</div>
              ) : secureNoteEditingId !== null ? (
                <div className="mt-2">
                  <textarea
                    value={secureNoteDraft}
                    onChange={(e) => setSecureNoteDraft(e.target.value)}
                    rows={5}
                    placeholder="E.g. door code, alarm instructions, windows not to clean, call before arriving..."
                    className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    autoFocus
                  />
                  {secureNoteError && (
                    <div className="text-[12px] text-red-600 mt-2">{secureNoteError}</div>
                  )}
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSecureNoteEditingId(null)
                        setSecureNoteDraft('')
                        setSecureNoteError(null)
                      }}
                      disabled={secureNoteSaving}
                      className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveSecureNote}
                      disabled={secureNoteSaving}
                      className="text-xs font-semibold text-white bg-primary-500 px-3 py-1.5 rounded-lg hover:bg-primary-600 disabled:opacity-60"
                    >
                      {secureNoteSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : secureNotes.length > 0 ? (
                <ul className="mt-1 space-y-3">
                  {secureNotes.map((n) => (
                    <li
                      key={n.id}
                      className="border border-gray-100 rounded-lg p-3 bg-gray-50/50"
                    >
                      <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                        {n.note}
                      </div>
                      {n.updatedAt ? (
                        <div className="text-[10px] text-gray-400 mt-2">
                          Updated {new Date(n.updatedAt).toLocaleString()}
                        </div>
                      ) : null}
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSecureNoteDraft(n.note)
                            setSecureNoteEditingId(n.id)
                            setSecureNoteError(null)
                          }}
                          className="text-xs font-medium text-primary-500 px-2 py-1 rounded-md hover:bg-white border border-transparent hover:border-gray-200"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSecureNote(n.id)}
                          className="text-xs font-medium text-red-600 px-2 py-1 rounded-md hover:bg-white border border-transparent hover:border-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-gray-400 mt-1">No standard notes yet.</div>
              )}

              {secureNoteEditingId === null && secureNoteError ? (
                <div className="text-[12px] text-red-600 mt-2">{secureNoteError}</div>
              ) : null}
            </div>

            {/* Future: Automations */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 opacity-50 cursor-not-allowed select-none">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-400">Automations</h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">Coming soon</span>
              </div>
              <p className="text-xs text-gray-400">Set up automatic messages, reminders and follow-ups for this client.</p>
            </div>

            {/* Future: Communications */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 opacity-50 cursor-not-allowed select-none">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-400">Communication history</h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">Coming soon</span>
              </div>
              <p className="text-xs text-gray-400">View all emails and messages sent to this client.</p>
            </div>

            {/* Danger zone */}
            <div className="lg:col-span-2 bg-white border border-red-100 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-red-600 mb-1">Danger zone</h3>
              <p className="text-xs text-gray-400 mb-4">
                {t('app.clientDetail.dangerZoneBody')}
              </p>
              <button
                type="button"
                onClick={openRemoveClientDataModal}
                disabled={isDeletingClient}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {isDeletingClient ? t('app.clientDetail.deleting') : t('app.clientDetail.deleteClient')}
              </button>
            </div>
          </div>
        )}

        </div>{/* end right main content */}
      </div>{/* end flex wrapper */}

      {/* ── Modals & Slideouts ─────────────────────────────────────────────── */}
      <EditClientModal
        isOpen={isEditClientOpen}
        onClose={() => setIsEditClientOpen(false)}
        onClientUpdated={() => fetchClient()}
        client={client}
      />

      {client && (
        <CreateJobSlideout
          isOpen={isCreateJobOpen}
          onClose={() => setIsCreateJobOpen(false)}
          onJobCreated={() => fetchJobs()}
          clientId={client.id}
          clientName={fullName}
        />
      )}

      <JobViewSlideout
        isOpen={!!editingJob}
        onClose={() => setEditingJob(null)}
        job={editingJob}
        onJobUpdated={() => { fetchJobs(); fetchCompletedJobs() }}
      />

      {client && (
        <CreateSubscription
          isOpen={isCreateSubOpen}
          onClose={() => setIsCreateSubOpen(false)}
          onSubscriptionCreated={() => { setIsCreateSubOpen(false); fetchSubscriptions() }}
          initialClientId={client.id}
          lockClient={true}
        />
      )}

      {client && editingSub && (
        <SubscriptionSlideout
          isOpen={!!editingSub}
          onClose={() => setEditingSub(null)}
          onSubscriptionCreated={() => fetchSubscriptions()}
          onPauseToggle={handlePauseSubscription}
          onDelete={async (sub) => {
            await handleDeleteSubscription(sub.id)
            setEditingSub(null)
          }}
          clientId={client.id}
          subscription={editingSub}
        />
      )}


      {removeClientDataModalOpen && client && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !isDeletingClient && setRemoveClientDataModalOpen(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden border border-red-100">
            <div className="px-6 py-4 border-b border-red-50 bg-red-50/60">
              <h3 className="text-base font-semibold text-red-700">
                {t('app.clientDetail.removeDataModalTitle')}
              </h3>
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">
                {t('app.clientDetail.removeDataModalSubtitle').replace('{{name}}', clientDisplayName)}
              </p>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm text-gray-700">
              <p className="font-medium text-gray-900">{t('app.clientDetail.removeDataModalWillRemove')}</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
                <li>{t('app.clientDetail.removeDataModalBulletPii')}</li>
                <li>{t('app.clientDetail.removeDataModalBulletNotes')}</li>
              </ul>
              <p className="text-xs text-gray-500 border-t border-gray-100 pt-3 whitespace-pre-line">
                {t('app.clientDetail.removeDataModalKept')}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemoveClientDataModalOpen(false)}
                disabled={isDeletingClient}
                className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50"
              >
                {t('app.clientDetail.removeDataModalCancelBtn')}
              </button>
              <button
                type="button"
                onClick={() => void executeRemoveClientData()}
                disabled={isDeletingClient}
                className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50"
              >
                {isDeletingClient ? t('app.clientDetail.deleting') : t('app.clientDetail.removeDataModalConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteInvoiceId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteInvoiceId(null)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-primary-500">Delete invoice</h3>
              <p className="text-xs text-gray-400 mt-0.5">Only draft invoices can be deleted.</p>
            </div>
            <div className="p-6 space-y-3">
              {[
                { value: 'restore', title: 'Delete invoice, keep jobs', subtitle: 'Jobs will be restored and become invoiceable again.' },
                { value: 'delete_jobs', title: 'Delete invoice and delete jobs', subtitle: 'Also removes the jobs linked to this invoice.' },
              ].map(opt => (
                <label key={opt.value} className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${deleteJobAction === opt.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="radio" name="jobAction" className="mt-0.5" checked={deleteJobAction === opt.value as typeof deleteJobAction} onChange={() => setDeleteJobAction(opt.value as typeof deleteJobAction)} />
                  <div>
                    <div className="text-sm font-medium text-primary-500">{opt.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.subtitle}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setDeleteInvoiceId(null)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
              <button onClick={deleteInvoice} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      <SendInvoiceModal
        isOpen={sendInvoiceId !== null}
        invoiceNumber={(() => {
          const inv = invoices.find(i => i.id === sendInvoiceId)
          return inv ? (inv.invoice_number_display || inv.invoice_number) : undefined
        })()}
        defaultSubject={sendInvoiceDefaultSubject}
        defaultMessage={sendInvoiceDefaultMessage}
        isSending={sendingInvoice}
        onClose={() => setSendInvoiceId(null)}
        onSend={sendInvoiceEmail}
      />
    </AppLayout>
  )
}
