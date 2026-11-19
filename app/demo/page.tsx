'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { apiUrl } from '../utils/api'
import DarkAuthShell from '../components/DarkAuthShell'
import { applySingleCompanyAutoSelect, getDashboardHref, getStoredUser } from '../utils/sessionClient'
import { UI_LOCALE_STORAGE_KEY } from '../i18n'
import { DEMO_SESSION_KEY, isDemoEmail, readDemoSession, type DemoSession } from '../utils/demoSession'

/** The bar never finishes faster than this, so the steps are readable. */
const MIN_SETUP_MS = 3800
const POLL_MS = 450

type Phase = 'checking' | 'resume' | 'signed-in' | 'running' | 'error'

interface StatusResponse {
  progress: number
  step: string
  done: boolean
  error: string | null
  token?: string
  expiresAt?: string
  user?: Record<string, unknown>
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function enterWorkspace(token: string, user: Record<string, unknown>) {
  const session = applySingleCompanyAutoSelect({ ...user, languageCode: 'en' })
  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(session))
  localStorage.setItem(UI_LOCALE_STORAGE_KEY, 'en')
  window.location.replace(getDashboardHref(session))
}

export default function DemoPage() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [existing, setExisting] = useState<DemoSession | null>(null)
  const [signedInAs, setSignedInAs] = useState('')
  const [error, setError] = useState('')
  const [shown, setShown] = useState(0)
  const [label, setLabel] = useState('Getting ready')

  const started = useRef(false)
  const startedAt = useRef(0)
  const target = useRef(0)
  const steps = useRef<Array<{ at: number; label: string }>>([])
  const finished = useRef<{ token: string; user: Record<string, unknown>; expiresAt: string } | null>(null)

  const start = useCallback(async () => {
    if (started.current) return
    started.current = true
    startedAt.current = Date.now()
    target.current = 2
    steps.current = [{ at: 0, label: 'Getting ready' }]
    finished.current = null
    setShown(0)
    setLabel('Getting ready')
    setError('')
    setPhase('running')

    try {
      const res = await fetch(apiUrl('/demo/start'), { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.jobId) throw new Error(data.message || 'We could not start the demo. Please try again.')

      while (!finished.current) {
        await new Promise((r) => setTimeout(r, POLL_MS))
        const s = await fetch(apiUrl(`/demo/status/${data.jobId}`))
        const status: StatusResponse = await s.json().catch(() => ({}))
        if (!s.ok) throw new Error('The demo setup was interrupted. Please try again.')
        if (status.error) throw new Error(status.error)
        if (status.step && steps.current[steps.current.length - 1]?.label !== status.step) {
          steps.current.push({ at: status.progress, label: status.step })
        }
        target.current = Math.max(target.current, status.progress || 0)
        if (status.done && status.token && status.user) {
          finished.current = { token: status.token, user: status.user, expiresAt: status.expiresAt || '' }
        }
      }
    } catch (e) {
      started.current = false
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setPhase('error')
    }
  }, [])

  // Ease the visible bar toward the server's progress, paced by MIN_SETUP_MS.
  useEffect(() => {
    if (phase !== 'running') return
    let frame = 0
    let value = 0
    const tick = () => {
      const elapsed = Date.now() - startedAt.current
      const paceCap = Math.min(100, (elapsed / MIN_SETUP_MS) * 100)
      const goal = Math.min(target.current, paceCap, finished.current ? 100 : 97)
      value = value + Math.max(0, goal - value) * 0.09
      if (goal - value < 0.3) value = goal
      setShown(value)
      const current = [...steps.current].reverse().find((s) => s.at <= value + 0.5)
      if (current) setLabel(current.label)

      const done = finished.current
      if (done && value >= 100) {
        const company = (done.user.activeCompany || {}) as { slug?: string }
        const session: DemoSession = {
          token: done.token,
          user: done.user,
          expiresAt: done.expiresAt,
          slug: company.slug || '',
        }
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session))
        setTimeout(() => enterWorkspace(done.token, done.user), 350)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase])

  useEffect(() => {
    const saved = readDemoSession()
    if (saved) {
      setExisting(saved)
      setPhase('resume')
      return
    }
    const token = localStorage.getItem('token')
    const user = getStoredUser()
    if (token && user?.email && !isDemoEmail(user.email)) {
      setSignedInAs(String(user.email))
      setPhase('signed-in')
      return
    }
    start()
  }, [start])

  const percent = Math.round(shown)

  return (
    <DarkAuthShell>
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10 pt-safe pb-safe">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Link href="/" className="inline-flex items-center justify-center">
              <Image
                src="/images/brand/logo-header-white.png"
                alt="PathPilo"
                width={160}
                height={50}
                className="h-auto w-[140px] sm:w-[160px]"
                priority
              />
            </Link>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-2xl shadow-black/40 sm:p-8">
            {phase === 'checking' && <div className="h-40" />}

            {phase === 'running' && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Live demo</p>
                <h1 className="mt-1 text-xl font-bold text-gray-900">Setting up your demo</h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  A solo window cleaner in Harrogate, a year into running the business on PathPilo.
                </p>

                <div className="mt-7">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-gray-800" aria-live="polite">
                      {label}
                    </p>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-400">{percent}%</span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <div className="h-full rounded-full bg-accent-500" style={{ width: `${shown}%` }} />
                  </div>
                </div>

                <p className="mt-7 text-xs leading-relaxed text-gray-400">
                  Everything is made up. Emails and texts are never sent from the demo, and it deletes itself after
                  a few days.
                </p>
              </div>
            )}

            {phase === 'resume' && existing && (
              <div>
                <h1 className="text-xl font-bold text-gray-900">Your demo is still here</h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  Pick up where you left off. It stays available until {formatDay(existing.expiresAt)}.
                </p>
                <div className="mt-6 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => enterWorkspace(existing.token, existing.user)}
                    className="w-full rounded-xl bg-accent-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-600"
                  >
                    Continue the demo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem(DEMO_SESSION_KEY)
                      start()
                    }}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    Start a fresh demo
                  </button>
                </div>
              </div>
            )}

            {phase === 'signed-in' && (
              <div>
                <h1 className="text-xl font-bold text-gray-900">You&apos;re already signed in</h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  You&apos;re signed in as <span className="font-medium text-gray-800">{signedInAs}</span>. Opening
                  the demo signs you out of that account in this browser.
                </p>
                <div className="mt-6 space-y-2.5">
                  <button
                    type="button"
                    onClick={start}
                    className="w-full rounded-xl bg-accent-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-600"
                  >
                    Open the demo
                  </button>
                  <Link
                    href="/login"
                    className="block w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-800 transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    Back to my account
                  </Link>
                </div>
              </div>
            )}

            {phase === 'error' && (
              <div>
                <h1 className="text-xl font-bold text-gray-900">The demo didn&apos;t start</h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{error}</p>
                <div className="mt-6 space-y-2.5">
                  <button
                    type="button"
                    onClick={start}
                    className="w-full rounded-xl bg-accent-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-600"
                  >
                    Try again
                  </button>
                  <Link
                    href="/register"
                    className="block w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-800 transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    Create a free account instead
                  </Link>
                </div>
              </div>
            )}
          </div>

          <p className="mt-5 text-center text-xs text-gray-500">© {new Date().getFullYear()} PathPilo</p>
        </div>
      </div>
    </DarkAuthShell>
  )
}
