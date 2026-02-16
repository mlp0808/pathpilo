'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '../hooks/useUser'
import { apiUrl } from '../utils/api'

export default function SelectCompanyPage() {
  const router = useRouter()
  const { user, loading } = useUser()
  const [companies, setCompanies] = useState<any[]>([])
  const [loadingCompanies, setLoadingCompanies] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      if (user.companies && user.companies.length > 0) {
        // User has companies, show selection
        setCompanies(user.companies)
      } else {
        // No companies, redirect to create company or show message
        console.log('User has no companies')
      }
    }
  }, [user, loading])

  const handleCompanySelect = async (company: any) => {
    try {
      setLoadingCompanies(true)
      const token = localStorage.getItem('token')

      // Switch to this company
      const response = await fetch(apiUrl('/companies/switch'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ company_slug: company.slug })
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Company switch response:', data)
        // Update token and user data
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        // Redirect to company dashboard - use the slug from the response
        const targetSlug = data.user?.activeCompany?.slug || company.slug
        console.log('Redirecting to:', targetSlug)
        // Use push instead of replace to avoid navigation issues
        router.push(`/${targetSlug}/dashboard`)
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to switch company:', response.status, errorData)
        alert(`Failed to switch company: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error switching company:', error)
    } finally {
      setLoadingCompanies(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Select Company</h1>
          <p className="text-gray-600">Choose which company you'd like to work with</p>
        </div>

        {companies.length === 0 ? (
          <div className="text-center">
            <p className="text-gray-500 mb-4">You don't have access to any companies yet.</p>
            <button
              onClick={() => router.push('/setup/company')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Company
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => handleCompanySelect(company)}
                disabled={loadingCompanies}
                className="w-full p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{company.name}</h3>
                    <p className="text-sm text-gray-500">{company.slug}</p>
                  </div>
                  {company.id === user?.activeCompany?.id && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                      Active
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => router.push('/login')}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Not you? Sign out
          </button>
        </div>
      </div>
    </div>
  )
}


