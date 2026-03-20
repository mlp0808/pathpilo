'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '../../components/AppLayout'
import { useUser } from '../../hooks/useUser'
import { apiUrl } from '../../utils/api'
import { UserPlusIcon, EllipsisVerticalIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'

interface User {
  id: number
  first_name: string
  last_name: string
  email: string
  role: string
  created_at: string
}

interface PendingInvitation {
  id: number
  email: string
  role: string
  invitationUrl: string
  status: 'pending'
}

export default function TeamPage() {
  const { user: currentUser } = useUser()
  const router = useRouter()
  const params = useParams()
  const company = params?.company as string

  const [users, setUsers] = useState<User[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [activeTab, setActiveTab] = useState<'management' | 'employees'>('management')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null)
  const [removingUserId, setRemovingUserId] = useState<number | null>(null)
  const [resendingId, setResendingId] = useState<number | null>(null)
  const [resendSuccess, setResendSuccess] = useState<number | null>(null)
  const [removingInviteId, setRemovingInviteId] = useState<number | null>(null)

  useEffect(() => {
    fetchUsers()
    fetchPendingInvitations()
  }, [currentUser?.companyId])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/users'), { headers: { Authorization: `Bearer ${token}` } })
      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('application/json')) { setError('Invalid server response'); return }
      const data = await response.json()
      if (response.ok) setUsers(data.users || [])
      else setError(data.error || 'Failed to fetch team members')
    } catch {
      setError('Network error: Failed to fetch team members')
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingInvitations = async () => {
    if (!currentUser?.companyId) return
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/companies/${currentUser.companyId}/invitations`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('application/json')) return
      const data = await response.json()
      if (response.ok) setPendingInvitations(data.invitations || [])
    } catch { /* ignore */ }
  }

  const handleAddEmployee = async () => {
    if (!emailInput.trim() || !currentUser?.companyId) { setError('Please enter an email address'); return }
    setIsSubmitting(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/companies/${currentUser.companyId}/invite`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim(), role: 'employee' }),
      })
      const data = await response.json()
      if (response.ok) {
        await fetchPendingInvitations()
        setEmailInput('')
        setShowAddModal(false)
      } else {
        setError(data.error || 'Failed to send invitation')
      }
    } catch {
      setError('Network error: Failed to send invitation')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResendInvitation = async (invId: number) => {
    if (!currentUser?.companyId) return
    setResendingId(invId)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/companies/${currentUser.companyId}/invitations/${invId}/resend`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        setResendSuccess(invId)
        setTimeout(() => setResendSuccess(null), 3000)
      } else {
        const d = await response.json()
        alert(d.error || 'Failed to resend invitation')
      }
    } catch {
      alert('Failed to resend invitation. Please try again.')
    } finally {
      setResendingId(null)
    }
  }

  const handleRemoveInvitation = async (invId: number, email: string) => {
    if (!currentUser?.companyId) return
    if (!confirm(`Remove the pending invitation for ${email}?`)) return
    setRemovingInviteId(invId)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/companies/${currentUser.companyId}/invitations/${invId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        setPendingInvitations(prev => prev.filter(i => i.id !== invId))
      } else {
        const d = await response.json()
        alert(d.error || 'Failed to remove invitation')
      }
    } catch {
      alert('Failed to remove invitation. Please try again.')
    } finally {
      setRemovingInviteId(null)
    }
  }

  const handleRemoveUser = async (userId: number, userName: string) => {
    if (!confirm(`Remove ${userName} from this company? Their account will remain active.`)) return
    setRemovingUserId(userId)
    setOpenDropdownId(null)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/users/${userId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) fetchUsers()
      else { const d = await response.json(); alert(d.error || 'Failed to remove user') }
    } catch {
      alert('Failed to remove user. Please try again.')
    } finally {
      setRemovingUserId(null)
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner': case 'company-owner':
        return { label: 'Owner', cls: 'bg-purple-100 text-purple-800' }
      case 'manager':
        return { label: 'Manager', cls: 'bg-green-100 text-accent-700' }
      default:
        return { label: 'Employee', cls: 'bg-green-100 text-green-800' }
    }
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const managementUsers = users.filter(u => u.role === 'owner' || u.role === 'company-owner' || u.role === 'manager')
  const employeeUsers = users.filter(u => u.role === 'employee')
  const listUsers = activeTab === 'management' ? managementUsers : employeeUsers
  const listPending = activeTab === 'employees' ? pendingInvitations.filter(i => i.role === 'employee') : []

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-600 mt-1">Manage your team members and their roles</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="h-5 w-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <button onClick={fetchUsers} className="mt-2 text-sm font-medium text-red-800 hover:underline">Try again</button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6">
          <nav className="-mb-px flex space-x-8">
            {(['management', 'employees'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-accent-500 text-accent-500'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab === 'management' ? `Management (${managementUsers.length})` : `Employees (${employeeUsers.length})`}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">
              {activeTab === 'management' ? 'Management Team' : 'Employees'}
            </h2>
            <p className="text-sm text-gray-600">
              {activeTab === 'management'
                ? 'Owners and managers with administrative access'
                : 'Team members with standard access'}
            </p>
          </div>
          {activeTab === 'employees' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Employee
            </button>
          )}
        </div>

        {/* Table */}
        {listUsers.length === 0 && listPending.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400 mb-4 flex items-center justify-center">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0Zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0Z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No {activeTab === 'management' ? 'managers' : 'employees'} yet</h3>
            <p className="text-gray-500 mb-6">{activeTab === 'management' ? 'Managers and owners will appear here' : 'Employees will appear here'}</p>
            {activeTab === 'employees' && (
              <button onClick={() => setShowAddModal(true)} className="inline-flex items-center px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors">
                <UserPlusIcon className="w-4 h-4 mr-2" />
                Invite Employee
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                  {listPending.length > 0 && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invitation Link</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Pending */}
                {listPending.map(inv => (
                  <tr key={`pending-${inv.id}`} className="hover:bg-gray-50 bg-amber-50/60">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-sm font-medium text-gray-500 italic">Awaiting signup</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{inv.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">Pending</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">—</td>
                    {listPending.length > 0 && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={inv.invitationUrl}
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-700 font-mono min-w-0 w-40"
                            onClick={e => (e.target as HTMLInputElement).select()}
                          />
                          <button
                            onClick={() => navigator.clipboard.writeText(inv.invitationUrl)}
                            className="text-accent-500 hover:text-accent-600 transition-colors flex-shrink-0"
                            title="Copy link"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {resendSuccess === inv.id ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent-600 bg-accent-50 rounded-lg">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Sent!
                          </span>
                        ) : (
                          <button
                            onClick={() => handleResendInvitation(inv.id)}
                            disabled={resendingId === inv.id || removingInviteId === inv.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                          >
                            {resendingId === inv.id ? (
                              <>
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Sending…
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                Resend
                              </>
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => handleRemoveInvitation(inv.id, inv.email)}
                          disabled={removingInviteId === inv.id || resendingId === inv.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                          title="Remove invitation"
                        >
                          {removingInviteId === inv.id ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Active users */}
                {listUsers.map(user => {
                  const badge = getRoleBadge(user.role)
                  const isOwner = user.role === 'owner' || user.role === 'company-owner'
                  const isSelf = user.id === currentUser?.id
                  return (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-medium text-gray-700">
                              {user.first_name.charAt(0)}{user.last_name.charAt(0)}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.first_name} {user.last_name}
                            {isSelf && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(user.created_at)}</td>
                      {listPending.length > 0 && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">—</td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          {/* Settings button — always shown */}
                          <button
                            onClick={() => router.push(`/${company}/team/${user.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                          >
                            <Cog6ToothIcon className="w-3.5 h-3.5" />
                            Settings
                          </button>

                          {/* Three-dot menu — only for non-owners and non-self */}
                          {!isOwner && !isSelf && (
                            <div className="relative">
                              <button
                                onClick={() => setOpenDropdownId(openDropdownId === user.id ? null : user.id)}
                                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                                disabled={removingUserId === user.id}
                              >
                                <EllipsisVerticalIcon className="w-5 h-5" />
                              </button>
                              {openDropdownId === user.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)} />
                                  <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                                    <button
                                      onClick={() => handleRemoveUser(user.id, `${user.first_name} ${user.last_name}`)}
                                      disabled={removingUserId === user.id}
                                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                    >
                                      {removingUserId === user.id ? 'Removing…' : 'Remove from company'}
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Employee Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Add Employee</h3>
                <button onClick={() => { setShowAddModal(false); setEmailInput(''); setError('') }} className="text-gray-400 hover:text-gray-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddEmployee()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                  placeholder="employee@example.com"
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowAddModal(false); setEmailInput(''); setError('') }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEmployee}
                  disabled={isSubmitting || !emailInput.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent-500 rounded-lg hover:bg-accent-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Sending…' : 'Send Invitation'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
