'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'

interface Trial {
  id: number
  email: string
  first_name: string
  last_name: string
  company_name: string | null
  trial_days: number
  token: string
  view_count: number
  viewed_at: string | null
  registered_at: string | null
  registered_user_id: number | null
  registered_company_id: number | null
  reg_first_name: string | null
  reg_last_name: string | null
  reg_email: string | null
  reg_company_name: string | null
  reg_company_slug: string | null
  created_at: string
  email_sent_count?: number
  last_email_sent_at?: string | null
}

type Status = 'all' | 'pending' | 'viewed' | 'registered'

function statusOf(t: Trial): { label: string; dot: string; text: string } {
  if (t.registered_at) return { label: 'Registered', dot: 'bg-green-500',  text: 'text-green-700' }
  if (t.viewed_at)     return { label: 'Viewed',     dot: 'bg-blue-500',   text: 'text-blue-700'  }
  return                       { label: 'Sent',       dot: 'bg-gray-400',   text: 'text-gray-500'  }
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminTrialsPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [trials, setTrials] = useState<Trial[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Status>('all')
  const [copied, setCopied] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null)
  const [sendingTestEmailId, setSendingTestEmailId] = useState<number | null>(null)
  const [emailSentId, setEmailSentId] = useState<number | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewData, setPreviewData] = useState<{ to: string; subject: string; html: string; registerUrl?: string } | null>(null)

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', companyName: '', trialDays: '14' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const appBase = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')
    if (!token || !userData) { router.push('/admin'); return }
    try {
      const user = JSON.parse(userData)
      if (user.role !== 'admin') { router.push('/admin'); return }
      setIsAuthenticated(true)
    } catch { router.push('/admin') }
  }, [router])

  const fetchTrials = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/admin/trial-invites'), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok) setTrials(data.trials || [])
    } catch { /* silently ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (isAuthenticated) fetchTrials() }, [isAuthenticated, fetchTrials])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true); setCreateError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/admin/trial-invites'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          companyName: form.companyName || undefined,
          trialDays: parseInt(form.trialDays) || 14,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setTrials(prev => [data.trial, ...prev])
        setForm({ email: '', firstName: '', lastName: '', companyName: '', trialDays: '14' })
        setShowForm(false)
      } else {
        setCreateError(data.error || 'Failed to create')
      }
    } catch { setCreateError('Network error') }
    finally { setCreating(false) }
  }

  const handleDelete = async (id: number) => {
    setDeleteLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/admin/trial-invites/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setTrials(prev => prev.filter(t => t.id !== id))
        setDeleteId(null)
      }
    } catch { /* ignore */ }
    finally { setDeleteLoading(false) }
  }

  const copyLink = (trial: Trial) => {
    const url = `${appBase}/register?trial=${trial.token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(trial.id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const sendTrialEmail = async (trial: Trial) => {
    setSendingEmailId(trial.id)
    setEmailSentId(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/admin/trial-invites/${trial.id}/send-email`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to send email')
        return
      }
      setEmailSentId(trial.id)
      setTrials(prev => prev.map(t =>
        t.id === trial.id
          ? {
              ...t,
              email_sent_count: (t.email_sent_count || 0) + 1,
              last_email_sent_at: new Date().toISOString(),
            }
          : t
      ))
      setTimeout(() => setEmailSentId(null), 2500)
    } catch {
      alert('Network error while sending email')
    } finally {
      setSendingEmailId(null)
    }
  }

  const sendTestEmail = async (trial: Trial) => {
    const testEmail = window.prompt('Send test email to:', '')
    if (!testEmail) return

    setSendingTestEmailId(trial.id)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/admin/trial-invites/${trial.id}/send-email`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to send test email')
        return
      }
      alert(data.message || `Test email sent to ${testEmail}`)
    } catch {
      alert('Network error while sending test email')
    } finally {
      setSendingTestEmailId(null)
    }
  }

  const openEmailPreview = async (trial: Trial) => {
    setPreviewLoadingId(trial.id)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/admin/trial-invites/${trial.id}/email-preview`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to load preview')
        return
      }
      setPreviewData({
        to: data.to,
        subject: data.subject,
        html: data.html,
        registerUrl: data.registerUrl,
      })
      setPreviewModalOpen(true)
    } catch {
      alert('Network error while loading preview')
    } finally {
      setPreviewLoadingId(null)
    }
  }

  const filtered = trials.filter(t => {
    if (filter === 'all')        return true
    if (filter === 'registered') return !!t.registered_at
    if (filter === 'viewed')     return !!t.viewed_at && !t.registered_at
    return !t.viewed_at && !t.registered_at
  })

  const stats = {
    total:      trials.length,
    pending:    trials.filter(t => !t.viewed_at).length,
    viewed:     trials.filter(t => t.viewed_at && !t.registered_at).length,
    registered: trials.filter(t => !!t.registered_at).length,
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">V</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Vevago Admin</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/admin/overview" className="text-gray-600 hover:text-gray-900">Overview</Link>
            <Link href="/admin/users"    className="text-gray-600 hover:text-gray-900">Users</Link>
            <Link href="/admin/companies" className="text-gray-600 hover:text-gray-900">Companies</Link>
            <Link href="/admin/trials"   className="text-gray-600 hover:text-gray-900">Trials</Link>
            <Link href="/admin/coupons" className="text-gray-600 hover:text-gray-900">Coupons</Link>
            <button
              onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.push('/admin') }}
              className="text-gray-500 hover:text-gray-800"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Trial campaigns</h1>
            <p className="text-sm text-gray-500 mt-1">Create personalised trial links and track who signs up.</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setCreateError('') }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New trial link
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total sent',  value: stats.total,      color: 'text-gray-800',  filter: 'all'        },
            { label: 'Not opened',  value: stats.pending,    color: 'text-gray-500',  filter: 'pending'    },
            { label: 'Opened',      value: stats.viewed,     color: 'text-blue-600',  filter: 'viewed'     },
            { label: 'Registered',  value: stats.registered, color: 'text-green-600', filter: 'registered' },
          ].map(s => (
            <button
              key={s.filter}
              onClick={() => setFilter(s.filter as Status)}
              className={`text-left bg-white rounded-xl p-4 border transition-all ${filter === s.filter ? 'border-blue-400 shadow-sm ring-1 ring-blue-300' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-500 mt-3">Loading trials…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 font-medium">No trial invites yet</p>
              <p className="text-sm text-gray-400 mt-1">Click "New trial link" to create your first one.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Contact', 'Company (suggested)', 'Trial', 'Status', 'Views', 'Registered company', 'Created', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(trial => {
                  const st = statusOf(trial)
                  return (
                    <tr key={trial.id} className="hover:bg-gray-50 transition-colors">
                      {/* Contact */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-sm text-gray-900">{trial.first_name} {trial.last_name}</div>
                        <div className="text-xs text-gray-400">{trial.email}</div>
                      </td>

                      {/* Company name */}
                      <td className="px-4 py-3.5 text-sm text-gray-600">{trial.company_name || <span className="text-gray-300">—</span>}</td>

                      {/* Trial days */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {trial.trial_days} days
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                          <span className={`text-sm font-medium ${st.text}`}>{st.label}</span>
                        </div>
                        {trial.registered_at && (
                          <div className="text-xs text-gray-400 mt-0.5">{fmtDate(trial.registered_at)}</div>
                        )}
                        {!trial.registered_at && trial.viewed_at && (
                          <div className="text-xs text-gray-400 mt-0.5">First opened {fmtDate(trial.viewed_at)}</div>
                        )}
                      </td>

                      {/* Views */}
                      <td className="px-4 py-3.5 text-sm text-gray-600 text-center">{trial.view_count || 0}</td>

                      {/* Registered company */}
                      <td className="px-4 py-3.5">
                        {trial.reg_company_name ? (
                          <div>
                            <Link href={`/admin/companies/${trial.registered_company_id}`} className="text-sm font-medium text-blue-600 hover:underline">
                              {trial.reg_company_name}
                            </Link>
                            {trial.reg_first_name && (
                              <div className="text-xs text-gray-400">{trial.reg_first_name} {trial.reg_last_name}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-sm">—</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{fmtDateTime(trial.created_at)}</td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEmailPreview(trial)}
                            disabled={previewLoadingId === trial.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            {previewLoadingId === trial.id ? (
                              <>
                                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" />
                                  <path d="M21 12a9 9 0 00-9-9" strokeWidth="2" />
                                </svg>
                                Loading…
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0A9 9 0 1112 3a9 9 0 019 9z" />
                                </svg>
                                Preview email
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => sendTestEmail(trial)}
                            disabled={sendingTestEmailId === trial.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-violet-300 bg-white text-violet-700 hover:bg-violet-50 disabled:opacity-60"
                          >
                            {sendingTestEmailId === trial.id ? (
                              <>
                                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" />
                                  <path d="M21 12a9 9 0 00-9-9" strokeWidth="2" />
                                </svg>
                                Sending test…
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8m-9 5v8" />
                                </svg>
                                Send test mail
                              </>
                            )}
                          </button>
                          {!trial.registered_at && (
                            <button
                              onClick={() => sendTrialEmail(trial)}
                              disabled={sendingEmailId === trial.id}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                emailSentId === trial.id
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                  : 'bg-white border-blue-300 text-blue-700 hover:bg-blue-50'
                              } disabled:opacity-60`}
                            >
                              {sendingEmailId === trial.id ? (
                                <>
                                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" />
                                    <path d="M21 12a9 9 0 00-9-9" strokeWidth="2" />
                                  </svg>
                                  Sending…
                                </>
                              ) : emailSentId === trial.id ? (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Sent!
                                </>
                              ) : (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8m-18 8h18" />
                                  </svg>
                                  Send email
                                </>
                              )}
                            </button>
                          )}
                          {!trial.registered_at && (
                            <button
                              onClick={() => copyLink(trial)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                copied === trial.id
                                  ? 'bg-green-50 border-green-300 text-green-700'
                                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {copied === trial.id ? (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  Copy link
                                </>
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteId(trial.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">New trial link</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{createError}</div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">First name *</label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    placeholder="John"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Last name *</label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  placeholder="john@company.com"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Company name <span className="font-normal text-gray-400">(optional — prefills their setup)</span>
                </label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  placeholder="Acme Window Cleaning"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Trial length (days)</label>
                <div className="flex gap-2">
                  {['7', '14', '30', '90'].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, trialDays: d }))}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                        form.trialDays === d
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                  <input
                    type="number"
                    value={form.trialDays}
                    onChange={e => setForm(p => ({ ...p, trialDays: e.target.value }))}
                    min="1"
                    max="365"
                    className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {creating ? 'Creating…' : 'Create link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-gray-900 mb-2">Remove trial invite?</h3>
            <p className="text-sm text-gray-500 mb-5">The link will stop working. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl"
              >
                {deleteLoading ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email preview modal */}
      {previewModalOpen && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-900 truncate">Email preview</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  To: {previewData.to} · Subject: {previewData.subject}
                </p>
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 pt-3 pb-2 border-b border-gray-100">
              {previewData.registerUrl && (
                <p className="text-xs text-gray-500 break-all">Registration URL: {previewData.registerUrl}</p>
              )}
            </div>
            <div className="flex-1 bg-gray-50 p-3">
              <iframe
                title="Trial email preview"
                className="w-full h-full rounded-xl border border-gray-200 bg-white"
                srcDoc={previewData.html}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
