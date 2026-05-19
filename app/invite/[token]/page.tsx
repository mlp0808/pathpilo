'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { apiUrl } from '../../utils/api'
import { normalizeLocale, UI_LOCALE_STORAGE_KEY } from '../../i18n'
import { applySingleCompanyAutoSelect, getDashboardHref } from '../../utils/sessionClient'

interface Invitation {
  id: number
  email: string
  role: string
  companyName: string
  invitedByName: string
  expiresAt: string
  userExists?: boolean
}

export default function InvitePage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [alreadyAccepted, setAlreadyAccepted] = useState(false)

  useEffect(() => {
    checkAuthAndLoadInvitation()
  }, [token])

  const checkAuthAndLoadInvitation = async () => {
    const authToken = localStorage.getItem('token')
    setIsLoggedIn(!!authToken)

    try {
      const response = await fetch(apiUrl(`/invitations/${token}`))
      const data = await response.json()

      if (response.ok) {
        setInvitation(data.invitation)

        if (authToken && data.invitation) {
          const userData = localStorage.getItem('user')
          if (userData) {
            try {
              const user = JSON.parse(userData)
              if (user.companies && user.companies.some((c: any) => c.name === data.invitation.companyName)) {
                setAlreadyAccepted(true)
              }
            } catch { /* ignore */ }
          }
        }
      } else {
        setError(data.error || 'Invitation not found or expired')
      }
    } catch {
      setError('Failed to load invitation')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptInvite = async () => {
    if (!invitation) return
    setAccepting(true)
    try {
      const authToken = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/invitations/${token}/accept`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await response.json()
      if (response.ok) {
        if (data.token) localStorage.setItem('token', data.token)
        if (data.user) {
          const lang = normalizeLocale(data.user.languageCode)
          localStorage.setItem(UI_LOCALE_STORAGE_KEY, lang)
          let userData: Record<string, unknown> = {
            id: data.user.id,
            firstName: data.user.firstName,
            lastName: data.user.lastName,
            email: data.user.email,
            languageCode: lang,
            role: data.user.activeCompany?.role || data.user.role || 'employee',
            companyId: data.user.activeCompany?.id || data.user.companyId || null,
            companyName: data.user.activeCompany?.name || data.user.companyName || null,
            companies: data.user.companies || [],
            activeCompany: data.user.activeCompany || null,
            pendingInvites: data.user.pendingInvites || [],
          }
          userData = applySingleCompanyAutoSelect(userData)
          localStorage.setItem('user', JSON.stringify(userData))
          router.push(getDashboardHref(userData))
        } else {
          router.push('/select-company')
        }
      } else {
        setError(data.error || 'Failed to accept invitation')
      }
    } catch {
      setError('Network error: Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  const rolePretty = (r: string) =>
    r === 'owner' ? 'Owner' : r === 'manager' ? 'Manager' : 'Employee'

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading invitation…</p>
        </div>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center px-6">
        <div className="max-w-md w-full">
          {/* Brand */}
          <div className="text-center mb-8">
            <span className="text-2xl font-bold text-primary-500">
              {process.env.NEXT_PUBLIC_APP_NAME || 'Vevago'}
            </span>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="mx-auto w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Invitation</h2>
            <p className="text-gray-500 mb-6">{error}</p>
            <Link
              href="/"
              className="inline-flex items-center px-5 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors text-sm font-medium"
            >
              Go to Homepage
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!invitation) return null

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">

        {/* Brand header */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-primary-500">
            {process.env.NEXT_PUBLIC_APP_NAME || 'Vevago'}
          </span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

          {/* Top accent bar */}
          <div className="h-1 bg-accent-500 w-full" />

          <div className="p-8">
            {/* Icon */}
            <div className="w-14 h-14 bg-accent-50 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-7 h-7 text-accent-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">You've been invited!</h1>
            <p className="text-gray-500 mb-6 leading-relaxed">
              <span className="font-medium text-gray-800">{invitation.invitedByName}</span> has
              invited you to join{' '}
              <span className="font-semibold text-primary-500">{invitation.companyName}</span> as a{' '}
              <span className="font-medium text-gray-800">{rolePretty(invitation.role)}</span>.
            </p>

            {/* Info pills */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-page rounded-xl p-3.5 border border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Company</p>
                <p className="text-sm font-semibold text-gray-900">{invitation.companyName}</p>
              </div>
              <div className="bg-page rounded-xl p-3.5 border border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Your role</p>
                <p className="text-sm font-semibold text-gray-900">{rolePretty(invitation.role)}</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}

            {alreadyAccepted ? (
              <div className="space-y-3">
                <div className="p-4 bg-accent-50 border border-accent-400/30 rounded-xl text-center">
                  <svg className="w-6 h-6 text-accent-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm font-medium text-gray-800">You've already joined {invitation.companyName}!</p>
                </div>
                <Link
                  href="/dashboard"
                  className="block w-full py-3 text-center bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors text-sm"
                >
                  Go to Dashboard
                </Link>
              </div>
            ) : isLoggedIn ? (
              <div className="space-y-3">
                <button
                  onClick={handleAcceptInvite}
                  disabled={accepting}
                  className="w-full py-3 bg-accent-500 text-primary-500 font-bold rounded-xl hover:bg-accent-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                >
                  {accepting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      Accepting…
                    </span>
                  ) : 'Accept Invitation'}
                </button>
                <Link
                  href="/dashboard"
                  className="block text-center text-sm text-gray-400 hover:text-gray-700 transition-colors"
                >
                  Go to Dashboard instead
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {invitation.userExists ? (
                  <>
                    <Link
                      href={`/login?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invitation.email)}`}
                      className="block w-full py-3 text-center bg-accent-500 text-primary-500 rounded-xl font-bold hover:bg-accent-600 transition-colors text-sm"
                    >
                      Log in to accept
                    </Link>
                    <p className="text-center text-xs text-gray-400">
                      We found an existing account for {invitation.email}
                    </p>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/register?invite=${token}`}
                      className="block w-full py-3 text-center bg-accent-500 text-primary-500 rounded-xl font-bold hover:bg-accent-600 transition-colors text-sm"
                    >
                      Create account &amp; accept
                    </Link>
                    <p className="text-center text-xs text-gray-400">
                      Free to join — no credit card required
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Invited by {invitation.invitedByName} · Expires{' '}
          {new Date(invitation.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}
