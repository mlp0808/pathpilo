'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const SIGNUP_SESSION_STORAGE_KEY = 'pathpilo_signup_session'
const IDLE_RESEND_MS = 30 * 60 * 1000
const SKIP_PREFIXES = ['/admin', '/login', '/o/', '/reset-password', '/forgot-password']

const enabled = process.env.NEXT_PUBLIC_ACTIVITY_TRACKING !== 'off'

function send(body: Record<string, unknown>, token?: string | null) {
  try {
    void fetch('/api/events', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => {})
  } catch {
    /* analytics must never break the app */
  }
}

/** `/acme-cleaning/jobs/12` → `/jobs/12` so paths group across companies. */
function stripCompanySlug(pathname: string): string {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as {
      activeCompany?: { slug?: string }
      companies?: Array<{ slug?: string }>
    } | null
    const slugs = new Set(
      [user?.activeCompany?.slug, ...(user?.companies || []).map((c) => c?.slug)].filter(Boolean) as string[]
    )
    const first = pathname.split('/')[1]
    if (first && slugs.has(first)) return pathname.slice(first.length + 1) || '/'
  } catch {
    /* ignore malformed session */
  }
  return pathname
}

/**
 * Reports page views for signed-in users (GA style) so the superadmin can see
 * real sessions, and tells the server when someone with an unfinished signup
 * comes back to the signup form.
 */
export default function ActivityBeacon() {
  const pathname = usePathname()
  const hiddenAt = useRef<number | null>(null)
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !pathname) return
    if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return

    if (pathname.startsWith('/register')) {
      const anonymousId = localStorage.getItem(SIGNUP_SESSION_STORAGE_KEY)
      if (anonymousId) send({ anonymousId, events: [{ name: 'signup.form_viewed' }] })
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return
    const path = stripCompanySlug(pathname)
    if (path === lastPath.current) return
    lastPath.current = path
    send({ events: [{ name: 'page.viewed', path }] }, token)
  }, [pathname])

  useEffect(() => {
    if (!enabled) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      const wasHiddenFor = hiddenAt.current ? Date.now() - hiddenAt.current : 0
      hiddenAt.current = null
      if (wasHiddenFor < IDLE_RESEND_MS) return
      const token = localStorage.getItem('token')
      const current = window.location.pathname
      if (!token || SKIP_PREFIXES.some((p) => current.startsWith(p)) || current.startsWith('/register')) return
      send({ events: [{ name: 'page.viewed', path: stripCompanySlug(current), props: { resumed: true } }] }, token)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return null
}
