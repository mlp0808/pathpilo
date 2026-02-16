'use client'

import { useState } from 'react'
import { UserPlusIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'

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

interface TeamTableProps {
  users: User[]
  role: 'management' | 'employees'
  currentUserId?: number
  pendingInvitations?: PendingInvitation[]
  onAddClick?: () => void
  onUserRemoved?: () => void
}

export default function TeamTable({ users, role, currentUserId, pendingInvitations = [], onAddClick, onUserRemoved }: TeamTableProps) {
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null)
  const [removingUserId, setRemovingUserId] = useState<number | null>(null)
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getRoleBadgeColor = (userRole: string) => {
    switch (userRole) {
      case 'owner':
      case 'company-owner':
        return 'bg-purple-100 text-purple-800'
      case 'manager':
        return 'bg-green-100 text-accent-700'
      case 'employee':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleDisplayName = (userRole: string) => {
    switch (userRole) {
      case 'owner':
      case 'company-owner':
        return 'Owner'
      case 'manager':
        return 'Manager'
      case 'employee':
        return 'Employee'
      default:
        return userRole
    }
  }

  const handleRemoveUser = async (userId: number, userName: string) => {
    if (!confirm(`Are you sure you want to remove ${userName} from this company? They will no longer have access to this company, but their account will remain.`)) {
      return
    }

    setRemovingUserId(userId)
    setOpenDropdownId(null)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/users/${userId}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        if (onUserRemoved) {
          onUserRemoved()
        }
      } else {
        alert(data.error || 'Failed to remove user')
      }
    } catch (error) {
      console.error('Error removing user:', error)
      alert('Failed to remove user. Please try again.')
    } finally {
      setRemovingUserId(null)
    }
  }

  if (users.length === 0 && (!pendingInvitations || pendingInvitations.length === 0)) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-12 w-12 text-gray-400 mb-4 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No {role === 'management' ? 'managers' : 'employees'} yet
        </h3>
        <p className="text-gray-500 mb-6">
          {role === 'management' 
            ? 'Managers and owners will appear here' 
            : 'Employees will appear here'
          }
        </p>
        <button 
          onClick={onAddClick}
          className="inline-flex items-center px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          <UserPlusIcon className="w-4 h-4 mr-2" />
          Invite {role === 'management' ? 'Manager' : 'Employee'}
        </button>
      </div>
    )
  }

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Role
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Joined
            </th>
            {pendingInvitations && pendingInvitations.length > 0 && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invitation Link
              </th>
            )}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {/* Pending Invitations */}
          {pendingInvitations && pendingInvitations.length > 0 && pendingInvitations.map((invitation) => (
            <tr key={`pending-${invitation.id}`} className="hover:bg-gray-50 bg-yellow-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-8 w-8">
                    <div className="h-8 w-8 rounded-full bg-yellow-200 flex items-center justify-center">
                      <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">
                      Pending
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{invitation.email}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                  Pending
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                -
              </td>
              {pendingInvitations && pendingInvitations.length > 0 && (
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={invitation.invitationUrl}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-700 font-mono"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(invitation.invitationUrl)
                        // You could add a toast notification here
                      }}
                      className="text-accent-500 hover:text-accent-600 transition-colors"
                      title="Copy link"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <span className="text-gray-400">-</span>
              </td>
            </tr>
          ))}
          
          {/* Active Users */}
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-8 w-8">
                    <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-700">
                        {user.first_name.charAt(0)}{user.last_name.charAt(0)}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">
                      {user.first_name} {user.last_name}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{user.email}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                  {getRoleDisplayName(user.role)}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(user.created_at)}
              </td>
              {pendingInvitations && pendingInvitations.length > 0 && (
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-gray-400 text-sm">-</span>
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                {/* Don't show dropdown for owners or current user */}
                {user.role !== 'owner' && 
                 user.role !== 'company-owner' && 
                 user.id !== currentUserId ? (
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
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setOpenDropdownId(null)}
                        />
                        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                          <button
                            onClick={() => handleRemoveUser(user.id, `${user.first_name} ${user.last_name}`)}
                            disabled={removingUserId === user.id}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {removingUserId === user.id ? 'Removing...' : 'Remove from company'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
