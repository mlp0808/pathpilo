'use client'

import { useState, useEffect } from 'react'
import AppLayout from '../../components/AppLayout'
import TeamTable from '../../components/TeamTable'
import { useUser } from '../../hooks/useUser'
import { apiUrl } from '../../utils/api'

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
  const [users, setUsers] = useState<User[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [activeTab, setActiveTab] = useState<'management' | 'employees'>('management')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchUsers()
    fetchPendingInvitations()
  }, [currentUser?.companyId])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch(apiUrl('/users'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setUsers(data.users)
      } else {
        setError(data.error || 'Failed to fetch team members')
      }
    } catch (error) {
      setError('Network error: Failed to fetch team members')
      console.error('Users fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingInvitations = async () => {
    if (!currentUser?.companyId) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/companies/${currentUser.companyId}/invitations`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setPendingInvitations(data.invitations || [])
      }
    } catch (error) {
      console.error('Failed to fetch pending invitations:', error)
    }
  }

  // Filter users based on active tab
  const managementUsers = users.filter(user => 
    user.role === 'owner' || user.role === 'company-owner' || user.role === 'manager'
  )
  
  const employeeUsers = users.filter(user => 
    user.role === 'employee'
  )

  const handleAddEmployee = async () => {
    if (!emailInput.trim()) {
      setError('Please enter an email address')
      return
    }

    if (!currentUser?.companyId) {
      setError('No active company found')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/companies/${currentUser.companyId}/invite`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: emailInput.trim(),
          role: 'employee'
        })
      })

      const data = await response.json()

      if (response.ok) {
        // Add to pending invitations
        const newInvitation: PendingInvitation = {
          id: data.invitation.id,
          email: emailInput.trim(),
          role: 'employee',
          invitationUrl: data.invitation.invitationUrl,
          status: 'pending'
        }
        // Refresh pending invitations from server to get persisted data
        await fetchPendingInvitations()
        setEmailInput('')
        setShowAddModal(false)
      } else {
        setError(data.error || 'Failed to send invitation')
      }
    } catch (error) {
      console.error('Invitation error:', error)
      setError('Network error: Failed to send invitation')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
            <p className="mt-2 text-gray-600">Loading team members...</p>
          </div>
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
          <p className="text-sm text-gray-600 mt-1">
            Manage your team members and their roles
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={fetchUsers}
                    className="bg-red-50 text-red-800 text-sm font-medium hover:bg-red-100 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('management')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'management'
                  ? 'border-accent-500 text-accent-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Management ({managementUsers.length})
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'employees'
                  ? 'border-accent-500 text-accent-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Employees ({employeeUsers.length})
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'management' && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-medium text-gray-900">Management Team</h2>
              <p className="text-sm text-gray-600">Owners and managers with administrative access</p>
            </div>
            <TeamTable 
              users={managementUsers} 
              role="management" 
              currentUserId={currentUser?.id}
              onAddClick={() => setShowAddModal(true)}
              onUserRemoved={fetchUsers}
            />
          </div>
        )}

        {activeTab === 'employees' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Employees</h2>
                <p className="text-sm text-gray-600">Team members with standard access</p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Employee
              </button>
            </div>
            <TeamTable 
              users={employeeUsers} 
              role="employees" 
              currentUserId={currentUser?.id}
              pendingInvitations={pendingInvitations.filter(inv => inv.role === 'employee')}
              onAddClick={() => setShowAddModal(true)}
              onUserRemoved={fetchUsers}
            />
          </div>
        )}

        {/* Add Employee Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Add Employee</h3>
                  <button
                    onClick={() => {
                      setShowAddModal(false)
                      setEmailInput('')
                      setError('')
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
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
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                    placeholder="employee@example.com"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowAddModal(false)
                      setEmailInput('')
                      setError('')
                    }}
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
                    {isSubmitting ? 'Sending...' : 'Send Invitation'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
