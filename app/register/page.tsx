'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { EyeIcon, EyeSlashIcon, CheckIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { clearClientLocaleStorage, normalizeLocale, UI_LOCALE_STORAGE_KEY } from '../i18n'
import {
  getDashboardHref,
  getStoredUser,
  getUserDisplayName,
  hasCompanyContext,
  isClientLoggedIn,
} from '../utils/sessionClient'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const trialToken  = searchParams.get('trial')
  const requestedLang = normalizeLocale(searchParams.get('lang') || undefined)

  const [sessionMode, setSessionMode] = useState<'checking' | 'form' | 'loggedIn'>('checking')

  useEffect(() => {
    try {
      localStorage.setItem(UI_LOCALE_STORAGE_KEY, requestedLang)
    } catch {
      // no-op
    }
  }, [requestedLang])

  useEffect(() => {
    if (isClientLoggedIn() && getStoredUser()) {
      setSessionMode('loggedIn')
    } else {
      setSessionMode('form')
    }
  }, [])

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [invitationEmail, setInvitationEmail] = useState<string | null>(null)
  const [trialDays, setTrialDays] = useState<number | null>(null)
  const [formError, setFormError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [registrationStep, setRegistrationStep] = useState<'details' | 'verify'>('details')
  const [verificationCode, setVerificationCode] = useState('')
  const [codeSentMessage, setCodeSentMessage] = useState('')
  const [codeError, setCodeError] = useState('')

  // Load invitation details if token exists
  useEffect(() => {
    if (inviteToken) {
      fetch(apiUrl(`/invitations/${inviteToken}`))
        .then(res => res.json())
        .then(data => {
          if (data.invitation) {
            setInvitationEmail(data.invitation.email)
            setFormData(prev => ({ ...prev, email: data.invitation.email }))
          }
        })
        .catch(err => console.error('Error loading invitation:', err))
    }
  }, [inviteToken])

  // Load trial details if trial token exists
  useEffect(() => {
    if (trialToken) {
      fetch(apiUrl(`/trial/${trialToken}`))
        .then(res => res.json())
        .then(data => {
          if (data.trial) {
            const t = data.trial
            setTrialDays(t.trialDays)
            setFormData(prev => ({
              ...prev,
              firstName:  prev.firstName  || t.firstName  || '',
              lastName:   prev.lastName   || t.lastName   || '',
              email:      prev.email      || t.email      || '',
            }))
          }
        })
        .catch(err => console.error('Error loading trial:', err))
    }
  }, [trialToken])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    if (name === 'email') {
      setEmailError('')
      setRegistrationStep('details')
      setVerificationCode('')
      setCodeSentMessage('')
      setCodeError('')
    }
    if (formError) setFormError('')
  }

  const completeRegistration = async (token: string) => {
    const response = await fetch(apiUrl('/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        verificationToken: token,
        ...(inviteToken && { invitationToken: inviteToken }),
        ...(trialToken && { trialToken }),
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      if (data?.error === 'account_exists' && data?.loginUrl) {
        router.push(data.loginUrl)
        return
      }
      const msg = data?.message || data?.error || 'Registration failed'
      const lower = String(msg).toLowerCase()
      if (lower.includes('email') || lower.includes('already')) setEmailError(msg)
      else setFormError(msg)
      return
    }

    let userData = null
    if (data.token) {
      localStorage.setItem('token', data.token)
      const lang = normalizeLocale(data.user.languageCode)
      localStorage.setItem(UI_LOCALE_STORAGE_KEY, lang)
      userData = {
        id: data.user.id,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.email,
        languageCode: lang,
        role: data.user.role || data.user.activeCompany?.role || 'employee',
        companyId: data.user.companyId || data.user.activeCompany?.id || null,
        companyName: data.user.companyName || data.user.activeCompany?.name || null,
        companies: data.user.companies || [],
        activeCompany: data.user.activeCompany || null
      }
      localStorage.setItem('user', JSON.stringify(userData))
    }
    if (inviteToken) {
      const slug = userData?.activeCompany?.slug || userData?.companies?.[0]?.slug
      router.push(slug ? `/${slug}/dashboard` : '/select-company')
    } else {
      router.push('/setup/company')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setFormError('')
    setEmailError('')
    setCodeError('')

    try {
      if (registrationStep === 'details') {
        const response = await fetch(apiUrl('/auth/register/send-code'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email }),
        })
        const data = await response.json()
        if (!response.ok) {
          const msg = data?.message || data?.error || 'Failed to send verification code'
          const lower = String(msg).toLowerCase()
          if (lower.includes('email') || lower.includes('already')) setEmailError(msg)
          else setFormError(msg)
          return
        }
        setCodeSentMessage(`We sent a 6-digit code to ${data?.email || formData.email}.`)
        setRegistrationStep('verify')
        return
      }

      const verifyResponse = await fetch(apiUrl('/auth/register/verify-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, code: verificationCode }),
      })
      const verifyData = await verifyResponse.json()
      if (!verifyResponse.ok) {
        setCodeError(verifyData?.message || verifyData?.error || 'Invalid verification code')
        return
      }
      const token = verifyData?.verificationToken || ''
      if (!token) {
        setCodeError('Unable to verify code, please try again.')
        return
      }
      await completeRegistration(token)
    } catch (error) {
      console.error('Registration error:', error)
      setFormError('Network error: registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  const isDetailsValid = formData.firstName && formData.lastName && formData.email &&
    formData.password && formData.confirmPassword &&
    formData.acceptTerms && formData.password === formData.confirmPassword
  const isVerificationValid = verificationCode.trim().length === 6

  if (sessionMode === 'checking') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-primary-50/50 flex flex-col justify-center py-12 px-6">
        <div className="max-w-md mx-auto w-full text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-200 border-t-accent-500" />
          <p className="mt-2 text-gray-600">Loading…</p>
        </div>
      </div>
    )
  }

  if (sessionMode === 'loggedIn') {
    const user = getStoredUser()
    if (!user) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-white to-primary-50/50 flex flex-col justify-center py-12 px-6">
          <div className="max-w-md mx-auto w-full text-center text-sm text-gray-600">Session expired. Refresh the page.</div>
        </div>
      )
    }
    const displayName = getUserDisplayName(user)
    const companies = (Array.isArray(user.companies) ? user.companies : []) as Array<{
      id: number
      name: string
      slug?: string
    }>
    const ac = user.activeCompany as { id?: number; name?: string; slug?: string } | undefined
    const mergedCompanies: Array<{ id: number; name: string; slug: string }> = []
    const seen = new Set<number>()
    if (ac?.id != null && ac.slug) {
      mergedCompanies.push({ id: ac.id, name: ac.name || 'Company', slug: ac.slug })
      seen.add(ac.id)
    }
    for (const c of companies) {
      if (c.slug && !seen.has(c.id)) {
        mergedCompanies.push({ id: c.id, name: c.name || 'Company', slug: c.slug })
        seen.add(c.id)
      }
    }
    const hasCo = hasCompanyContext(user)

    const handleLogout = () => {
      clearClientLocaleStorage()
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      setSessionMode('form')
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-primary-50/50 flex flex-col justify-center py-12 px-6">
        <div className="max-w-md mx-auto w-full">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center space-x-2 mb-6">
              <div className="w-8 h-8 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl flex items-center justify-center shadow-lg shadow-accent-500/20">
                <span className="text-white font-bold text-lg">V</span>
              </div>
              <span className="text-xl font-bold text-primary-800 tracking-tight">PathPilo</span>
            </Link>
            <h1 className="text-2xl font-bold text-primary-800 tracking-tight mb-2">You&apos;re already signed in</h1>
            <p className="text-gray-600">
              You are logged in as <span className="font-semibold text-gray-900">{displayName}</span>
              {typeof user.email === 'string' && user.email ? (
                <span className="block text-sm text-gray-500 mt-1">{user.email}</span>
              ) : null}
            </p>
          </div>

          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 space-y-4">
            {hasCo ? (
              <>
                <p className="text-sm text-gray-600">
                  {mergedCompanies.length > 1 ? 'Open one of your companies:' : 'Go to your company:'}
                </p>
                <div className="space-y-2">
                  {mergedCompanies.map((c) => (
                    <a
                      key={c.id}
                      href={`/${c.slug}/dashboard`}
                      className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-left text-sm font-medium text-primary-800 transition hover:border-accent-300 hover:bg-accent-50/50"
                    >
                      <span>{c.name}</span>
                      <span className="text-accent-600">→</span>
                    </a>
                  ))}
                </div>
                {mergedCompanies.length === 0 && (
                  <a
                    href={getDashboardHref(user)}
                    className="flex w-full justify-center rounded-xl bg-accent-500 py-3 px-4 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 hover:bg-accent-600"
                  >
                    Go to dashboard
                  </a>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Finish setting up your company to get started.
                </p>
                <a
                  href="/setup/company"
                  className="flex w-full justify-center rounded-xl bg-accent-500 py-3 px-4 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 hover:bg-accent-600"
                >
                  Continue setup
                </a>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="w-full rounded-xl border border-gray-200 py-3 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Log out
            </button>

            <p className="text-center text-xs text-gray-500">
              Need a different account? Log out, then create a new account or sign in.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-primary-50/50 flex flex-col justify-center py-12 px-6">
      <div className="max-w-md mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-2 mb-6">
            <div className="w-8 h-8 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl flex items-center justify-center shadow-lg shadow-accent-500/20">
              <span className="text-white font-bold text-lg">V</span>
            </div>
            <span className="text-xl font-bold text-primary-800 tracking-tight">PathPilo</span>
          </Link>
          <h1 className="text-3xl font-bold text-primary-800 tracking-tight mb-2">
            {registrationStep === 'details' ? 'Create your account' : 'Verify your email'}
          </h1>
          <p className="text-gray-600 font-medium">
            {inviteToken
              ? 'Set up your account to join your team'
              : trialToken && trialDays
                ? "You've been invited to get started with PathPilo"
                : 'Get started for free today'}
          </p>
          {!inviteToken && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-50 border border-accent-200 rounded-full text-sm font-medium text-accent-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {'Free to get started'}
            </div>
          )}
        </div>

        {/* Registration Form */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 shadow-primary-500/5">
          <form onSubmit={handleSubmit} className="space-y-6">
            {formError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-700">{formError}</p>
              </div>
            )}
            {registrationStep === 'details' ? (
              <>
                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="input-field"
                      placeholder="John"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-xs font-semibold text-primary-700 mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="input-field"
                      placeholder="Doe"
                      required
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  {emailError && (
                    <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-sm font-medium text-red-700">{emailError}</p>
                    </div>
                  )}
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    readOnly={!!inviteToken || !!trialToken}
                    aria-invalid={!!emailError}
                    className={`input-field ${(inviteToken || trialToken) ? 'bg-gray-100 cursor-not-allowed' : ''} ${emailError ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                    placeholder="john@company.com"
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-xs font-semibold text-primary-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="input-field pr-10"
                      placeholder="Create a strong password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                      ) : (
                        <EyeIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirmPassword" className="block text-xs font-semibold text-primary-700 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="confirmPassword"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className="input-field pr-10"
                      placeholder="Confirm your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showConfirmPassword ? (
                        <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                      ) : (
                        <EyeIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="mt-1 text-sm text-red-600">Passwords do not match</p>
                  )}
                </div>

                {/* Terms and Conditions */}
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <input
                      type="checkbox"
                      id="acceptTerms"
                      name="acceptTerms"
                      checked={formData.acceptTerms}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      required
                    />
                  </div>
                  <label htmlFor="acceptTerms" className="text-sm text-gray-600">
                    I agree to the{' '}
                    <Link href="/terms" className="text-accent-600 hover:text-accent-700 font-medium">
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link href="/privacy" className="text-accent-600 hover:text-accent-700 font-medium">
                      Privacy Policy
                    </Link>
                  </label>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-accent-100 bg-accent-50/60 px-4 py-3">
                  <p className="text-sm text-accent-900 font-medium">
                    Enter the 6-digit code we sent to <span className="font-semibold">{formData.email}</span>.
                  </p>
                  {codeSentMessage ? <p className="mt-1 text-xs text-accent-700">{codeSentMessage}</p> : null}
                </div>
                {codeError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm font-medium text-red-700">{codeError}</p>
                  </div>
                ) : null}
                <div>
                  <label htmlFor="verificationCode" className="block text-xs font-semibold text-primary-700 mb-2">
                    Verification code
                  </label>
                  <input
                    type="text"
                    id="verificationCode"
                    name="verificationCode"
                    inputMode="numeric"
                    value={verificationCode}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6)
                      setVerificationCode(cleaned)
                      if (codeError) setCodeError('')
                    }}
                    className="input-field tracking-[0.35em] text-center text-lg font-semibold"
                    placeholder="123456"
                    required
                  />
                </div>
                <div className="flex justify-between items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setRegistrationStep('details')}
                    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Back to details
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsLoading(true)
                      setFormError('')
                      setCodeError('')
                      try {
                        const response = await fetch(apiUrl('/auth/register/send-code'), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: formData.email }),
                        })
                        const data = await response.json()
                        if (!response.ok) {
                          setCodeError(data?.message || data?.error || 'Failed to resend code')
                          return
                        }
                        setCodeSentMessage(`New code sent to ${data?.email || formData.email}.`)
                      } finally {
                        setIsLoading(false)
                      }
                    }}
                    className="text-sm font-semibold text-accent-700 hover:text-accent-800 transition-colors"
                  >
                    Resend code
                  </button>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={registrationStep === 'details' ? !isDetailsValid || isLoading : !isVerificationValid || isLoading}
              className={`w-full py-3 px-4 rounded-xl font-semibold transition-all duration-200 ${
                ((registrationStep === 'details' && isDetailsValid) || (registrationStep === 'verify' && isVerificationValid)) && !isLoading
                  ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-lg shadow-accent-500/20 hover:shadow-xl hover:shadow-accent-500/25'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  {registrationStep === 'details' ? 'Sending code...' : 'Verifying & creating account...'}
                </div>
              ) : (
                registrationStep === 'details'
                  ? 'Continue with email verification'
                  : 'Verify & Create Account'
              )}
            </button>
          </form>

          {/* Sign In Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link href={`/login?lang=${requestedLang}`} className="text-blue-600 hover:text-blue-700 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Features strip — only for non-invite registrations */}
        {!inviteToken && (
          <div className="mt-8 text-center">
            <div className="flex items-center justify-center space-x-6 text-sm text-gray-600">
              <div className="flex items-center space-x-1">
                <CheckIcon className="w-4 h-4 text-accent-500" />
                <span>Free to get started</span>
              </div>
              <div className="flex items-center space-x-1">
                <CheckIcon className="w-4 h-4 text-accent-500" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center space-x-1">
                <CheckIcon className="w-4 h-4 text-accent-500" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-white to-primary-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-200 border-t-accent-500"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  )
}
