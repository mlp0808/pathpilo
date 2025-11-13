'use client'

import { useState, useEffect } from 'react'
import AppLayout from '../components/AppLayout'
import TeamTable from '../components/TeamTable'
import { useUser } from '../hooks/useUser'

interface User {
  id: number
  first_name: string
  last_name: string
  email: string
  role: string
  created_at: string
}

export default function TeamPage() {
  const { user: currentUser } = useUser()
  const [users, setUsers] = useState<User[]>([])
  const [activeTab, setActiveTab] = useState<'management' | 'employees'>('management')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch('http://localhost:3003/api/users', {
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

  // Filter users based on active tab
  const managementUsers = users.filter(user => 
    user.role === 'owner' || user.role === 'company-owner' || user.role === 'manager'
  )
  
  const employeeUsers = users.filter(user => 
    user.role === 'employee'
  )

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Management ({managementUsers.length})
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'employees'
                  ? 'border-blue-500 text-blue-600'
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
            <TeamTable users={managementUsers} role="management" currentUserId={currentUser?.id} />
          </div>
        )}

        {activeTab === 'employees' && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-medium text-gray-900">Employees</h2>
              <p className="text-sm text-gray-600">Team members with standard access</p>
            </div>
            <TeamTable users={employeeUsers} role="employees" currentUserId={currentUser?.id} />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
