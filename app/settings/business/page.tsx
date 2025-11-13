'use client'

import { useState, useEffect } from 'react'
import { BuildingOffice2Icon, PencilIcon, ClockIcon } from '@heroicons/react/24/outline'

interface CompanyProfile {
  id: number
  name: string
  country: string
  cvrNumber: string
  address: string
  city: string
  zipCode: string
}

interface WorkHours {
  monday_hours: number
  tuesday_hours: number
  wednesday_hours: number
  thursday_hours: number
  friday_hours: number
  saturday_hours: number
  sunday_hours: number
}

interface User {
  id: number
  first_name: string
  last_name: string
  email: string
  role: string
}

export default function BusinessSettingsPage() {
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formData, setFormData] = useState<CompanyProfile>({
    id: 0,
    name: '',
    country: '',
    cvrNumber: '',
    address: '',
    city: '',
    zipCode: ''
  })

  // Work hours state
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [workHours, setWorkHours] = useState<WorkHours>({
    monday_hours: 7.5,
    tuesday_hours: 7.5,
    wednesday_hours: 7.5,
    thursday_hours: 7.5,
    friday_hours: 7.0,
    saturday_hours: 0.0,
    sunday_hours: 0.0
  })
  const [isEditingHours, setIsEditingHours] = useState(false)
  const [hoursLoading, setHoursLoading] = useState(false)
  const [hoursError, setHoursError] = useState('')
  const [hoursSuccess, setHoursSuccess] = useState('')

  // Fetch company profile
  useEffect(() => {
    const fetchCompanyProfile = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch('http://localhost:3003/api/company/profile', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to fetch company profile')
        }

        const data = await response.json()
        setFormData({
          id: data.company.id || 0,
          name: data.company.name || '',
          country: data.company.country || '',
          cvrNumber: data.company.cvrNumber || '',
          address: data.company.address || '',
          city: data.company.city || '',
          zipCode: data.company.zipCode || ''
        })
      } catch (error) {
        console.error('Error fetching company profile:', error)
      }
    }

    fetchCompanyProfile()
    fetchUsers()
  }, [])

  // Fetch users for the company
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3003/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }

      const data = await response.json()
      setUsers(data.users || [])
      
      // Set default selected user to first user
      if (data.users && data.users.length > 0) {
        setSelectedUserId(data.users[0].id)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  // Fetch work hours when selected user changes
  useEffect(() => {
    if (selectedUserId) {
      fetchWorkHours()
    }
  }, [selectedUserId])

  const fetchWorkHours = async () => {
    if (!selectedUserId) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3003/api/work-hours/${selectedUserId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch work hours')
      }

      const data = await response.json()
      console.log('🔍 DEBUG: Raw API response:', data.workHours)
      
      // Ensure all values are numbers
      const workHoursData = {
        monday_hours: parseFloat(data.workHours.monday_hours) || 7.5,
        tuesday_hours: parseFloat(data.workHours.tuesday_hours) || 7.5,
        wednesday_hours: parseFloat(data.workHours.wednesday_hours) || 7.5,
        thursday_hours: parseFloat(data.workHours.thursday_hours) || 7.5,
        friday_hours: parseFloat(data.workHours.friday_hours) || 7.0,
        saturday_hours: parseFloat(data.workHours.saturday_hours) || 0.0,
        sunday_hours: parseFloat(data.workHours.sunday_hours) || 0.0
      }
      
      console.log('🔍 DEBUG: Processed work hours:', workHoursData)
      setWorkHours(workHoursData)
    } catch (error) {
      console.error('Error fetching work hours:', error)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3003/api/company/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update company profile')
      }

      setSuccess('Company profile updated successfully!')
      setIsEditing(false)
    } catch (error) {
      console.error('Error updating company profile:', error)
      setError(error instanceof Error ? error.message : 'Failed to update company profile')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setError('')
    setSuccess('')
    // Reset form data to original values
    window.location.reload()
  }

  const handleWorkHourChange = (day: string, value: string) => {
    const numValue = parseFloat(value) || 0
    console.log('🔍 DEBUG: Changing', day, 'from', workHours[day as keyof WorkHours], 'to', numValue)
    setWorkHours(prev => ({
      ...prev,
      [day]: numValue
    }))
  }

  const handleSaveWorkHours = async () => {
    if (!selectedUserId) return

    setHoursLoading(true)
    setHoursError('')
    setHoursSuccess('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3003/api/work-hours/${selectedUserId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ workHours })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update work hours')
      }

      setHoursSuccess('Work hours updated successfully!')
      setIsEditingHours(false)
    } catch (error) {
      console.error('Error updating work hours:', error)
      setHoursError(error instanceof Error ? error.message : 'Failed to update work hours')
    } finally {
      setHoursLoading(false)
    }
  }

  const handleCancelWorkHours = () => {
    fetchWorkHours()
    setIsEditingHours(false)
    setHoursError('')
    setHoursSuccess('')
  }

  const calculateTotalHours = () => {
    const total = Object.values(workHours).reduce((total, hours) => total + hours, 0)
    console.log('🔍 DEBUG: Work hours values:', workHours)
    console.log('🔍 DEBUG: Total calculated:', total)
    return total
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <BuildingOffice2Icon className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Business Settings</h1>
              <p className="text-gray-600 mt-1">Manage your company information.</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Success Message */}
          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Company Information Section */}
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Company Information</h2>
                <p className="text-sm text-gray-500">Update your company details</p>
              </div>
              
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <PencilIcon className="w-4 h-4 mr-2" />
                  Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CVR Number
                </label>
                <input
                  type="text"
                  name="cvrNumber"
                  value={formData.cvrNumber}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country
                </label>
                <input
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  City
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ZIP Code
                </label>
                <input
                  type="text"
                  name="zipCode"
                  value={formData.zipCode}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            {isEditing && (
              <div className="flex items-center space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>

          {/* Work Hours Section */}
          <div className="bg-gray-50 rounded-lg p-6 mt-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <ClockIcon className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Working Hours</h2>
                  <p className="text-sm text-gray-500">Set working hours for your team members</p>
                </div>
              </div>
              
              {!isEditingHours && (
                <button
                  onClick={() => setIsEditingHours(true)}
                  className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <PencilIcon className="w-4 h-4 mr-2" />
                  Edit Hours
                </button>
              )}
            </div>

            {/* User Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Employee
              </label>
              <select
                value={selectedUserId || ''}
                onChange={(e) => setSelectedUserId(parseInt(e.target.value))}
                disabled={isEditingHours}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              >
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Work Hours Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Day</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'monday_hours', label: 'Monday' },
                    { key: 'tuesday_hours', label: 'Tuesday' },
                    { key: 'wednesday_hours', label: 'Wednesday' },
                    { key: 'thursday_hours', label: 'Thursday' },
                    { key: 'friday_hours', label: 'Friday' },
                    { key: 'saturday_hours', label: 'Saturday' },
                    { key: 'sunday_hours', label: 'Sunday' }
                  ].map(({ key, label }) => (
                    <tr key={key} className="border-b border-gray-100">
                      <td className="py-3 px-4 text-gray-700">{label}</td>
                      <td className="py-3 px-4 text-right">
                        {isEditingHours ? (
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="24"
                            value={workHours[key as keyof WorkHours]}
                            onChange={(e) => handleWorkHourChange(key, e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        ) : (
                          <span className="text-gray-900 font-medium">
                            {workHours[key as keyof WorkHours]}h
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-100">
                    <td className="py-3 px-4 font-semibold text-gray-900">Total</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900">
                      {calculateTotalHours().toFixed(1)}h/week
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Success Message */}
            {hoursSuccess && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm">{hoursSuccess}</p>
              </div>
            )}

            {/* Error Message */}
            {hoursError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{hoursError}</p>
              </div>
            )}

            {/* Action Buttons */}
            {isEditingHours && (
              <div className="flex items-center space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={handleCancelWorkHours}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveWorkHours}
                  disabled={hoursLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {hoursLoading ? 'Saving...' : 'Save Hours'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}