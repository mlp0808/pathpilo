'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NUDGE_EMAILS, STEP_LABELS, EMAIL_TYPE_META } from '../lib/nudgeEmails'
import type { NudgeEmail } from '../lib/nudgeEmails'
import { apiUrl } from '../../utils/api'
import AdminNav from '../components/AdminNav'

function delayLabel(h: number) {
  return `${h}h after inactive`
}

function GapBadge({ fromStep }: { fromStep: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500">
      <span className="px-1.5 py-0.5 rounded bg-gray-100 font-semibold text-gray-600">{fromStep}</span>
      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
      </svg>
      <span className="px-1.5 py-0.5 rounded bg-gray-100 font-semibold text-gray-600">{fromStep + 1}</span>
      <span className="ml-1 text-gray-400">
        {STEP_LABELS[fromStep]} → {STEP_LABELS[fromStep + 1]}
      </span>
    </span>
  )
}

type SendStatus = 'confirming' | 'sending' | 'done' | 'error'
interface SendState {
  nudgeId: string
  status: SendStatus
  sent?: number
  skipped?: number
  errorMsg?: string
}

export default function AdminEmailsPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [selected, setSelected] = useState<NudgeEmail | null>(null)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [sendState, setSendState] = useState<SendState | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')
    if (!token || !userData) { router.push('/admin'); return }
    try {
      const user = JSON.parse(userData)
      if (user.role !== 'admin') { router.push('/admin'); return }
      setIsAuthenticated(true)
      // Open first email by default
      if (NUDGE_EMAILS.length > 0) setSelected(NUDGE_EMAILS[0])
    } catch {
      router.push('/admin')
    }
  }, [router])

  function startConfirm(nudgeId: string) {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    setSendState({ nudgeId, status: 'confirming' })
  }

  function cancelSend() {
    setSendState(null)
  }

  async function confirmSend(nudgeId: string) {
    const token = localStorage.getItem('token')
    setSendState({ nudgeId, status: 'sending' })
    try {
      const res = await fetch(apiUrl(`/admin/funnel-nudges/${nudgeId}/send`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      setSendState({ nudgeId, status: 'done', sent: data.sent, skipped: data.skipped })
      resetTimerRef.current = setTimeout(() => setSendState(null), 4000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Send failed'
      setSendState({ nudgeId, status: 'error', errorMsg: msg })
      resetTimerRef.current = setTimeout(() => setSendState(null), 4000)
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AdminNav />

      <div className="flex flex-1 overflow-hidden max-w-screen-2xl mx-auto w-full px-6 py-8 gap-6">
        {/* ── Left: email list ──────────────────────────────────── */}
        <div className="w-[400px] flex-shrink-0 flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Funnel Emails</h1>
            <p className="text-sm text-gray-500 mt-1">
              {NUDGE_EMAILS.length} automated nudge emails — sent when a lead goes inactive
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm divide-y divide-gray-100">
            {NUDGE_EMAILS.map((email, idx) => {
              const isSelected = selected?.id === email.id
              // Show a gap header when the fromStep changes
              const prevEmail = NUDGE_EMAILS[idx - 1]
              const showGapHeader = !prevEmail || prevEmail.fromStep !== email.fromStep

              const myState = sendState?.nudgeId === email.id ? sendState : null

              return (
                <div key={email.id}>
                  {showGapHeader && (
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                      <GapBadge fromStep={email.fromStep} />
                    </div>
                  )}
                  <div className="relative group">
                    {/* Main clickable row */}
                    <button
                      type="button"
                      onClick={() => setSelected(email)}
                      className={`w-full text-left px-4 py-3.5 pr-12 transition-colors flex items-start gap-3 ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Email icon */}
                      <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <svg
                          className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                            {email.name}
                          </p>
                          <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ring-1 ${EMAIL_TYPE_META[email.type].cls}`}>
                            {EMAIL_TYPE_META[email.type].label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{email.subject}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            {email.id}
                          </span>
                          <span className="text-[10px] text-gray-400">{delayLabel(email.afterHours)}</span>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                      )}
                    </button>

                    {/* ── Send now action (hover) ─────────────────────── */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      {myState?.status === 'confirming' ? (
                        /* Confirm mini-prompt */
                        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-md px-2 py-1.5 text-xs z-10">
                          <span className="text-gray-600 font-medium whitespace-nowrap pr-1">Send now?</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); confirmSend(email.id) }}
                            className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-md transition-colors"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); cancelSend() }}
                            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-md transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : myState?.status === 'sending' ? (
                        /* Spinner */
                        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg shadow-md px-2.5 py-1.5 text-xs text-gray-500">
                          <svg className="w-3.5 h-3.5 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Sending…
                        </div>
                      ) : myState?.status === 'done' ? (
                        /* Success */
                        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg shadow-md px-2.5 py-1.5 text-xs text-emerald-700 font-semibold">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                          </svg>
                          Sent to {myState.sent ?? 0}
                        </div>
                      ) : myState?.status === 'error' ? (
                        /* Error */
                        <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg shadow-md px-2.5 py-1.5 text-xs text-red-600 font-semibold max-w-[140px] truncate">
                          {myState.errorMsg || 'Error'}
                        </div>
                      ) : (
                        /* Idle — show ⚡ on hover */
                        <button
                          type="button"
                          title="Send this email to all eligible leads now"
                          onClick={(e) => { e.stopPropagation(); startConfirm(email.id) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-white border border-gray-200 shadow-sm hover:border-emerald-400 hover:bg-emerald-50 text-gray-400 hover:text-emerald-600"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right: preview panel ──────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {selected ? (
            <>
              {/* Preview header */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900 truncate">{selected.name}</h2>
                    <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ring-1 ${EMAIL_TYPE_META[selected.type].cls}`}>
                      {EMAIL_TYPE_META[selected.type].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <GapBadge fromStep={selected.fromStep} />
                    <span className="text-xs text-gray-400">&middot;</span>
                    <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                      {delayLabel(selected.afterHours)}
                    </span>
                    <span className="text-xs text-gray-400">&middot;</span>
                    <span className="text-xs font-mono text-gray-400">{selected.id}</span>
                  </div>
                  <p className="mt-2.5 text-xs text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                    <span className="font-semibold not-italic text-gray-600">Goal: </span>
                    {selected.goal}
                  </p>
                  <p className="mt-2 text-sm text-gray-700">
                    <span className="font-medium text-gray-500">Subject: </span>
                    {selected.subject}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    <span className="font-medium text-gray-500">Preview: </span>
                    {selected.previewText}
                  </p>
                </div>

                {/* Device toggle */}
                <div className="flex-shrink-0 flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setPreviewDevice('desktop')}
                    title="Desktop preview"
                    className={`p-2 rounded-lg transition-colors ${
                      previewDevice === 'desktop' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setPreviewDevice('mobile')}
                    title="Mobile preview"
                    className={`p-2 rounded-lg transition-colors ${
                      previewDevice === 'mobile' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Email iframe preview */}
              <div className={`flex-1 flex ${previewDevice === 'mobile' ? 'justify-center' : ''}`}>
                <div
                  className={`bg-gray-200 rounded-2xl overflow-hidden shadow-inner flex-shrink-0 ${
                    previewDevice === 'mobile' ? 'w-[390px]' : 'w-full'
                  }`}
                  style={{ minHeight: 520 }}
                >
                  <iframe
                    key={selected.id}
                    srcDoc={selected.bodyHtml.replace(/\{\{firstName\}\}/g, 'Alex').replace(/\{\{companyName\}\}/g, 'Smith Cleaning')}
                    title="Email preview"
                    className="w-full h-full border-0 rounded-2xl"
                    style={{ minHeight: 520 }}
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Select an email to preview it
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
