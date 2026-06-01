'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import CreateJob from '@/app/components/CreateJob'
import { useAppI18n } from '@/app/components/I18nProvider'
import { apiUrl } from '@/app/utils/api'
import {
  ArrowTopRightOnSquareIcon,
  Cog6ToothIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  TrashIcon,
  UserPlusIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  InboxIcon,
} from '@heroicons/react/24/outline'

const LEADS_HELP_URL = 'https://help.pathpilo.com/category/leads-forms/'

type LeadStatus = 'new' | 'contacted' | 'won' | 'lost'

type Lead = {
  id: number
  status: LeadStatus
  source: string
  first_name: string | null
  last_name: string | null
  country: string | null
  address: string | null
  zip_code: string | null
  city: string | null
  email: string | null
  phone: string | null
  message: string | null
  preferred_date: string | null
  preferred_time: string | null
  notes: string | null
  meta: { answers?: Array<{ label: string; value: string; type?: string }> } | null
  client_id: number | null
  converted_at: string | null
  created_at: string
}

type StatusCounts = { new: number; contacted: number; won: number; lost: number }

const STATUS_META: Record<LeadStatus, { dot: string; chip: string; labelKey: string; fallback: string }> = {
  new: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700', labelKey: 'app.leads.status.new', fallback: 'New' },
  contacted: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700',
    labelKey: 'app.leads.status.contacted',
    fallback: 'Contacted',
  },
  won: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', labelKey: 'app.leads.status.won', fallback: 'Won' },
  lost: { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600', labelKey: 'app.leads.status.lost', fallback: 'Lost' },
}

const STATUS_ORDER: LeadStatus[] = ['new', 'contacted', 'won', 'lost']

export default function LeadsPage() {
  const { t } = useAppI18n()
  const params = useParams<{ company?: string }>()
  const companySlug = params?.company || ''

  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [leads, setLeads] = useState<Lead[]>([])
  const [counts, setCounts] = useState<StatusCounts>({ new: 0, contacted: 0, won: 0, lost: 0 })
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const [savingNote, setSavingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [converting, setConverting] = useState(false)

  const [jobClientId, setJobClientId] = useState<number | null>(null)
  const [jobModalOpen, setJobModalOpen] = useState(false)

  const settingsHref = companySlug ? `/${companySlug}/settings/leads-form` : '/settings/leads-form'

  // ── activation gate ───────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setEnabled(false)
      return
    }
    fetch(apiUrl('/lead-form'), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setEnabled(Boolean(data?.form?.enabled)))
      .catch(() => setEnabled(false))
  }, [])

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const token = localStorage.getItem('token')
      const qs = filter === 'all' ? '' : `?status=${filter}`
      const res = await fetch(apiUrl(`/leads${qs}`), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok) {
        setLeads(data.leads || [])
        if (data.counts) setCounts(data.counts)
      } else {
        setError(data?.error || 'Failed to fetch leads')
      }
    } catch {
      setError('Network error while fetching leads')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    if (enabled) fetchLeads()
  }, [enabled, fetchLeads])

  // Auto-select the first lead when the list loads or the filter changes.
  useEffect(() => {
    if (leads.length > 0 && (selectedId == null || !leads.some((l) => l.id === selectedId))) {
      setSelectedId(leads[0].id)
    } else if (leads.length === 0) {
      setSelectedId(null)
    }
  }, [leads, selectedId])

  const selected = useMemo(() => leads.find((l) => l.id === selectedId) || null, [leads, selectedId])

  useEffect(() => {
    setNoteDraft(selected?.notes || '')
  }, [selectedId, selected?.notes])

  const patchLead = async (id: number, patch: Record<string, any>) => {
    const token = localStorage.getItem('token')
    const res = await fetch(apiUrl(`/leads/${id}`), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (res.ok) {
      setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)))
      // refresh counts after a status change
      if (patch.status) fetchLeads()
    }
    return res.ok
  }

  const saveNote = async () => {
    if (!selected) return
    setSavingNote(true)
    await patchLead(selected.id, { notes: noteDraft })
    setSavingNote(false)
  }

  const deleteLead = async (id: number) => {
    const token = localStorage.getItem('token')
    const res = await fetch(apiUrl(`/leads/${id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setLeads((prev) => prev.filter((l) => l.id !== id))
      if (selectedId === id) setSelectedId(null)
      fetchLeads()
    }
  }

  const convertLead = async (lead: Lead) => {
    setConverting(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/leads/${lead.id}/convert`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (res.ok) {
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? data.lead : l)))
        setCounts((c) => c) // counts refreshed on next fetch
        fetchLeads()
        // Immediately offer to create a job for the new client.
        setJobClientId(data.client.id)
        setJobModalOpen(true)
      } else {
        setError(data?.error || 'Failed to convert lead')
      }
    } catch {
      setError('Network error while converting lead')
    } finally {
      setConverting(false)
    }
  }

  const fmtRelative = (v: string | null) => {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return String(v)
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d`
    return d.toLocaleDateString()
  }
  const fmtDateTime = (v: string | null) => {
    if (!v) return '—'
    const d = new Date(v)
    return isNaN(d.getTime()) ? String(v) : d.toLocaleString()
  }

  const leadName = (l: Lead) =>
    `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.email || t('app.leads.unnamed', 'Unnamed lead')

  // ── loading the gate ───────────────────────────────────────────────────
  if (enabled === null) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      </AppLayout>
    )
  }

  // ── disabled empty state (mirrors invoices) ────────────────────────────
  if (enabled === false) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500">
              <Cog6ToothIcon className="h-4 w-4 text-gray-400" />
              <ChevronRightIcon className="h-3 w-3 text-gray-300" />
              <span>{t('app.leads.disabled.crumbLeads', 'Lead form')}</span>
              <ChevronRightIcon className="h-3 w-3 text-gray-300" />
              <span className="text-gray-900">{t('app.leads.disabled.crumbTurnOn', 'Turn on leads')}</span>
            </div>

            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              {t('app.leads.disabled.title', 'This is your leads area')}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
              {t(
                'app.leads.disabled.body',
                'Build a lead form, turn it on, and share it on your website or with a direct link. Every submission shows up here, ready to become a client.',
              )}
            </p>

            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={settingsHref}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black sm:w-auto"
              >
                <Cog6ToothIcon className="h-4 w-4" />
                {t('app.leads.disabled.goToSettings', 'Set up your lead form')}
              </Link>
              <a
                href={LEADS_HELP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto"
              >
                {t('app.leads.disabled.learnMore', 'Learn about leads')}
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-gray-400" />
              </a>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  // ── active leads area ──────────────────────────────────────────────────
  const totalCount = counts.new + counts.contacted + counts.won + counts.lost

  return (
    <AppLayout>
      <div className="-mx-4 flex min-h-[calc(100vh-5rem)] flex-col sm:-mx-6 lg:-mx-[40px]">
        {/* Header */}
        <div className="flex flex-shrink-0 flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-4 pb-4 sm:px-6 lg:px-10">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
              {t('app.leads.title', 'Leads')}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {t('app.leads.subtitle', 'Requests from your lead form. Follow up and turn them into clients.')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLeads}
              disabled={loading}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              aria-label={t('app.leads.refresh', 'Refresh')}
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href={settingsHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Cog6ToothIcon className="h-4 w-4 text-gray-400" />
              {t('app.leads.formSettings', 'Form settings')}
            </Link>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-gray-200 px-4 sm:px-6 lg:px-10">
          <StatusTab active={filter === 'all'} onClick={() => setFilter('all')} label={t('app.leads.filter.all', 'All')} count={totalCount} />
          {STATUS_ORDER.map((s) => (
            <StatusTab
              key={s}
              active={filter === s}
              onClick={() => setFilter(s)}
              label={t(STATUS_META[s].labelKey, STATUS_META[s].fallback)}
              count={counts[s]}
              dot={STATUS_META[s].dot}
            />
          ))}
        </div>

        {error && (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:mx-6 lg:mx-10">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Split inbox */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Lead list */}
          <div className="flex w-full flex-col border-b border-gray-200 lg:w-[380px] lg:flex-shrink-0 lg:border-b-0 lg:border-r">
            {loading && leads.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-12 text-sm text-gray-400">
                {t('app.leads.loading', 'Loading…')}
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                  <InboxIcon className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-700">{t('app.leads.empty', 'No leads here yet.')}</p>
                <p className="mt-1 max-w-xs text-xs text-gray-400">
                  {t('app.leads.emptyHint', 'Share your form link to start receiving requests.')}
                </p>
                <Link
                  href={settingsHref}
                  className="mt-4 text-sm font-medium text-accent-700 hover:text-accent-800"
                >
                  {t('app.leads.formSettings', 'Form settings')} →
                </Link>
              </div>
            ) : (
              <ul className="max-h-[320px] overflow-y-auto lg:max-h-none lg:flex-1">
                {leads.map((lead) => {
                  const active = lead.id === selectedId
                  const sm = STATUS_META[lead.status]
                  const preview =
                    lead.message?.slice(0, 80) ||
                    lead.meta?.answers?.[0]?.value?.slice(0, 80) ||
                    lead.email ||
                    ''
                  return (
                    <li key={lead.id}>
                      <button
                        onClick={() => setSelectedId(lead.id)}
                        className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3.5 text-left transition-colors sm:px-5 ${
                          active ? 'bg-gray-50' : 'hover:bg-gray-50/70'
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          <Avatar name={leadName(lead)} />
                          {lead.status === 'new' && (
                            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`truncate text-sm ${active ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                              {leadName(lead)}
                            </span>
                            <span className="flex-shrink-0 text-[11px] text-gray-400">{fmtRelative(lead.created_at)}</span>
                          </div>
                          {preview && (
                            <p className="mt-0.5 truncate text-xs text-gray-500">{preview}</p>
                          )}
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${sm.chip}`}>
                              {t(sm.labelKey, sm.fallback)}
                            </span>
                            {lead.client_id && (
                              <CheckBadgeIcon className="h-3.5 w-3.5 text-emerald-500" aria-label="Converted" />
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Detail panel */}
          <div className="min-w-0 flex-1 bg-white">
            {!selected ? (
              <div className="flex h-full min-h-[280px] items-center justify-center p-12 text-center text-sm text-gray-400">
                {t('app.leads.selectPrompt', 'Select a lead to see the details.')}
              </div>
            ) : (
              <div className="flex h-full flex-col">
                {/* Detail header */}
                <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-5 sm:px-8">
                  <div className="flex items-center gap-4">
                    <Avatar name={leadName(selected)} large />
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{leadName(selected)}</h2>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {t('app.leads.received', 'Received')} {fmtDateTime(selected.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!selected.client_id && (
                      <button
                        onClick={() => convertLead(selected)}
                        disabled={converting}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <UserPlusIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">
                          {converting ? t('app.leads.converting', 'Converting…') : t('app.leads.convert', 'Convert to client')}
                        </span>
                      </button>
                    )}
                    <button
                      onClick={() => deleteLead(selected.id)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      aria-label={t('app.leads.delete', 'Delete')}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
                  <div className="mx-auto max-w-3xl space-y-8">
                    {/* Status */}
                    <section>
                      <SectionLabel>{t('app.leads.statusLabel', 'Status')}</SectionLabel>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {STATUS_ORDER.map((s) => {
                          const on = selected.status === s
                          const sm = STATUS_META[s]
                          return (
                            <button
                              key={s}
                              onClick={() => patchLead(selected.id, { status: s })}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                                on
                                  ? 'border-gray-900 bg-gray-900 text-white'
                                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-white' : sm.dot}`} />
                              {t(sm.labelKey, sm.fallback)}
                            </button>
                          )
                        })}
                      </div>
                    </section>

                    {/* Contact */}
                    <section>
                      <SectionLabel>{t('app.leads.contact', 'Contact')}</SectionLabel>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <ContactCard label={t('app.leads.field.email', 'Email')} value={selected.email} href={selected.email ? `mailto:${selected.email}` : undefined} />
                        <ContactCard label={t('app.leads.field.phone', 'Phone')} value={selected.phone} href={selected.phone ? `tel:${selected.phone}` : undefined} />
                        {selected.address && (
                          <ContactCard label={t('app.leads.field.address', 'Address')} value={selected.address} className="sm:col-span-2" />
                        )}
                        {(selected.city || selected.zip_code) && (
                          <ContactCard
                            label={t('app.leads.field.location', 'City / Zip')}
                            value={[selected.zip_code, selected.city].filter(Boolean).join(' ')}
                          />
                        )}
                      </div>
                    </section>

                    {/* Form responses */}
                    {selected.meta?.answers && selected.meta.answers.length > 0 && (
                      <section>
                        <SectionLabel>{t('app.leads.responses', 'Form responses')}</SectionLabel>
                        <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50/50">
                          {selected.meta.answers.map((a, i) => (
                            <div key={i} className="px-4 py-3.5">
                              <dt className="text-xs font-medium text-gray-500">{a.label}</dt>
                              <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-900">{a.value || '—'}</dd>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Notes */}
                    <section>
                      <SectionLabel>{t('app.leads.notes', 'Internal notes')}</SectionLabel>
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder={t('app.leads.notesPlaceholder', 'Notes for your team…')}
                        rows={4}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-gray-400"
                      />
                      {noteDraft !== (selected.notes || '') && (
                        <div className="mt-2 flex justify-end">
                          <button
                            onClick={saveNote}
                            disabled={savingNote}
                            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                          >
                            {savingNote ? t('app.leads.saving', 'Saving…') : t('app.leads.saveNote', 'Save note')}
                          </button>
                        </div>
                      )}
                    </section>

                    {/* Converted actions */}
                    {selected.client_id && (
                      <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                            <CheckBadgeIcon className="h-5 w-5" />
                            {t('app.leads.converted', 'Converted to a client')}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => {
                                setJobClientId(selected.client_id)
                                setJobModalOpen(true)
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                            >
                              <BriefcaseIcon className="h-4 w-4" />
                              {t('app.leads.createJob', 'Create job')}
                            </button>
                            <Link
                              href={companySlug ? `/${companySlug}/clients/${selected.client_id}` : `/clients/${selected.client_id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                            >
                              {t('app.leads.viewClient', 'View client')}
                              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {jobModalOpen && jobClientId != null && (
        <CreateJob
          isOpen={jobModalOpen}
          onClose={() => {
            setJobModalOpen(false)
            setJobClientId(null)
          }}
          onJobCreated={() => {
            setJobModalOpen(false)
            setJobClientId(null)
          }}
          initialClientId={jobClientId}
          lockClient
          mode="job"
        />
      )}
    </AppLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function StatusTab({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  dot?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition ${
        active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
      <span className={`text-xs ${active ? 'text-gray-500' : 'text-gray-400'}`}>{count}</span>
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{children}</h3>
}

function ContactCard({
  label,
  value,
  href,
  className = '',
}: {
  label: string
  value: string | null
  href?: string
  className?: string
}) {
  const content = value || '—'
  return (
    <div className={`rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 ${className}`}>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-gray-900">
        {href && value ? (
          <a href={href} className="text-accent-700 hover:text-accent-800 hover:underline">
            {content}
          </a>
        ) : (
          content
        )}
      </dd>
    </div>
  )
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full bg-gray-100 font-semibold text-gray-500 ${
        large ? 'h-11 w-11 text-base' : 'h-9 w-9 text-sm'
      }`}
    >
      {initials || '?'}
    </div>
  )
}
