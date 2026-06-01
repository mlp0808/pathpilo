'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'

interface Company {
  id: number
  name: string
  role: string
}

interface User {
  id: number
  firstName: string
  lastName: string
  email: string
  role?: string
  companies: Company[]
  createdAt: string
}

interface StartedSignup {
  kind?: 'verification' | 'draft'
  email: string | null
  firstName?: string | null
  lastName?: string | null
  sessionId?: string | null
  step?: string
  codeVerified?: boolean
  startedAt: string
  expiresAt?: string | null
  updatedAt?: string
}

function startedSignupLabel(row: StartedSignup): string {
  if (row.kind === 'verification' || !row.kind) {
    if (row.codeVerified) return 'Email verified — account not created'
    return 'Verification code sent'
  }
  const map: Record<string, string> = {
    name_entered: 'Entered name',
    email_entered: 'Entered email',
    details_ready: 'Form complete (before code)',
    code_sent: 'Verification code sent',
    code_verified: 'Email verified — account not created',
  }
  return map[row.step || ''] || (row.step || 'In progress')
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [startedSignups, setStartedSignups] = useState<StartedSignup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [pendingActionError, setPendingActionError] = useState<string | null>(null)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deleteInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Check authentication first
    const checkAuth = () => {
      const token = localStorage.getItem('token')
      const userData = localStorage.getItem('user')

      if (!token || !userData) {
        router.push('/admin')
        return false
      }

      try {
        const user = JSON.parse(userData)
        if (user.role !== 'admin') {
          router.push('/admin')
          return false
        }
        return true
      } catch (error) {
        router.push('/admin')
        return false
      }
    }

    // Check auth first, then fetch users if authenticated
    if (checkAuth()) {
      setIsAuthenticated(true)
      fetchUsers()
    }
  }, [router])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      
      if (!token) {
        setError('Not authenticated. Please log in.')
        return
      }

      const response = await fetch(apiUrl('/admin/users'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()

      if (response.ok) {
        setUsers(data.users)
        setStartedSignups(Array.isArray(data.startedSignups) ? data.startedSignups : [])
      } else {
        if (response.status === 403) {
          setError('Admin access required. Only admin users can view this page.')
        } else {
          setError(data.error || 'Failed to fetch users')
        }
      }
    } catch (err) {
      setError('Network error: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const pendingRowKey = (signup: StartedSignup) =>
    signup.kind === 'draft' && signup.sessionId
      ? `draft-${signup.sessionId}`
      : `v-${signup.email || 'unknown'}`

  const deletePendingSignup = async (signup: StartedSignup) => {
    const rowKey = pendingRowKey(signup)
    if (signup.kind === 'draft') {
      if (!signup.sessionId) {
        setPendingActionError('Cannot remove this row: missing session id.')
        return
      }
      if (
        !window.confirm(
          'Remove this early signup draft from the list? This does not delete any user account.'
        )
      ) {
        return
      }
    } else {
      if (!signup.email) {
        setPendingActionError('Cannot remove this row: missing email.')
        return
      }
      if (
        !window.confirm(
          `Remove pending verification for ${signup.email}? They can start signup again later.`
        )
      ) {
        return
      }
    }

    const token = localStorage.getItem('token')
    if (!token) {
      setPendingActionError('Not authenticated.')
      return
    }

    const body =
      signup.kind === 'draft'
        ? { kind: 'draft' as const, sessionId: signup.sessionId }
        : { kind: 'verification' as const, email: signup.email }

    try {
      setDeletingKey(rowKey)
      setPendingActionError(null)
      const response = await fetch(apiUrl('/admin/pending-signups'), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setPendingActionError(data.error || 'Failed to remove pending signup')
        return
      }
      await fetchUsers()
    } catch (err) {
      setPendingActionError('Network error: ' + (err as Error).message)
    } finally {
      setDeletingKey(null)
    }
  }

  const openDeleteUserModal = (user: User) => {
    setUserToDelete(user)
    setDeleteConfirmEmail('')
    setDeleteError('')
    setTimeout(() => deleteInputRef.current?.focus(), 50)
  }

  const handleDeleteUser = async () => {
    if (!userToDelete || deleteConfirmEmail.trim().toLowerCase() !== userToDelete.email.trim().toLowerCase()) {
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      setDeleteError('Not authenticated.')
      return
    }

    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch(apiUrl(`/admin/users/${userToDelete.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: deleteConfirmEmail.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to delete user')
        return
      }
      setUserToDelete(null)
      await fetchUsers()
    } catch (err) {
      setDeleteError('Network error: ' + (err as Error).message)
    } finally {
      setDeleteLoading(false)
    }
  }

  const ownedCompanies = (user: User) =>
    user.companies?.filter((c) => c.role === 'owner') ?? []

  // Show loading while checking authentication
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">V</span>
              </div>
              <span className="text-xl font-bold text-gray-900">PathPilo Admin</span>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/admin" className="text-gray-600 hover:text-gray-900">
                Overview
              </Link>
              <Link href="/admin/users" className="text-blue-600 hover:text-blue-700 font-medium">
                Users
              </Link>
              <Link href="/admin/companies" className="text-gray-600 hover:text-gray-900">
                Companies
              </Link>
              <Link href="/admin/video-guides" className="text-gray-600 hover:text-gray-900">
                Video Guides
              </Link>
              <Link href="/admin/trials" className="text-gray-600 hover:text-gray-900">
                Trials
              </Link>
              <button
                onClick={() => {
                  localStorage.removeItem('token')
                  localStorage.removeItem('user')
                  router.push('/admin')
                }}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">All Users</h1>
          <p className="text-gray-600">View registrations in progress and fully registered users</p>
        </div>

        {/* Started signups */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-200 bg-amber-50/60">
            <h2 className="text-lg font-semibold text-amber-900">Started (incomplete)</h2>
            <p className="text-sm text-amber-700">
              Includes early progress (name/email before code) and rows waiting on verification or final account creation.
            </p>
          </div>
          {pendingActionError ? (
            <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              {pendingActionError}
            </div>
          ) : null}
          {loading ? (
            <div className="p-6 text-sm text-gray-500">Loading...</div>
          ) : startedSignups.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No started signups right now.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last activity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code expires</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {startedSignups.map((signup) => {
                    const rowKey = pendingRowKey(signup)
                    const displayName =
                      signup.firstName || signup.lastName
                        ? [signup.firstName, signup.lastName].filter(Boolean).join(' ')
                        : '—'
                    const lastAt = signup.updatedAt || signup.startedAt
                    return (
                      <tr key={rowKey} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{displayName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{signup.email || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-50 text-amber-900 border-amber-200">
                            {startedSignupLabel(signup)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(lastAt)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {signup.expiresAt ? formatDate(signup.expiresAt) : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button
                            type="button"
                            onClick={() => deletePendingSignup(signup)}
                            disabled={deletingKey === rowKey}
                            className="font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {deletingKey === rowKey ? 'Removing…' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading users...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <div className="text-red-600 mb-4">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-lg font-medium">Error loading users</p>
                <p className="text-sm">{error}</p>
              </div>
              <button
                onClick={fetchUsers}
                className="btn-primary"
              >
                Try Again
              </button>
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-lg font-medium">No users found</p>
                <p className="text-sm">No users have been registered yet.</p>
              </div>
              <Link href="/register" className="btn-primary">
                Register First User
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Registered
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-blue-600">
                                {user.firstName[0]}{user.lastName[0]}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.firstName} {user.lastName}
                            </div>
                            <div className="text-sm text-gray-500">
                              ID: {user.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {user.companies && user.companies.length > 0 ? (
                            user.companies.map((company) => {
                              const roleColors = {
                                owner: 'bg-purple-100 text-purple-800 border-purple-200',
                                admin: 'bg-purple-100 text-purple-800 border-purple-200',
                                manager: 'bg-blue-100 text-blue-800 border-blue-200',
                                employee: 'bg-green-100 text-green-800 border-green-200'
                              };
                              const colorClass = roleColors[company.role as keyof typeof roleColors] || 'bg-gray-100 text-gray-800 border-gray-200';
                              
                              return (
                                <span
                                  key={company.id}
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${colorClass}`}
                                >
                                  {company.name}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-sm text-gray-400 italic">No company</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(user.createdAt)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        {user.role === 'admin' ? (
                          <span className="text-xs text-gray-400">Protected</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openDeleteUserModal(user)}
                            className="font-medium text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats */}
        {users.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-blue-600">{users.length}</div>
              <div className="text-sm text-gray-600">Total Users</div>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-amber-600">{startedSignups.length}</div>
              <div className="text-sm text-gray-600">Started Signups</div>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-green-600">
                {new Set(users.flatMap(u => u.companies?.map(c => c.id) || [])).size}
              </div>
              <div className="text-sm text-gray-600">Unique Companies</div>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 md:col-span-2">
              <div className="text-2xl font-bold text-purple-600">
                {users.filter(u => {
                  const today = new Date()
                  const userDate = new Date(u.createdAt)
                  return userDate.toDateString() === today.toDateString()
                }).length}
              </div>
              <div className="text-sm text-gray-600">Registered Today</div>
            </div>
          </div>
        )}
      </div>

      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Delete user</h2>
                <p className="text-sm text-gray-500">This cannot be undone</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm text-red-800 space-y-2">
              <p>
                <strong>
                  {userToDelete.firstName} {userToDelete.lastName}
                </strong>{' '}
                ({userToDelete.email}) will be removed completely. They can register again with the same email as if
                they were new.
              </p>
              {ownedCompanies(userToDelete).length > 0 && (
                <p>
                  This user owns{' '}
                  <strong>
                    {ownedCompanies(userToDelete).length} compan
                    {ownedCompanies(userToDelete).length === 1 ? 'y' : 'ies'}
                  </strong>{' '}
                  ({ownedCompanies(userToDelete).map((c) => c.name).join(', ')}) — those companies and all their data
                  will be deleted too.
                </p>
              )}
              <p className="text-red-700">
                Membership in other companies is removed; those companies stay intact.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type <strong className="font-mono">{userToDelete.email}</strong> to confirm
              </label>
              <input
                ref={deleteInputRef}
                type="email"
                value={deleteConfirmEmail}
                onChange={(e) => {
                  setDeleteConfirmEmail(e.target.value)
                  setDeleteError('')
                }}
                placeholder={userToDelete.email}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    deleteConfirmEmail.trim().toLowerCase() === userToDelete.email.trim().toLowerCase()
                  ) {
                    handleDeleteUser()
                  }
                }}
              />
              {deleteError && <p className="text-xs text-red-600 mt-1">{deleteError}</p>}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setUserToDelete(null)
                  setDeleteError('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={
                  deleteConfirmEmail.trim().toLowerCase() !== userToDelete.email.trim().toLowerCase() ||
                  deleteLoading
                }
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deleteLoading ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
