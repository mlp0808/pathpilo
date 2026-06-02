'use client'

import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { clearClientLocaleStorage, normalizeLocale, UI_LOCALE_STORAGE_KEY } from '../i18n'
import {
  applySingleCompanyAutoSelect,
  getDashboardHref,
  getStoredUser,
  getUserDisplayName,
  hasAppWorkspace,
  isClientLoggedIn,
} from '../utils/sessionClient'

// ─── Funnel tracking ──────────────────────────────────────────────────────────

const SIGNUP_SESSION_STORAGE_KEY = 'pathpilo_signup_session'

function getSignupSessionId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = localStorage.getItem(SIGNUP_SESSION_STORAGE_KEY)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(SIGNUP_SESSION_STORAGE_KEY, id) }
    return id
  } catch { return '' }
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    dataLayer?: Record<string, unknown>[]
    hj?: (command: string, eventName?: string) => void
  }
}

function pushDataLayer(payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(payload)
}

async function postSignupProgress(
  apiUrlFn: (path: string) => string,
  payload: { step: string; firstName?: string; lastName?: string; email?: string }
) {
  const sessionId = getSignupSessionId()
  if (!sessionId) return
  try {
    await fetch(apiUrlFn('/auth/register/signup-progress'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, ...payload }),
    })
  } catch { /* funnel tracking only */ }
}

// ─── Flow stages ─────────────────────────────────────────────────────────────
// email      → user is typing their email
// expanding  → email checked OK, animation playing
// form       → full form visible
// verify     → code sent, waiting for code entry
type Stage = 'email' | 'expanding' | 'form' | 'verify'

// ─── Main form ────────────────────────────────────────────────────────────────

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken  = searchParams.get('invite')
  const trialToken   = searchParams.get('trial')
  const requestedLang = normalizeLocale(searchParams.get('lang') || undefined)

  const [sessionMode, setSessionMode] = useState<'checking' | 'form' | 'loggedIn'>('checking')

  useEffect(() => {
    try { localStorage.setItem(UI_LOCALE_STORAGE_KEY, requestedLang) } catch { /* no-op */ }
  }, [requestedLang])

  useEffect(() => {
    setSessionMode(isClientLoggedIn() && getStoredUser() ? 'loggedIn' : 'form')
  }, [])

  // ── Form state ──────────────────────────────────────────────────────────────
  const [stage, setStage]               = useState<Stage>('email')
  const [email, setEmail]               = useState('')
  const [formData, setFormData]         = useState({ firstName: '', lastName: '', password: '', confirmPassword: '', acceptTerms: false })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)
  const [verificationCode, setVerifCode]= useState('')

  // Errors / messages
  const [emailError, setEmailError]     = useState('')
  const [formError, setFormError]       = useState('')
  const [codeError, setCodeError]       = useState('')
  const [codeSentMsg, setCodeSentMsg]   = useState('')
  const [isLoading, setIsLoading]       = useState(false)

  // Expanded-section animation ref
  const expandRef = useRef<HTMLDivElement>(null)

  // Invitation / trial prefill
  const [invitationEmail, setInvitationEmail] = useState<string | null>(null)
  const [trialDays, setTrialDays]             = useState<number | null>(null)

  useEffect(() => {
    if (!inviteToken) return
    fetch(apiUrl(`/invitations/${inviteToken}`))
      .then(r => r.json())
      .then(data => {
        if (data.invitation?.userExists) {
          router.replace(`/login?invite=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(data.invitation.email || '')}`)
          return
        }
        if (data.invitation) {
          setInvitationEmail(data.invitation.email)
          setEmail(data.invitation.email)
        }
      })
      .catch(console.error)
  }, [inviteToken, router])

  useEffect(() => {
    if (!trialToken) return
    fetch(apiUrl(`/trial/${trialToken}`))
      .then(r => r.json())
      .then(data => {
        if (data.trial) {
          setTrialDays(data.trial.trialDays)
          setEmail(data.trial.email || '')
          setFormData(prev => ({ ...prev, firstName: data.trial.firstName || '', lastName: data.trial.lastName || '' }))
        }
      })
      .catch(console.error)
  }, [trialToken])

  // Hotjar event on form view
  useEffect(() => {
    if (sessionMode !== 'form') return
    getSignupSessionId()
    window.hj?.('event', 'signup_form_view')
  }, [sessionMode])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  // Step 1: check email and expand form
  const handleEmailContinue = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError('')
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address')
      return
    }

    setIsLoading(true)
    try {
      const res  = await fetch(apiUrl('/auth/check-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const data = await res.json()
      if (data.exists) {
        setEmailError('An account with this email already exists.')
        return
      }
      // Trigger expansion animation
      setStage('expanding')
      // After a micro-tick allow the element to mount, then transition to full height
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (expandRef.current) expandRef.current.style.maxHeight = `${expandRef.current.scrollHeight}px`
          setStage('form')
        })
      })
    } catch {
      setEmailError('Unable to check email. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [email])

  // Step 2: send verification code
  const handleFormSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setIsLoading(true)
    try {
      const res  = await fetch(apiUrl('/auth/register/send-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data?.message || data?.error || 'Failed to send code'
        if (String(msg).toLowerCase().includes('email') || String(msg).toLowerCase().includes('already')) {
          setEmailError(msg)
          // Collapse back to email stage
          setStage('email')
          if (expandRef.current) expandRef.current.style.maxHeight = '0'
        } else {
          setFormError(msg)
        }
        return
      }
      pushDataLayer({ event: 'registration_form_submitted', step: 'details' })
      window.fbq?.('track', 'CompleteRegistration', { stage: 'details_submitted' })
      void postSignupProgress(apiUrl, { step: 'code_sent', firstName: formData.firstName, lastName: formData.lastName, email: email.trim() })
      window.hj?.('event', 'signup_code_sent')
      setCodeSentMsg(`We sent a 6-digit code to ${email.trim()}.`)
      setStage('verify')
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [email, formData.firstName, formData.lastName])

  // Step 3: verify code + create account
  const handleVerifySubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setCodeError('')
    setIsLoading(true)
    try {
      // Verify the code
      const verifyRes  = await fetch(apiUrl('/auth/register/verify-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: verificationCode }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok) { setCodeError(verifyData?.message || verifyData?.error || 'Invalid code'); return }
      const token = verifyData?.verificationToken || ''
      if (!token) { setCodeError('Unable to verify. Please try again.'); return }

      // Create the account
      const regRes = await fetch(apiUrl('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName:  formData.lastName,
          email:     email.trim(),
          password:  formData.password,
          languageCode: requestedLang,
          verificationToken: token,
          signupSessionId: getSignupSessionId(),
          plan: 'standard',
          ...(inviteToken && { invitationToken: inviteToken }),
          ...(trialToken  && { trialToken }),
        }),
      })
      const regData = await regRes.json()
      if (!regRes.ok) {
        if (regData?.error === 'account_exists' && regData?.loginUrl) { router.push(regData.loginUrl); return }
        setFormError(regData?.message || regData?.error || 'Registration failed')
        setStage('form')
        return
      }

      window.hj?.('event', 'signup_code_verified')
      pushDataLayer({ event: 'email_verification_completed' })

      // Persist session
      if (regData.token) {
        localStorage.setItem('token', regData.token)
        const lang = normalizeLocale(regData.user.languageCode)
        localStorage.setItem(UI_LOCALE_STORAGE_KEY, lang)
        const userData = {
          id: regData.user.id, firstName: regData.user.firstName, lastName: regData.user.lastName,
          email: regData.user.email, languageCode: lang,
          role: regData.user.role || regData.user.activeCompany?.role || 'employee',
          companyId: regData.user.companyId || regData.user.activeCompany?.id || null,
          companyName: regData.user.companyName || regData.user.activeCompany?.name || null,
          companies: regData.user.companies || [],
          activeCompany: regData.user.activeCompany || null,
          pendingInvites: regData.user.pendingInvites || [],
        }
        const session = applySingleCompanyAutoSelect(userData as Record<string, unknown>)
        localStorage.setItem('user', JSON.stringify(session))
        if (inviteToken) { router.push(getDashboardHref(session)); return }
      }
      router.push('/setup/company')
    } catch {
      setCodeError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [email, verificationCode, formData, requestedLang, inviteToken, trialToken, router])

  // ── Already logged in ─────────────────────────────────────────────────────

  if (sessionMode === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-primary-50/50">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-200 border-t-accent-500" />
      </div>
    )
  }

  if (sessionMode === 'loggedIn') {
    const user = getStoredUser()
    if (!user) return null
    const displayName = getUserDisplayName(user)
    const companies   = (Array.isArray(user.companies) ? user.companies : []) as Array<{ id: number; name: string; slug?: string }>
    const ac          = user.activeCompany as { id?: number; name?: string; slug?: string } | undefined
    const merged: Array<{ id: number; name: string; slug: string }> = []
    const seen = new Set<number>()
    if (ac?.id != null && ac.slug) { merged.push({ id: ac.id, name: ac.name || 'Company', slug: ac.slug }); seen.add(ac.id) }
    for (const c of companies) { if (c.slug && !seen.has(c.id)) { merged.push({ id: c.id, name: c.name || 'Company', slug: c.slug }); seen.add(c.id) } }

    return (
      <div className="min-h-screen flex flex-col justify-center items-center px-4 bg-gradient-to-b from-white to-primary-50/50">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/"><Image src="/images/brand/logo.png" alt="PathPilo" width={160} height={50} priority className="h-10 w-auto mx-auto mb-6" /></Link>
            <p className="text-gray-600">Signed in as <span className="font-semibold">{displayName}</span></p>
          </div>
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 space-y-3">
            {hasAppWorkspace(user) && merged.map(c => (
              <a key={c.id} href={`/${c.slug}/dashboard`} className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-primary-800 hover:border-accent-300 hover:bg-accent-50 transition">
                <span>{c.name}</span><span className="text-accent-600">→</span>
              </a>
            ))}
            {!hasAppWorkspace(user) && <a href="/setup/company" className="flex w-full justify-center rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white hover:bg-accent-600">Continue setup</a>}
            <button onClick={() => { clearClientLocaleStorage(); localStorage.removeItem('token'); localStorage.removeItem('user'); setSessionMode('form') }}
              className="w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Log out
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Verification step ─────────────────────────────────────────────────────

  if (stage === 'verify') {
    const isValid = verificationCode.trim().length === 6
    return (
      <div className="min-h-screen flex flex-col justify-center items-center px-4 bg-gradient-to-b from-white via-white to-primary-50/60 pt-safe pb-safe">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-accent-200/30 blur-3xl" />
          <div className="absolute bottom-0 -left-20 h-72 w-72 rounded-full bg-primary-200/30 blur-3xl" />
        </div>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <Link href="/"><Image src="/images/brand/logo.png" alt="PathPilo" width={160} height={50} priority className="h-10 w-auto mx-auto mb-8" /></Link>
            <h1 className="text-2xl font-bold text-primary-800 tracking-tight">Check your email</h1>
            <p className="mt-2 text-gray-500 text-sm">{codeSentMsg || `We sent a code to ${email}`}</p>
          </div>

          <form onSubmit={handleVerifySubmit} className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 space-y-5">
            {codeError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{codeError}</div>
            )}

            <div>
              <label htmlFor="code" className="block text-sm font-semibold text-primary-800 mb-2">Verification code</label>
              <input
                id="code" type="text" inputMode="numeric" autoFocus
                value={verificationCode}
                onChange={e => { setVerifCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (codeError) setCodeError('') }}
                className="input-field tracking-[0.35em] text-center text-lg font-semibold"
                placeholder="123456" required
              />
            </div>

            <button type="submit" disabled={!isValid || isLoading}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${isValid && !isLoading ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-lg shadow-accent-500/20' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}>
              {isLoading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Verifying…</span> : 'Verify & create account'}
            </button>

            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => { setStage('form'); setCodeError('') }}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 transition">← Back</button>
              <button type="button" disabled={isLoading}
                onClick={async () => {
                  setIsLoading(true); setCodeError('')
                  try {
                    const r = await fetch(apiUrl('/auth/register/send-code'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) })
                    const d = await r.json()
                    if (!r.ok) { setCodeError(d?.message || 'Could not resend'); return }
                    setCodeSentMsg(`New code sent to ${email.trim()}.`)
                  } finally { setIsLoading(false) }
                }}
                className="text-xs font-semibold text-accent-700 hover:text-accent-800 transition">Resend code</button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ── Main registration form (email-first + expandable) ─────────────────────

  const formIsValid = formData.firstName && formData.lastName && formData.password &&
    formData.confirmPassword && formData.acceptTerms && formData.password === formData.confirmPassword &&
    formData.password.length >= 8

  const isInviteOrTrial = !!(inviteToken || trialToken)

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-10 bg-gradient-to-b from-white via-white to-primary-50/60 pt-safe pb-safe">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-accent-200/30 blur-3xl" />
        <div className="absolute bottom-0 -left-20 h-72 w-72 rounded-full bg-primary-200/30 blur-3xl" />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo + headline */}
        <div className="text-center mb-8">
          <Link href="/"><Image src="/images/brand/logo.png" alt="PathPilo" width={160} height={50} priority className="h-10 w-auto mx-auto mb-8" /></Link>
          <h1 className="text-2xl font-bold text-primary-800 tracking-tight">
            {stage === 'email'
              ? (inviteToken ? 'Accept your invitation' : trialToken && trialDays ? 'Get started with PathPilo' : 'Create your account')
              : `Welcome, ${formData.firstName || 'there'}`}
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            {stage === 'email' ? 'Free to get started. No credit card required.' : 'Just a few more details and you\'re in.'}
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
          {/* General form errors */}
          {formError && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{formError}</div>
          )}

          {/* ── Step 1: Email field (always visible) ── */}
          <form onSubmit={stage === 'email' ? handleEmailContinue : handleFormSubmit}>

            <div className="space-y-4">
              {/* Email */}
              <div>
                {stage !== 'email' && (
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Email</label>
                )}
                {emailError && (
                  <div className="mb-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
                    {emailError}{' '}
                    {emailError.toLowerCase().includes('already exists') && (
                      <Link href={`/login?email=${encodeURIComponent(email)}`} className="underline font-semibold">Sign in instead →</Link>
                    )}
                  </div>
                )}
                <div className={`relative transition-all duration-300 ${stage !== 'email' ? 'opacity-70' : ''}`}>
                  <input
                    type="email" value={email}
                    onChange={e => { setEmail(e.target.value); if (emailError) setEmailError('') }}
                    readOnly={stage !== 'email' || isInviteOrTrial}
                    className={`input-field ${stage !== 'email' ? 'bg-gray-50 text-gray-600 cursor-default' : ''} ${isInviteOrTrial ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="your@email.com" required autoFocus={stage === 'email'}
                  />
                  {stage !== 'email' && (
                    <button type="button" onClick={() => { setStage('email'); if (expandRef.current) expandRef.current.style.maxHeight = '0' }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-accent-700 hover:text-accent-800">
                      Change
                    </button>
                  )}
                </div>
              </div>

              {/* ── Expandable section (name + password + terms) ── */}
              <div
                ref={expandRef}
                style={{ maxHeight: stage === 'email' ? '0' : undefined, overflow: 'hidden', transition: 'max-height 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease' }}
                className={stage === 'email' ? 'opacity-0' : 'opacity-100'}
              >
                <div className="space-y-4 pt-1">
                  {/* Name row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="firstName" className="block text-xs font-semibold text-gray-700 mb-1.5">First name</label>
                      <input id="firstName" type="text" value={formData.firstName}
                        onChange={e => setFormData(p => ({ ...p, firstName: e.target.value }))}
                        className="input-field" placeholder="John" required={stage === 'form'} autoFocus={stage === 'form'} />
                    </div>
                    <div>
                      <label htmlFor="lastName" className="block text-xs font-semibold text-gray-700 mb-1.5">Last name</label>
                      <input id="lastName" type="text" value={formData.lastName}
                        onChange={e => setFormData(p => ({ ...p, lastName: e.target.value }))}
                        className="input-field" placeholder="Doe" required={stage === 'form'} />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label htmlFor="password" className="block text-xs font-semibold text-gray-700 mb-1.5">Password</label>
                    <div className="relative">
                      <input id="password" type={showPassword ? 'text' : 'password'} value={formData.password}
                        onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                        className="input-field pr-10" placeholder="8+ characters" required={stage === 'form'} />
                      <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label htmlFor="confirmPassword" className="block text-xs font-semibold text-gray-700 mb-1.5">Confirm password</label>
                    <div className="relative">
                      <input id="confirmPassword" type={showConfirm ? 'text' : 'password'} value={formData.confirmPassword}
                        onChange={e => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
                        className={`input-field pr-10 ${formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                        placeholder="Repeat password" required={stage === 'form'} />
                      <button type="button" tabIndex={-1} onClick={() => setShowConfirm(v => !v)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                        {showConfirm ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                    </div>
                    {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                      <p className="mt-1 text-xs text-red-600">Passwords don&apos;t match</p>
                    )}
                  </div>

                  {/* Terms */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={formData.acceptTerms}
                      onChange={e => setFormData(p => ({ ...p, acceptTerms: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent-500 focus:ring-accent-500" required={stage === 'form'} />
                    <span className="text-xs text-gray-600 leading-relaxed">
                      I agree to the{' '}
                      <a href={`https://pathpilo.com/${requestedLang}/terms`} target="_blank" rel="noreferrer" className="font-semibold text-accent-700 hover:text-accent-800">Terms of Service</a>{' '}
                      and{' '}
                      <a href={`https://pathpilo.com/${requestedLang}/privacy`} target="_blank" rel="noreferrer" className="font-semibold text-accent-700 hover:text-accent-800">Privacy Policy</a>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Submit button */}
            <div className="mt-6">
              {stage === 'email' ? (
                <button type="submit" disabled={isLoading || !email.trim()}
                  className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${!isLoading && email.trim() ? 'bg-primary-800 hover:bg-primary-900 text-white shadow-lg' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}>
                  {isLoading
                    ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Checking…</span>
                    : 'Continue with email →'}
                </button>
              ) : (
                <button type="submit" disabled={!formIsValid || isLoading}
                  className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${formIsValid && !isLoading ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-lg shadow-accent-500/20' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}>
                  {isLoading
                    ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Sending code…</span>
                    : 'Create account →'}
                </button>
              )}
            </div>
          </form>

          {/* Sign in link */}
          <p className="mt-5 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href={`/login?lang=${requestedLang}`} className="font-semibold text-accent-700 hover:text-accent-800">Log in</Link>
          </p>
        </div>

        {/* Trust strip */}
        {stage === 'email' && (
          <p className="mt-6 text-center text-xs text-gray-400">
            Free forever · No credit card · Cancel anytime
          </p>
        )}

        <p className="mt-5 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} PathPilo
        </p>
      </div>
    </div>
  )
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-primary-50/50">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-200 border-t-accent-500" />
      </div>
    }>
      <RegisterForm />
    </Suspense>
  )
}
