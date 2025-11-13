'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'

export default function CompanySetupPage() {
  const [formData, setFormData] = useState({
    country: '',
    name: '',
    cvrNumber: '',
    address: '',
    city: '',
    zipCode: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/companies'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })
      
      const data = await response.json()
      
      if (response.ok) {
        // Store company data in localStorage
        localStorage.setItem('company', JSON.stringify(data.company))
        
        // Update user data with companyId
        const userData = localStorage.getItem('user')
        if (userData) {
          const user = JSON.parse(userData)
          user.companyId = data.company.id
          user.companyName = data.company.name
          localStorage.setItem('user', JSON.stringify(user))
        }
        
        router.push('/setup/services')
      } else {
        setError(data.error || 'Failed to create company')
      }
    } catch (error) {
      setError('Network error: Failed to create company')
      console.error('Company creation error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid grid-cols-5 gap-16 items-start">
          {/* Left Column - Text (40%) */}
          <div className="col-span-2 pt-4">
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 mb-4">
                  Step 1 of 3
                </div>
                <h1 className="text-3xl font-semibold text-gray-900 mb-4 tracking-tight">
                  Setup your company
                </h1>
                <p className="text-base text-gray-600 leading-relaxed">
                  Let's get your company set up so you can start managing your clients, 
                  services, and jobs efficiently.
                </p>
              </div>
              
              <div className="space-y-3 pt-4">
                <div className="flex items-center space-x-3 text-sm text-gray-500">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                  <span>Company Information</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                  <span>Team Setup</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                  <span>Preferences</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form (60%) */}
          <div className="col-span-3">
            <div className="bg-white/70 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-8 shadow-xl shadow-gray-900/5">
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="bg-red-50/80 border border-red-200/60 rounded-xl p-4 backdrop-blur-sm">
                    <p className="text-red-600 text-sm font-medium">{error}</p>
                  </div>
                )}

                <div className="space-y-5">
                  {/* Country */}
                  <div className="group">
                    <label htmlFor="country" className="block text-sm font-medium text-gray-900 mb-2">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="country"
                      name="country"
                      value={formData.country}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                      placeholder="e.g. Denmark"
                    />
                  </div>

                  {/* Company Name */}
                  <div className="group">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-2">
                      Company name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                      placeholder="e.g. Clean Windows Co."
                    />
                  </div>

                  {/* CVR Number */}
                  <div className="group">
                    <label htmlFor="cvrNumber" className="block text-sm font-medium text-gray-900 mb-2">
                      CVR number <span className="text-gray-400 text-xs">(optional)</span>
                    </label>
                    <input
                      type="text"
                      id="cvrNumber"
                      name="cvrNumber"
                      value={formData.cvrNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                      placeholder="e.g. 12345678"
                    />
                  </div>

                  {/* Address */}
                  <div className="group">
                    <label htmlFor="address" className="block text-sm font-medium text-gray-900 mb-2">
                      Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                      placeholder="e.g. Main Street 123"
                    />
                  </div>

                  {/* City and Zip Code in one row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="city" className="block text-sm font-medium text-gray-900 mb-2">
                        City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="city"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        required
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                        placeholder="e.g. Copenhagen"
                      />
                    </div>
                    <div className="group">
                      <label htmlFor="zipCode" className="block text-sm font-medium text-gray-900 mb-2">
                        Zip <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="zipCode"
                        name="zipCode"
                        value={formData.zipCode}
                        onChange={handleInputChange}
                        required
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                        placeholder="e.g. 2100"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Creating Company...</span>
                    </span>
                  ) : (
                    'Create Company'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}