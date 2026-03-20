'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')

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
              localStorage.setItem('user', JSON.stringify({
                id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email,
                role: u.activeCompany?.role || u.role || 'employee',
                companyId: u.activeCompany?.id || null,
                companyName: u.activeCompany?.name || null,
                companies: u.companies || [],
                activeCompany: u.activeCompany || null,
              }))
              const slug = u.activeCompany?.slug || u.companies?.[0]?.slug
              router.push(slug ? `/${slug}/dashboard` : '/select-company')
              return
            }
          } catch { /* fall through to normal redirect */ }
        }

        // Normal login redirect
        const userData = {
          id: data.user.id,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          email: data.user.email,
          role: data.user.activeCompany?.role || data.user.role || 'employee',
          companyId: data.user.activeCompany?.id || data.user.companyId || null,
          companyName: data.user.activeCompany?.name || data.user.companyName || null,
          companies: data.user.companies || [],
          activeCompany: data.user.activeCompany || null,
        }
        localStorage.setItem('user', JSON.stringify(userData))

        const companySlug = data.user.activeCompany?.slug || data.user.companies?.[0]?.slug
        router.push(companySlug ? `/${companySlug}/dashboard` : '/select-company')
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

  return (
    <div className="min-h-screen bg-page flex flex-col justify-center py-12 px-6">
      <div className="max-w-md mx-auto w-full">

        {/* ── FORGOT PASSWORD – success ──────────────────────────────────── */}
        {view === 'forgot-sent' && (
          <>
            <div className="text-center mb-8">
              <span className="text-2xl font-bold text-primary-500">Vevago</span>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
              <div className="w-14 h-14 bg-accent-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-accent-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Check your inbox</h2>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                If <strong>{forgotEmail}</strong> has an account, we've sent a reset link. It expires in 1 hour.
              </p>
              <button onClick={() => { setView('login'); setForgotEmail('') }} className="text-sm text-primary-500 font-medium hover:underline">
                Back to sign in
              </button>
            </div>
          </>
        )}

        {/* ── FORGOT PASSWORD – request form ────────────────────────────── */}
        {view === 'forgot' && (
          <>
            <div className="text-center mb-8">
              <span className="text-2xl font-bold text-primary-500">Vevago</span>
              <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-2">Forgot password?</h1>
              <p className="text-gray-500 text-sm">Enter your email and we'll send you a reset link.</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              {forgotError && (
                <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-red-800 text-sm">{forgotError}</p>
                </div>
              )}
              <form onSubmit={handleForgotSubmit} className="space-y-5">
                <div>
                  <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-2">Email address</label>
                  <input
                    type="email"
                    id="forgot-email"
                    value={forgotEmail}
                    onChange={e => { setForgotEmail(e.target.value); if (forgotError) setForgotError('') }}
                    className="input-field"
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!forgotEmail || forgotLoading}
                  className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                    forgotEmail && !forgotLoading
                      ? 'bg-accent-500 hover:bg-accent-600 text-primary-500 shadow-sm'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {forgotLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      Sending…
                    </span>
                  ) : 'Send reset link'}
                </button>
              </form>
              <div className="mt-6 text-center">
                <button onClick={() => { setView('login'); setForgotError('') }} className="text-sm text-gray-500 hover:text-gray-700">
                  ← Back to sign in
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── LOGIN FORM ────────────────────────────────────────────────── */}
        {view === 'login' && (
          <>
            <div className="text-center mb-8">
              <span className="text-2xl font-bold text-primary-500">Vevago</span>
              <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-2">
                {inviteToken ? 'Log in to accept your invite' : 'Welcome back'}
              </h1>
              <p className="text-gray-500 text-sm">
                {inviteToken ? "Sign in and we'll add you to the company automatically" : 'Sign in to your account'}
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
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
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="input-field"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                    <button
                      type="button"
                      onClick={() => { setView('forgot'); setForgotEmail(formData.email); setForgotError('') }}
                      className="text-xs text-primary-500 hover:underline font-medium"
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
                  className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                    isFormValid && !isLoading
                      ? 'bg-accent-500 hover:bg-accent-600 text-primary-500 shadow-sm'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      Signing in…
                    </span>
                  ) : inviteToken ? 'Sign in & accept invite' : 'Sign in'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-500">
                  Don't have an account?{' '}
                  <Link href={inviteToken ? `/register?invite=${inviteToken}` : '/register'} className="text-primary-500 font-medium hover:underline">
                    Sign up
                  </Link>
                </p>
              </div>
            </div>

            {/* Demo credentials */}
            <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Demo accounts</p>
              <div className="space-y-1 text-xs text-gray-500">
                <p><span className="font-medium text-gray-700">Owner:</span> admin@glasklart.dk / demo1234</p>
                <p><span className="font-medium text-gray-700">Employee:</span> mikkel@glasklart.dk / demo1234</p>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}

