'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'
import AdminNav from '../components/AdminNav'
import { NUDGE_EMAILS_BY_STEP, STEP_LABELS } from '../lib/nudgeEmails'
import type { NudgeEmail } from '../lib/nudgeEmails'

interface FunnelLead {
  id: string
  kind: 'draft' | 'verification' | 'owner'
  firstName: string | null
  lastName: string | null
  email: string | null
  companyName: string | null
  userId: number | null
  companyId: number | null
  funnelStep: number
  funnelStepName: string
  updatedAt: string
  createdAt: string
  sentNudgeIds: string[]
}

interface ConfirmTarget {
  nudgeId: string
  nudgeName: string
  leadEmail: string
  x: number
  y: number
}

const TOTAL_STEPS = 6

function EmailNudgeIcon({
  email,
  sent,
  isComplete,
  canSend,
  onSendClick,
}: {
  email: NudgeEmail
  sent: boolean
  isComplete: boolean
  canSend: boolean
  onSendClick: (nudgeId: string, nudgeName: string, x: number, y: number) => void
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const delay = `${email.afterHours}h after inactive`
  const litBorder = isComplete ? 'border-green-400' : 'border-amber-300'
  const litBg     = isComplete ? 'bg-green-50'      : 'bg-amber-50'
  const litIcon   = isComplete ? 'text-green-500'   : 'text-amber-400'

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setPos(null)}
        onClick={(e) => {
          if (!canSend) return
          e.stopPropagation()
          setPos(null)
          onSendClick(email.id, email.name, e.clientX, e.clientY)
        }}
        className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${
          canSend ? 'cursor-pointer' : 'cursor-default'
        } ${
          sent
            ? `${litBorder} ${litBg} shadow-sm`
            : canSend
              ? 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
        }`}
        aria-label={email.name}
      >
        <svg
          className={`w-2.5 h-2.5 transition-colors ${sent ? litIcon : canSend ? 'text-gray-300 group-hover:text-blue-400' : 'text-gray-300'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </button>

      {pos && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: pos.x, top: pos.y - 8, transform: 'translate(-50%, -100%)' }}
        >
          <div className="bg-gray-900 text-white rounded-lg px-3 py-2 text-xs shadow-xl whitespace-nowrap">
            <div className="flex items-center gap-2">
              <p className="font-medium leading-snug">{email.name}</p>
              {sent && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  isComplete ? 'bg-green-500 text-white' : 'bg-amber-400 text-white'
                }`}>Sent</span>
              )}
            </div>
            <p className="text-gray-400 mt-0.5">{delay}</p>
            {canSend && <p className="text-blue-300 mt-0.5">Click to send now</p>}
          </div>
          <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  )
}

function FunnelTimeline({
  currentStep,
  sentNudgeIds,
  leadEmail,
  onSendNudge,
}: {
  currentStep: number
  sentNudgeIds: string[]
  leadEmail: string | null
  onSendNudge: (nudgeId: string, nudgeName: string, x: number, y: number) => void
}) {
  const fullyDone = currentStep === TOTAL_STEPS
  const trailCls = fullyDone ? 'bg-green-400' : 'bg-amber-300'
  const doneCirCls = fullyDone
    ? 'bg-green-50 text-green-600 ring-1 ring-green-300'
    : 'bg-amber-50 text-amber-500 ring-1 ring-amber-200'
  const curCls = fullyDone
    ? 'bg-green-100 text-green-700 ring-1 ring-green-400'
    : 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'

  const sentSet = new Set(sentNudgeIds)
  const canSend = !!leadEmail

  return (
    <div className="flex items-center flex-nowrap overflow-x-auto">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const step = i + 1
        const isCurrent = step === currentStep
        const isDone = step < currentStep
        const gapEmails = step > 1 ? (NUDGE_EMAILS_BY_STEP[step - 1] ?? []) : []
        const lineClass = isDone ? trailCls : 'bg-gray-200'

        return (
          <div key={step} className="flex items-center flex-shrink-0">
            {step > 1 && (
              <>
                <div className={`h-px w-1.5 flex-shrink-0 ${lineClass}`} />
                {gapEmails.map((email, ei) => (
                  <div key={ei} className="flex items-center">
                    <EmailNudgeIcon
                      email={email}
                      sent={sentSet.has(email.id)}
                      isComplete={fullyDone}
                      canSend={canSend}
                      onSendClick={onSendNudge}
                    />
                    <div className={`h-px w-1.5 flex-shrink-0 ${lineClass}`} />
                  </div>
                ))}
              </>
            )}
            <div
              className={`flex items-center gap-1 rounded-full text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap transition-all flex-shrink-0 ${
                isCurrent ? curCls : isDone ? doneCirCls : 'bg-gray-50 text-gray-300'
              }`}
              title={STEP_LABELS[step]}
            >
              <span>{step}</span>
              {isCurrent && <span className="font-medium">{STEP_LABELS[step]}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

const STEP_COLORS: Record<number, string> = {
  1: 'bg-amber-50 text-amber-700 ring-amber-200',
  2: 'bg-amber-50 text-amber-700 ring-amber-200',
  3: 'bg-amber-50 text-amber-700 ring-amber-200',
  4: 'bg-amber-50 text-amber-700 ring-amber-200',
  5: 'bg-amber-50 text-amber-700 ring-amber-200',
  6: 'bg-green-50 text-green-700 ring-green-200',
}

export default function AdminFunnelPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<FunnelLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [filterStep, setFilterStep] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const [token, setToken] = useState<string | null>(null)

  // Send-now state
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null)
  const [activeLead, setActiveLead] = useState<FunnelLead | null>(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<'ok' | 'error' | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  // Locally track newly-sent nudges so icons light up immediately
  const [localSent, setLocalSent] = useState<Map<string, Set<string>>>(new Map())

  useEffect(() => {
    const t = localStorage.getItem('token')
    const userData = localStorage.getItem('user')
    if (!t || !userData) { router.push('/admin'); return }
    try {
      const user = JSON.parse(userData)
      if (user.role !== 'admin') { router.push('/admin'); return }
      setToken(t)
      setIsAuthenticated(true)
      fetchFunnel(t)
    } catch {
      router.push('/admin')
    }
  }, [router])

  async function fetchFunnel(t: string) {
    try {
      setLoading(true)
      const res = await fetch(apiUrl('/admin/funnel'), {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setLeads(data.leads || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load funnel')
    } finally {
      setLoading(false)
    }
  }

  const openConfirm = useCallback((
    lead: FunnelLead,
    nudgeId: string,
    nudgeName: string,
    x: number,
    y: number,
  ) => {
    if (!lead.email) return
    setActiveLead(lead)
    setConfirmTarget({ nudgeId, nudgeName, leadEmail: lead.email, x, y })
    setSendResult(null)
  }, [])

  const cancelConfirm = useCallback(() => {
    setConfirmTarget(null)
    setActiveLead(null)
    setSendResult(null)
    setSendError(null)
  }, [])

  const confirmSend = useCallback(async () => {
    if (!confirmTarget || !token) return
    setSending(true)
    setSendResult(null)
    setSendError(null)
    try {
      const res = await fetch(apiUrl(`/admin/funnel-nudges/${confirmTarget.nudgeId}/send-one`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: confirmTarget.leadEmail }),
      })
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`
        try { const j = await res.json(); errMsg = j.error || errMsg } catch {}
        throw new Error(errMsg)
      }
      setSendResult('ok')
      if (activeLead) {
        setLocalSent(prev => {
          const next = new Map(prev)
          const existing = new Set(next.get(activeLead.id) ?? [])
          existing.add(confirmTarget.nudgeId)
          next.set(activeLead.id, existing)
          return next
        })
      }
      setTimeout(() => { setConfirmTarget(null); setActiveLead(null); setSendResult(null) }, 1500)
    } catch (err) {
      setSendResult('error')
      setSendError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }, [confirmTarget, token, activeLead])

  if (!isAuthenticated) return null

  const stepCounts: Record<number, number> = {}
  for (let i = 1; i <= TOTAL_STEPS; i++) stepCounts[i] = 0
  for (const l of leads) stepCounts[l.funnelStep] = (stepCounts[l.funnelStep] || 0) + 1

  const filtered = leads.filter(l => {
    if (filterStep !== 'all' && l.funnelStep !== filterStep) return false
    if (search) {
      const q = search.toLowerCase()
      const name = [l.firstName, l.lastName].filter(Boolean).join(' ').toLowerCase()
      const email = (l.email || '').toLowerCase()
      const company = (l.companyName || '').toLowerCase()
      if (!name.includes(q) && !email.includes(q) && !company.includes(q)) return false
    }
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50" onClick={() => confirmTarget && cancelConfirm()}>
      <AdminNav />

      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Lead Funnel</h1>
          <p className="text-sm text-gray-500 mt-1">
            Everyone currently in the signup and setup flow
          </p>
        </div>

        {/* Step summary pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilterStep('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ring-1 ${
              filterStep === 'all'
                ? 'bg-gray-900 text-white ring-gray-900'
                : 'bg-white text-gray-600 ring-gray-200 hover:ring-gray-400'
            }`}
          >
            All ({leads.length})
          </button>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const step = i + 1
            const count = stepCounts[step] || 0
            const isActive = filterStep === step
            return (
              <button
                key={step}
                onClick={() => setFilterStep(isActive ? 'all' : step)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ring-1 ${
                  isActive
                    ? 'bg-gray-900 text-white ring-gray-900'
                    : `bg-white text-gray-600 ring-gray-200 hover:ring-gray-400`
                }`}
              >
                {step}. {STEP_LABELS[step]} ({count})
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name, email or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-md rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-40">
                    Name
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-52">
                    Email
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-40">
                    Company
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Funnel
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">
                    Last seen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-400">
                      No leads found
                    </td>
                  </tr>
                ) : (
                  filtered.map(lead => {
                    const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ')
                    const isComplete = lead.funnelStep === TOTAL_STEPS
                    // Merge server-side sent IDs with locally tracked sends
                    const mergedSentIds = [
                      ...(lead.sentNudgeIds ?? []),
                      ...(localSent.get(lead.id) ?? []),
                    ]
                    return (
                      <tr
                        key={lead.id}
                        className="hover:bg-gray-50/60 transition-colors"
                      >
                        {/* Name */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                              isComplete ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {name ? name[0].toUpperCase() : lead.email?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <span className="font-medium text-gray-800 truncate max-w-[100px]">
                              {name || <span className="text-gray-400 italic">No name</span>}
                            </span>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-5 py-3.5">
                          <span className="text-gray-600 truncate block max-w-[200px]">
                            {lead.email || <span className="text-gray-300 italic">–</span>}
                          </span>
                        </td>

                        {/* Company */}
                        <td className="px-5 py-3.5">
                          <span className="text-gray-600 truncate block max-w-[140px]">
                            {lead.companyName || <span className="text-gray-300 italic">–</span>}
                          </span>
                        </td>

                        {/* Funnel timeline */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <FunnelTimeline
                              currentStep={lead.funnelStep}
                              sentNudgeIds={mergedSentIds}
                              leadEmail={lead.email}
                              onSendNudge={(nudgeId, nudgeName, x, y) =>
                                openConfirm(lead, nudgeId, nudgeName, x, y)
                              }
                            />
                            <span className={`ml-2 flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${
                              STEP_COLORS[lead.funnelStep] || 'bg-gray-50 text-gray-500 ring-gray-200'
                            }`}>
                              {lead.funnelStepName}
                            </span>
                          </div>
                        </td>

                        {/* Last seen */}
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-gray-400 text-xs">{timeAgo(lead.updatedAt)}</span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>

            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40 text-xs text-gray-400">
                Showing {filtered.length} of {leads.length} leads
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Send-now confirmation popover ───────────────────────────────── */}
      {confirmTarget && (
        <div
          className="fixed z-[9999]"
          style={{
            left: Math.min(confirmTarget.x + 8, window.innerWidth - 280),
            top: confirmTarget.y - 8,
            transform: 'translateY(-100%)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 w-64">
            {sendResult === 'ok' ? (
              <div className="flex items-center gap-2 text-green-600 text-sm font-medium py-1">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Sent!
              </div>
            ) : sendResult === 'error' ? (
              <div className="space-y-2">
                <p className="text-red-600 text-sm font-medium">Send failed</p>
                {sendError && <p className="text-red-500 text-xs break-words">{sendError}</p>}
                <button
                  onClick={() => { setSendResult(null); setSendError(null) }}
                  className="text-xs text-gray-500 underline"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Send now</p>
                <p className="text-sm font-semibold text-gray-900 leading-snug mb-0.5">{confirmTarget.nudgeName}</p>
                <p className="text-xs text-gray-400 mb-3 truncate">→ {confirmTarget.leadEmail}</p>
                <div className="flex gap-2">
                  <button
                    onClick={cancelConfirm}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSend}
                    disabled={sending}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
                  >
                    {sending ? (
                      <><div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" /> Sending…</>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Send
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
          {/* Caret */}
          <div className="w-3 h-3 bg-white border-r border-b border-gray-200 rotate-45 mx-auto -mt-1.5 shadow-sm" />
        </div>
      )}
    </div>
  )
}
