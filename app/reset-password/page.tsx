'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword]           = useState('')
  const [confirm, setConfirm]             = useState('')
  const [showPassword, setShowPassword]   = useState(false)
  const [showConfirm, setShowConfirm]     = useState(false)
  const [isLoading, setIsLoading]         = useState(false)
  const [error, setError]                 = useState('')
  const [done, setDone]                   = useState(false)

  const passwordsMatch = password === confirm
  const strong         = password.length >= 8
  const canSubmit      = strong && passwordsMatch && !isLoading && !!token

  const strengthLabel = () => {
    if (!password) return null
    if (password.length < 8) return { label: 'Too short', color: 'bg-red-400' }
    if (password.length < 12) return { label: 'Fair', color: 'bg-yellow-400' }
    return { label: 'Strong', color: 'bg-accent-500' }
  }
  const strength = strengthLabel()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setIsLoading(true); setError('')

    try {
      const res = await fetch(apiUrl('/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (res.ok) {
        setDone(true)
        setTimeout(() => router.push('/login'), 3000)
      } else {
        setError(data.error || 'Something went wrong')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-page flex flex-col justify-center py-12 px-6">
        <div className="max-w-md mx-auto w-full text-center">
          <span className="text-2xl font-bold text-primary-500">Vevago</span>
          <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid link</h2>
            <p className="text-sm text-gray-500 mb-6">This reset link is missing a token. Please request a new one.</p>
            <Link href="/login" className="text-sm text-primary-500 font-medium hover:underline">Back to sign in</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-page flex flex-col justify-center py-12 px-6">
      <div className="max-w-md mx-auto w-full">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-primary-500">Vevago</span>
          {!done && (
            <>
              <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-2">Create new password</h1>
              <p className="text-gray-500 text-sm">Choose something secure — at least 8 characters.</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {done ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-accent-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-accent-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Password updated!</h2>
              <p className="text-sm text-gray-500 mb-6">You'll be redirected to the sign-in page in a moment.</p>
              <Link href="/login" className="text-sm text-primary-500 font-medium hover:underline">Sign in now →</Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <p className="text-red-800 text-sm">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* New password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">New password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={password}
                      onChange={e => { setPassword(e.target.value); if (error) setError('') }}
                      className="input-field pr-10"
                      placeholder="At least 8 characters"
                      required
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      {showPassword ? <EyeSlashIcon className="h-5 w-5 text-gray-400" /> : <EyeIcon className="h-5 w-5 text-gray-400" />}
                    </button>
                  </div>
                  {/* Strength indicator */}
                  {strength && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${strength.color} ${password.length < 8 ? 'w-1/3' : password.length < 12 ? 'w-2/3' : 'w-full'}`} />
                      </div>
                      <span className="text-xs text-gray-400">{strength.label}</span>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">Confirm password</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      id="confirm"
                      value={confirm}
                      onChange={e => { setConfirm(e.target.value); if (error) setError('') }}
                      className={`input-field pr-10 ${confirm && !passwordsMatch ? 'border-red-300 focus:ring-red-200' : ''}`}
                      placeholder="Repeat your password"
                      required
                    />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      {showConfirm ? <EyeSlashIcon className="h-5 w-5 text-gray-400" /> : <EyeIcon className="h-5 w-5 text-gray-400" />}
                    </button>
                  </div>
                  {confirm && !passwordsMatch && (
                    <p className="mt-1.5 text-xs text-red-500">Passwords don't match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                    canSubmit
                      ? 'bg-accent-500 hover:bg-accent-600 text-primary-500 shadow-sm'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      Updating…
                    </span>
                  ) : 'Set new password'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">← Back to sign in</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
