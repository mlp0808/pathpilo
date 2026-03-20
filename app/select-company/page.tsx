'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../utils/api'

interface Company {
  id: number
  name: string
  slug: string
  role: string
}

export default function SelectCompanyPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    // Read from localStorage first (fast path after registration/login)
    const raw = localStorage.getItem('user')
    if (raw) {
      try {
        const user = JSON.parse(raw)
        setUserName(user.firstName || '')
        if (user.companies?.length > 0) {
          setCompanies(user.companies)
          setLoading(false)
          return
        }
      } catch { /* ignore */ }
    }

    // Fallback: fetch from API
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    fetch(apiUrl('/users'), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        // /api/users returns users in the active company — we need the companies list
        // Instead, decode the token to find companyId and build from localStorage
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSelect = (company: Company) => {
    // Update localStorage so the app knows the active company
    const raw = localStorage.getItem('user')
    if (raw) {
      try {
        const user = JSON.parse(raw)
        user.companyId = company.id
        user.companyName = company.name
        user.activeCompany = company
        user.role = company.role
        localStorage.setItem('user', JSON.stringify(user))
      } catch { /* ignore */ }
    }
    router.push(`/${company.slug}/dashboard`)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  const roleLabel = (r: string) =>
    r === 'owner' ? 'Owner' : r === 'manager' ? 'Manager' : 'Employee'

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (companies.length === 0) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">No companies found</h2>
            <p className="text-sm text-gray-500 mb-6">
              You're not linked to any company yet. Contact your manager to send you an invitation.
            </p>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">

        {/* Brand */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-primary-500">Vevago</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-5 border-b border-gray-100">
            <h1 className="text-xl font-bold text-gray-900">
              {userName ? `Welcome, ${userName}!` : 'Welcome back!'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Select a company to continue
            </p>
          </div>

          {/* Company list */}
          <ul className="divide-y divide-gray-100">
            {companies.map(company => (
              <li key={company.id}>
                <button
                  onClick={() => handleSelect(company)}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-page transition-colors text-left group"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white">
                      {company.name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{company.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{roleLabel(company.role)}</p>
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Sign out */}
        <div className="text-center mt-6">
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign out
          </button>
        </div>

      </div>
    </div>
  )
}
