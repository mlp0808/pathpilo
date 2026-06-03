'use client'

import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { EyeIcon, EyeSlashIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import DarkAuthShell from '../components/DarkAuthShell'
import {
  applySingleCompanyAutoSelect,
  getDashboardHref,
  getStoredUser,
  hasAppWorkspace,
  isClientLoggedIn,
} from '../utils/sessionClient'
import { normalizeLocale, UI_LOCALE_STORAGE_KEY } from '../i18n'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const emailFromUrl = searchParams.get('email')
  const requestedLang = normalizeLocale(searchParams.get('lang') || undefined)

  const [inviteForExistingAccount, setInviteForExistingAccount] = useState(false)

  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(UI_LOCALE_STORAGE_KEY, requestedLang)
    } catch {
      // no-op
    }
  }, [requestedLang])

  useEffect(() => {
    if (!isClientLoggedIn()) {
      setAuthChecked(true)
      return
    }
    const u = getStoredUser()
    if (u && hasAppWorkspace(u)) {
      router.replace(getDashboardHref(applySingleCompanyAutoSelect(u)))
      return
    }
    if (u && !hasAppWorkspace(u)) {
      router.replace('/setup/company')
      return
    }
    setAuthChecked(true)
  }, [router])

  // ── login state ────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // ── forgot-password state ──────────────────────────────────────────────────
  type View = 'login' | 'forgot' | 'forgot-sent'
  const [view, setView] = useState<View>('login')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')

  useEffect(() => {
    if (!inviteToken) return
    let cancelled = false
    fetch(apiUrl(`/invitations/${inviteToken}`))
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.invitation) return
        setInviteForExistingAccount(!!d.invitation.userExists)
        setFormData((prev) => ({
          ...prev,
          email: prev.email || d.invitation.email || '',
        }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [inviteToken])

  useEffect(() => {
    if (!emailFromUrl) return
    try {
      const decoded = decodeURIComponent(emailFromUrl)
      if (decoded) setFormData((prev) => ({ ...prev, email: decoded }))
    } catch {
      /* ignore */
    }
  }, [emailFromUrl])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (error) setError('')
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotLoading(true); setForgotError('')
    try {
      const res = await fetch(apiUrl('/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
      if (res.ok) { setView('forgot-sent') }
      else { const d = await res.json(); setForgotError(d.error || 'Something went wrong') }
    } catch { setForgotError('Network error. Please try again.') }
    finally { setForgotLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      const response = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // Store auth token immediately
        localStorage.setItem('token', data.token)

        // If there's an invite token, auto-accept before redirecting
        if (inviteToken) {
          try {
            const acceptRes = await fetch(apiUrl(`/invitations/${inviteToken}/accept`), {
              method: 'POST',
              headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' },
            })
            const acceptData = await acceptRes.json()
            if (acceptRes.ok && acceptData.token) {
              // Use the refreshed token that includes the new company
              localStorage.setItem('token', acceptData.token)
              const u = acceptData.user
              const lang = normalizeLocale(data.user.languageCode)
              localStorage.setItem(UI_LOCALE_STORAGE_KEY, lang)
              let userData: Record<string, unknown> = {
                id: u.id,
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
                languageCode: lang,
                role: u.activeCompany?.role || u.role || 'employee',
                companyId: u.activeCompany?.id || u.companyId || null,
                companyName: u.activeCompany?.name || u.companyName || null,
                companies: u.companies || [],
                activeCompany: u.activeCompany || null,
                pendingInvites: u.pendingInvites || [],
              }
              userData = applySingleCompanyAutoSelect(userData)
              localStorage.setItem('user', JSON.stringify(userData))
              router.push(getDashboardHref(userData))
              return
            }
          } catch { /* fall through to normal redirect */ }
        }

        // Normal login redirect
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
        setError(data.error || 'Login failed')
      }
    } catch (error) {
      console.error('Login error:', error)
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const isFormValid = formData.email && formData.password

  if (!authChecked) {
    return (
      <DarkAuthShell>
        <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10 pt-safe pb-safe">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-400" />
            <p className="mt-2 text-sm text-gray-400">Loading…</p>
          </div>
        </div>
      </DarkAuthShell>
    )
  }

  const showDemo = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === 'true'

  return (
    <DarkAuthShell>
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10 pt-safe pb-safe">
        <div className="w-full max-w-sm">
          {/* Brand */}
          <div className="mb-8 text-center">
            <Link href="/" className="inline-flex items-center justify-center">
              <Image
                src="/images/brand/logo-header-white.png"
                alt="PathPilo"
                width={160}
                height={50}
                priority
                className="mx-auto mb-8 h-10 w-auto"
              />
            </Link>

            {view === 'login' && (
              <>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  {inviteToken ? 'Sign in to accept your invite' : 'Welcome back'}
                </h1>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-300">
                  {inviteToken
                    ? inviteForExistingAccount
                      ? "Enter your password below — we'll connect you to the company from your invite."
                      : "Sign in with this email and password — we'll add you to the company from your invite."
                    : 'Sign in to your PathPilo account'}
                </p>
              </>
            )}
            {view === 'forgot' && (
              <>
                <h1 className="text-2xl font-bold tracking-tight text-white">Forgot password?</h1>
                <p className="mt-1.5 text-sm text-gray-300">No worries — we&apos;ll email you a reset link.</p>
              </>
            )}
            {view === 'forgot-sent' && (
              <>
                <h1 className="text-2xl font-bold tracking-tight text-white">Check your inbox</h1>
                <p className="mt-1.5 text-sm text-gray-300">A reset link is on its way.</p>
              </>
            )}
          </div>

          {/* ── FORGOT PASSWORD – success ──────────────────────────── */}
          {view === 'forgot-sent' && (
            <div className="rounded-3xl bg-white p-8 text-center shadow-2xl shadow-black/40 ring-1 ring-white/10">
              <div className="w-14 h-14 bg-accent-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircleIcon className="w-8 h-8 text-accent-500" />
              </div>
              <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                If <span className="font-semibold text-gray-900">{forgotEmail}</span> has a PathPilo account, we&apos;ve sent a reset link. It expires in 1 hour.
              </p>
              <button
                onClick={() => { setView('login'); setForgotEmail('') }}
                className="w-full py-3 px-4 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-semibold transition-colors shadow-lg shadow-accent-500/20"
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* ── FORGOT PASSWORD – request form ────────────────────── */}
          {view === 'forgot' && (
            <div className="rounded-3xl bg-white p-8 shadow-2xl shadow-black/40 ring-1 ring-white/10">
              {forgotError && (
                <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-red-800 text-sm">{forgotError}</p>
                </div>
              )}
              <form onSubmit={handleForgotSubmit} className="space-y-5">
                <div>
                  <label htmlFor="forgot-email" className="mb-1.5 block text-xs font-semibold text-gray-700">Email address</label>
                  <input
                    type="email"
                    id="forgot-email"
                    value={forgotEmail}
                    onChange={e => { setForgotEmail(e.target.value); if (forgotError) setForgotError('') }}
                    className="input-field"
                    placeholder="you@company.com"
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!forgotEmail || forgotLoading}
                  className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                    forgotEmail && !forgotLoading
                      ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-lg shadow-accent-500/20'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {forgotLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending…
                    </span>
                  ) : 'Send reset link'}
                </button>
              </form>
              <div className="mt-6 text-center">
                <button
                  onClick={() => { setView('login'); setForgotError('') }}
                  className="text-sm font-semibold text-accent-700 hover:text-accent-800"
                >
                  ← Back to sign in
                </button>
              </div>
            </div>
          )}

          {/* ── LOGIN FORM ────────────────────────────────────────── */}
          {view === 'login' && (
            <>
              <div className="rounded-3xl bg-white p-8 shadow-2xl shadow-black/40 ring-1 ring-white/10">
                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <p className="text-red-800 text-sm">{error}</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-gray-700">Email</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      readOnly={!!inviteToken}
                      className={`input-field${inviteToken ? ' bg-gray-50 text-gray-700 cursor-not-allowed' : ''}`}
                      placeholder="you@company.com"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="password" className="text-xs font-semibold text-gray-700">Password</label>
                      <button
                        type="button"
                        onClick={() => { setView('forgot'); setForgotEmail(formData.email); setForgotError('') }}
                        className="text-xs text-accent-700 hover:text-accent-800 font-semibold"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleInputChange}
                        className="input-field pr-10"
                        placeholder="Your password"
                        required
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                        {showPassword ? <EyeSlashIcon className="h-5 w-5 text-gray-400" /> : <EyeIcon className="h-5 w-5 text-gray-400" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!isFormValid || isLoading}
                    className={`w-full py-3 px-4 rounded-xl font-semibold transition-all duration-200 ${
                      isFormValid && !isLoading
                        ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-lg shadow-accent-500/20 hover:shadow-xl hover:shadow-accent-500/30'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Signing in…
                      </span>
                    ) : inviteToken ? 'Sign in & accept invite' : 'Sign in'}
                  </button>
                </form>

                {!inviteForExistingAccount && (
                  <>
                    <div className="my-6 flex items-center gap-4">
                      <div className="h-px flex-1 bg-gray-200" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">New here?</span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                    <Link
                      href={
                        inviteToken
                          ? `/register?invite=${inviteToken}&lang=${requestedLang}`
                          : `/register?lang=${requestedLang}`
                      }
                      className="block w-full rounded-xl border-2 border-gray-200 py-3 px-4 text-center text-sm font-semibold text-gray-800 transition-colors hover:border-gray-300 hover:bg-gray-50"
                    >
                      Create your free account
                    </Link>
                  </>
                )}
              </div>

              {/* Trust strip */}
              <p className="mt-6 text-center text-xs text-gray-400">
                Free trial · No credit card · Cancel anytime
              </p>

              {showDemo && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Demo accounts</p>
                  <div className="space-y-1 text-xs text-gray-400">
                    <p><span className="font-medium text-gray-300">Owner:</span> admin@glasklart.dk / demo1234</p>
                    <p><span className="font-medium text-gray-300">Employee:</span> mikkel@glasklart.dk / demo1234</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <p className="mt-5 text-center text-xs text-gray-500">
            © {new Date().getFullYear()} PathPilo
          </p>
        </div>
      </div>
    </DarkAuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0a1414]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-400" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}

