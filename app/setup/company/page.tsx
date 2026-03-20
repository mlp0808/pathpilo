'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'
import { useUser } from '../../hooks/useUser'
import AddressAutocomplete, { AddressData } from '@/app/components/AddressAutocomplete'

export default function CompanySetupPage() {
  const { user } = useUser()
  const [formData, setFormData] = useState({
    country: '',
    name: '',
    cvrNumber: '',
    address: '',
    city: '',
    zipCode: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (user && user.companyId) {
      setIsUpdating(true)
      const companyName = user.companyName ?? ''
      if (companyName) setFormData(prev => ({ ...prev, name: companyName }))
    }
  }, [user])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('token')

      const method = isUpdating ? 'PUT' : 'POST'
      const endpoint = isUpdating ? `/companies/${user?.companyId}` : '/companies'

      // No slug sent — the backend derives it from the name and auto-resolves collisions
      const response = await fetch(apiUrl(endpoint), {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok) {
        localStorage.setItem('company', JSON.stringify(data.company))

        const userData = localStorage.getItem('user')
        if (userData) {
          const userObj = JSON.parse(userData)
          userObj.companyId = data.company.id
          userObj.companyName = data.company.name
          if (data.company.slug) {
            const companyEntry = {
              id: data.company.id,
              name: data.company.name,
              slug: data.company.slug,
              role: 'owner',
              isOwner: true,
            }
            const existingCompanies = Array.isArray(userObj.companies) ? userObj.companies : []
            userObj.companies = [companyEntry, ...existingCompanies.filter((c: any) => c?.id !== companyEntry.id)]
            userObj.activeCompany = companyEntry
          }
          localStorage.setItem('user', JSON.stringify(userObj))
        }

        router.push('/setup/services')
      } else {
        setError(data.error || `Failed to ${isUpdating ? 'update' : 'create'} company`)
      }
    } catch {
      setError(`Network error: Failed to ${isUpdating ? 'update' : 'create'} company`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-primary-50/30 to-primary-50/50">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid grid-cols-5 gap-16 items-start">
          {/* Left Column */}
          <div className="col-span-2 pt-4">
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-50 text-accent-700 border border-accent-200 mb-4">
                  Step 1 of 3
                </div>
                <h1 className="text-3xl font-bold text-primary-800 mb-4 tracking-tight">
                  Create your company
                </h1>
                <p className="text-base text-gray-600 leading-relaxed">
                  Let's get started by adding all your company details.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <div className="flex items-center space-x-3 text-sm font-medium text-primary-700">
                  <div className="w-1.5 h-1.5 bg-accent-500 rounded-full" />
                  <span>Create Company</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                  <span>Setup Services</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                  <span>Add Clients</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form */}
          <div className="col-span-3">
            <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-xl shadow-primary-500/5">
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-red-600 text-sm font-medium">{error}</p>
                  </div>
                )}

                <div className="space-y-5">
                  {/* Country */}
                  <div>
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
                      className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all placeholder-gray-400 hover:border-gray-300 shadow-sm"
                      placeholder="e.g. Denmark"
                    />
                  </div>

                  {/* Company Name */}
                  <div>
                    <label htmlFor="name" className="block text-xs font-semibold text-primary-700 mb-2">
                      Company name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all placeholder-gray-400 hover:border-gray-300 shadow-sm"
                      placeholder="e.g. Clean Windows Co."
                    />
                  </div>

                  {/* CVR Number */}
                  <div>
                    <label htmlFor="cvrNumber" className="block text-sm font-medium text-gray-900 mb-2">
                      CVR number <span className="text-gray-400 text-xs">(optional)</span>
                    </label>
                    <input
                      type="text"
                      id="cvrNumber"
                      name="cvrNumber"
                      value={formData.cvrNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all placeholder-gray-400 hover:border-gray-300 shadow-sm"
                      placeholder="e.g. 12345678"
                    />
                  </div>

                  {/* Address */}
                  <AddressAutocomplete
                    label="Company address"
                    address={formData.address}
                    zip_code={formData.zipCode}
                    city={formData.city}
                    lat={undefined}
                    lng={undefined}
                    placeholder="Start typing an address…"
                    onChange={(data: AddressData) => {
                      setFormData(prev => ({
                        ...prev,
                        address: data.address,
                        zipCode: data.zip_code,
                        city: data.city,
                      }))
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-accent-500 hover:bg-accent-600 text-white py-3 px-6 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-accent-500/20 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-500/20 hover:shadow-xl hover:shadow-accent-500/25"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving…</span>
                    </span>
                  ) : (
                    'Next step'
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
