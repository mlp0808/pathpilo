'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { apiUrl } from '../../utils/api'

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
    // Check if user is logged in
    const authToken = localStorage.getItem('token')
    setIsLoggedIn(!!authToken)

    // Load invitation details
    try {
      const response = await fetch(apiUrl(`/invitations/${token}`))
      const data = await response.json()

      if (response.ok) {
        setInvitation(data.invitation)
        
        // If logged in, check if user is already in this company (invitation was accepted during registration)
        if (authToken && data.invitation) {
          const userData = localStorage.getItem('user')
          if (userData) {
            try {
              const user = JSON.parse(userData)
              // Check if user is already in this company
              if (user.companies && user.companies.some((c: any) => c.name === data.invitation.companyName)) {
                setAlreadyAccepted(true)
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      } else {
        setError(data.error || 'Invitation not found or expired')
      }
    } catch (error) {
      console.error('Error loading invitation:', error)
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
      
      // Call accept invitation endpoint
      const response = await fetch(apiUrl(`/invitations/${token}/accept`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok) {
        // Update user data in localStorage
        if (data.token) {
          localStorage.setItem('token', data.token)
        }
        if (data.user) {
          // Transform user data to match expected structure
          const userData = {
            id: data.user.id,
            firstName: data.user.firstName,
            lastName: data.user.lastName,
            email: data.user.email,
            role: data.user.activeCompany?.role || data.user.role || 'employee',
            companyId: data.user.activeCompany?.id || data.user.companyId || null,
            companyName: data.user.activeCompany?.name || data.user.companyName || null,
            companies: data.user.companies || [],
            activeCompany: data.user.activeCompany || null
          }
          localStorage.setItem('user', JSON.stringify(userData))
        }
        
        // Redirect to company dashboard (or to company picker as fallback)
        const companySlug = data.user?.activeCompany?.slug || data.user?.companies?.[0]?.slug
        router.push(companySlug ? `/${companySlug}/dashboard` : '/select-company')
      } else {
        setError(data.error || 'Failed to accept invitation')
      }
    } catch (error) {
      console.error('Error accepting invitation:', error)
      setError('Network error: Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading invitation...</p>
        </div>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="mx-auto h-12 w-12 text-red-400 mb-4">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Invitation</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    )
  }

  if (!invitation) {
    return null
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-2 mb-6">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">V</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Vevago</span>
          </Link>
        </div>

        {/* Invitation Message */}
        <div className="text-center mb-8">
          <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">You've been invited!</h1>
          <p className="text-gray-600">
            You have been invited to be an <span className="font-semibold">employee</span> of{' '}
            <span className="font-semibold text-blue-600">{invitation.companyName}</span>
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Invited by {invitation.invitedByName}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        {alreadyAccepted ? (
          // Already accepted (registered with invite)
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <svg className="w-8 h-8 text-green-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-medium text-green-800">You've been added to {invitation.companyName}!</p>
            </div>
            <Link
              href="/dashboard"
              className="block w-full py-3 px-4 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white text-center shadow-sm hover:shadow-md transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : isLoggedIn ? (
          // Logged in: Show Accept button
          <div className="space-y-4">
            <button
              onClick={handleAcceptInvite}
              disabled={accepting}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                accepting
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
              }`}
            >
              {accepting ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Accepting...
                </div>
              ) : (
                'Accept Invite'
              )}
            </button>
            <Link
              href="/dashboard"
              className="block text-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          // Not logged in: Show appropriate button based on whether user exists
          <div className="space-y-4">
            {invitation.userExists ? (
              // Email exists: Show Login button only
              <Link
                href={`/login?invite=${token}`}
                className="block w-full py-3 px-4 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white text-center shadow-sm hover:shadow-md transition-colors"
              >
                Login to Accept
              </Link>
            ) : (
              // Email doesn't exist: Show Register button only
              <Link
                href={`/register?invite=${token}`}
                className="block w-full py-3 px-4 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white text-center shadow-sm hover:shadow-md transition-colors"
              >
                Create Account for Free
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

