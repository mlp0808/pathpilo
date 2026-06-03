'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../utils/api'
import { clearClientLocaleStorage } from '../i18n'
import { applySingleCompanyAutoSelect, getDashboardHref } from '../utils/sessionClient'

interface Company {
  id: number
  name: string
  slug: string
  role: string
}

interface PendingInvite {
  token: string
  role: string
  companyName: string
  companySlug?: string
  expiresAt: string
  invitedByName?: string
}

function parseSessionUser(): Record<string, unknown> | null {
  const raw = localStorage.getItem('user')
  if (!raw) return null
  try {
    const u = JSON.parse(raw) as Record<string, unknown>
    return u && typeof u === 'object' ? u : null
  } catch {
    return null
  }
}

export default function SelectCompanyPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [actionToken, setActionToken] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [selectingCompanyId, setSelectingCompanyId] = useState<number | null>(null)

  const applySession = useCallback(
    (user: Record<string, unknown>) => {
      setUserName(typeof user.firstName === 'string' ? user.firstName : '')
      const list = (Array.isArray(user.companies) ? user.companies : []) as Company[]
      const withSlug = list.filter((c) => c.slug)
      setCompanies(withSlug as Company[])
      setPendingInvites(
        (Array.isArray(user.pendingInvites) ? user.pendingInvites : []) as PendingInvite[]
      )

      const p = (Array.isArray(user.pendingInvites) ? user.pendingInvites : []) as unknown[]
      if (withSlug.length === 1 && p.length === 0 && withSlug[0]?.slug) {
        const merged = applySingleCompanyAutoSelect(user)
        localStorage.setItem('user', JSON.stringify(merged))
        router.replace(getDashboardHref(merged))
        return true
      }
      return false
    },
    [router]
  )

  const refreshFromApi = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return null
    }
    try {
      const res = await fetch(apiUrl('/user/profile'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return parseSessionUser()
      const data = await res.json()
      const p = data?.user
      if (!p) return parseSessionUser()
      const prev = parseSessionUser() || {}
      const merged = {
        ...prev,
        id: p.id ?? prev.id,
        firstName: p.firstName ?? prev.firstName,
        lastName: p.lastName ?? prev.lastName,
        email: p.email ?? prev.email,
        languageCode: p.languageCode ?? prev.languageCode,
        role: p.activeCompany?.role ?? p.role ?? prev.role,
        companies: p.companies ?? prev.companies,
        pendingInvites: p.pendingInvites ?? prev.pendingInvites ?? [],
        activeCompany: p.activeCompany !== undefined ? p.activeCompany : prev.activeCompany,
        companyId: p.companyId !== undefined ? p.companyId : prev.companyId,
        companyName: p.companyName !== undefined ? p.companyName : prev.companyName,
      }
      localStorage.setItem('user', JSON.stringify(merged))
      return merged as Record<string, unknown>
    } catch {
      return parseSessionUser()
    }
  }, [router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const token = localStorage.getItem('token')
      if (!token) {
        router.replace('/login')
        return
      }
      const refreshed = await refreshFromApi()
      if (cancelled) return
      const user = refreshed || parseSessionUser()
      if (!user) {
        router.replace('/login')
        return
      }
      if (!applySession(user)) {
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applySession, refreshFromApi, router])

  const persistAuthUser = (token: string, u: Record<string, unknown>) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(u))
  }

  const handleAcceptInvite = async (invite: PendingInvite) => {
    setActionError('')
    setActionToken(invite.token)
    try {
      const authToken = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/invitations/${invite.token}/accept`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Could not accept invitation')
        return
      }
      const u = data.user as Record<string, unknown>
      const merged = applySingleCompanyAutoSelect({
        ...u,
        pendingInvites: u.pendingInvites || [],
        companies: u.companies || [],
      })
      persistAuthUser(data.token, merged)
      if (applySession(merged)) return
      setCompanies((merged.companies as Company[]) || [])
      setPendingInvites((merged.pendingInvites as PendingInvite[]) || [])
    } catch {
      setActionError('Network error. Try again.')
    } finally {
      setActionToken(null)
    }
  }

  const handleDeclineInvite = async (invite: PendingInvite) => {
    setActionError('')
    setActionToken(invite.token)
    try {
      const authToken = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/invitations/${invite.token}/decline`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Could not decline invitation')
        return
      }
      const u = data.user as Record<string, unknown>
      const merged = applySingleCompanyAutoSelect({
        ...u,
        pendingInvites: u.pendingInvites || [],
        companies: u.companies || [],
      })
      persistAuthUser(data.token, merged)
      if (applySession(merged)) return
      setCompanies((merged.companies as Company[]) || [])
      setPendingInvites((merged.pendingInvites as PendingInvite[]) || [])
    } catch {
      setActionError('Network error. Try again.')
    } finally {
      setActionToken(null)
    }
  }

  const handleSelect = async (company: Company) => {
    setActionError('')
    setSelectingCompanyId(company.id)
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.replace('/login')
        return
      }
      const res = await fetch(apiUrl('/companies/switch'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ company_id: company.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Could not open this company')
        return
      }
      persistAuthUser(data.token, data.user as Record<string, unknown>)
      const slug = (data.user as { activeCompany?: { slug?: string } })?.activeCompany?.slug || company.slug
      router.push(`/${slug}/dashboard`)
    } catch {
      setActionError('Network error. Try again.')
    } finally {
      setSelectingCompanyId(null)
    }
  }

  const handleLogout = () => {
    clearClientLocaleStorage()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  const roleLabel = (r: string) =>
    r === 'owner' ? 'Owner' : r === 'manager' ? 'Manager' : 'Employee'

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/40 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Preparing your workspace…</p>
        </div>
      </div>
    )
  }

  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Vevago'

  if (companies.length === 0 && pendingInvites.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/40 flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="bg-white/90 backdrop-blur rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-10">
            <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-5 ring-1 ring-primary-100">
              <svg className="w-8 h-8 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">No workspace yet</h2>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
              You&apos;re not linked to a company and there are no open invitations. Ask an admin to invite
              you, or sign in with a different account.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/40 flex items-center justify-center px-4 py-8 sm:py-12 sm:px-6 pt-safe pb-safe">
      <div className="max-w-lg w-full">
        <div className="text-center mb-10">
          <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
            {appName}
          </span>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white/90 backdrop-blur-xl shadow-2xl shadow-slate-300/40 overflow-hidden">
          <div className="px-8 pt-8 pb-6 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {userName ? `Hi, ${userName}` : 'Welcome back'}
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              {pendingInvites.length > 0
                ? 'Respond to invitations first, then pick a company to open.'
                : companies.length > 1
                  ? 'Choose which company you want to work in.'
                  : 'Open your company workspace.'}
            </p>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {actionError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {actionError}
              </div>
            ) : null}

            {pendingInvites.length > 0 ? (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-500/30" aria-hidden />
                  <span className="text-amber-700">Pending invitations</span>
                </h2>
                <ul className="space-y-3">
                  {pendingInvites.map((inv) => {
                    const busy = actionToken === inv.token
                    return (
                      <li
                        key={inv.token}
                        className="relative overflow-hidden rounded-2xl border border-orange-200/55 bg-gradient-to-br from-orange-50/70 via-amber-50/45 to-white p-5 shadow-sm"
                      >
                        <div
                          className="pointer-events-none absolute -top-10 right-0 h-28 w-28 rounded-full bg-orange-200/15 blur-2xl"
                          aria-hidden
                        />
                        <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200/80 mb-2">
                              Pending
                            </span>
                            <p className="text-lg font-bold text-slate-900 truncate">{inv.companyName}</p>
                            <p className="text-sm text-slate-600 mt-1">
                              <span className="font-medium text-slate-800">{roleLabel(inv.role)}</span>
                              <span className="text-slate-400"> · </span>
                              <span className="text-slate-500">from {inv.invitedByName || 'your team'}</span>
                            </p>
                            <p className="text-xs text-slate-400 mt-2">
                              Expires{' '}
                              {new Date(inv.expiresAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDeclineInvite(inv)}
                              className="order-2 sm:order-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleAcceptInvite(inv)}
                              className="order-1 sm:order-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-accent-500 text-primary-500 shadow-sm hover:bg-accent-600 transition-colors disabled:opacity-60"
                            >
                              {busy ? (
                                <span className="flex items-center justify-center gap-2">
                                  <span className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                                  Working…
                                </span>
                              ) : (
                                'Accept'
                              )}
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            {companies.length > 0 ? (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Your companies
                </h2>
                <ul className="space-y-2">
                  {companies.map((company) => {
                    const busy = selectingCompanyId === company.id
                    return (
                    <li key={company.id}>
                      <button
                        type="button"
                        disabled={selectingCompanyId != null}
                        onClick={() => void handleSelect(company)}
                        className="w-full flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-4 text-left hover:border-primary-200 hover:bg-primary-50/30 transition-all group disabled:opacity-60"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary-500/20">
                          <span className="text-lg font-bold text-white">
                            {company.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{company.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{roleLabel(company.role)}</p>
                        </div>
                        {busy ? (
                          <span className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        ) : (
                          <svg
                            className="w-5 h-5 text-slate-300 group-hover:text-primary-500 transition-colors flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                    </li>
                  )})}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className="text-center mt-8">
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
