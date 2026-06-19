'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'
import AdminNav from '../components/AdminNav'
import { startOverwatchSession } from '../../utils/overwatch'
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline'

type CompanyPlan = 'standard' | 'pro'

interface Company {
  id: number
  name: string
  cvrNumber: string
  address: string
  zipCode: string
  city: string
  createdAt: string
  suspendedAt: string | null
  expiresAt: string | null
  plan: CompanyPlan
  billingInterval: string | null
  hasStripeSubscription: boolean
  smsTierKey: string | null
  userCount: number
  owner: {
    firstName: string
    lastName: string
    email: string
  }
}

function billingSource(c: Company): { label: string; cls: string } {
  if (c.hasStripeSubscription) return { label: 'Paid', cls: 'text-green-600' }
  if (c.plan === 'pro' && c.expiresAt) return { label: 'Trial', cls: 'text-blue-600' }
  if (c.plan === 'pro') return { label: 'Comped', cls: 'text-teal-600' }
  return { label: 'Free', cls: 'text-gray-400' }
}

const PLAN_META: Record<CompanyPlan, { label: string; className: string }> = {
  standard: {
    label: 'Standard',
    className: 'bg-gray-100 text-gray-700 border border-gray-200',
  },
  pro: {
    label: 'Pro',
    className: 'bg-violet-100 text-violet-700 border border-violet-200',
  },
}

function PlanCell({ company }: { company: Company }) {
  const meta = PLAN_META[company.plan] ?? PLAN_META.standard
  const source = billingSource(company)
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}>
          {meta.label}
        </span>
        <span className={`text-xs font-medium ${source.cls}`}>{source.label}</span>
        {company.billingInterval && company.hasStripeSubscription && (
          <span className="text-xs text-gray-400">/{company.billingInterval}</span>
        )}
      </div>
      {company.smsTierKey && (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
          SMS add-on
        </span>
      )}
    </div>
  )
}

function ExpiryCell({ expiresAt, suspendedAt }: { expiresAt: string | null; suspendedAt: string | null }) {
  if (suspendedAt) {
    return (
      <div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
          On hold
        </span>
      </div>
    )
  }

  if (!expiresAt) {
    return <span className="text-sm text-gray-400">No expiry</span>
  }

  const now = new Date()
  const exp = new Date(expiresAt)
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const dateStr = exp.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  if (daysLeft < 0) {
    return (
      <div>
        <div className="text-sm font-medium text-red-600">{dateStr}</div>
        <div className="text-xs text-red-400 mt-0.5">({Math.abs(daysLeft)} days ago)</div>
      </div>
    )
  }

  if (daysLeft === 0) {
    return (
      <div>
        <div className="text-sm font-medium text-orange-600">{dateStr}</div>
        <div className="text-xs text-orange-400 mt-0.5">(expires today)</div>
      </div>
    )
  }

  const color = daysLeft <= 7 ? 'text-orange-600' : daysLeft <= 30 ? 'text-yellow-600' : 'text-gray-900'
  const subColor = daysLeft <= 7 ? 'text-orange-400' : daysLeft <= 30 ? 'text-yellow-500' : 'text-gray-400'

  return (
    <div>
      <div className={`text-sm font-medium ${color}`}>{dateStr}</div>
      <div className={`text-xs mt-0.5 ${subColor}`}>({daysLeft} days left)</div>
    </div>
  )
}

export default function AdminCompaniesPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [enteringCompanyId, setEnteringCompanyId] = useState<number | null>(null)

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

    // Check auth first, then fetch companies if authenticated
    if (checkAuth()) {
      setIsAuthenticated(true)
      fetchCompanies()
    }
  }, [router])

  const fetchCompanies = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      
      if (!token) {
        setError('Not authenticated. Please log in.')
        return
      }

      const response = await fetch(apiUrl('/admin/companies'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()

      if (response.ok) {
        setCompanies(data.companies)
      } else {
        if (response.status === 403) {
          setError('Admin access required. Only admin users can view this page.')
        } else {
          setError(data.error || 'Failed to fetch companies')
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

  const handleEnterOverwatch = async (companyId: number) => {
    if (enteringCompanyId) return
    const superPassword = window.prompt('Enter super password to start Overwatch')
    if (!superPassword) return
    setEnteringCompanyId(companyId)
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setError('Not authenticated. Please log in again.')
        return
      }

      const response = await fetch(apiUrl(`/admin/companies/${companyId}/overwatch/start`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ superPassword }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Failed to start overwatch')
        return
      }

      startOverwatchSession(data.token, data.user)
      const slug = data.user?.activeCompany?.slug
      window.location.href = slug ? `/${slug}/dashboard` : '/select-company'
    } catch (err) {
      setError('Failed to start overwatch: ' + (err as Error).message)
    } finally {
      setEnteringCompanyId(null)
    }
  }

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
      <AdminNav />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">All Companies</h1>
          <p className="text-gray-600">View and manage all registered companies in the system</p>
        </div>

        {/* Companies Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading companies...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <div className="text-red-600 mb-4">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-lg font-medium">Error loading companies</p>
                <p className="text-sm">{error}</p>
              </div>
              <button
                onClick={fetchCompanies}
                className="btn-primary"
              >
                Try Again
              </button>
            </div>
          ) : companies.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <p className="text-lg font-medium">No companies found</p>
                <p className="text-sm">No companies have been created yet.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Users</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Access expires</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Overwatch</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {companies.map((company) => (
                    <tr key={company.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-blue-600">{company.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <Link href={`/admin/companies/${company.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
                              {company.name}
                            </Link>
                            <div className="text-xs text-gray-400">ID: {company.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{company.owner.firstName} {company.owner.lastName}</div>
                        <div className="text-xs text-gray-500">{company.owner.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <PlanCell company={company} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{company.userCount ?? '—'}</td>
                      <td className="px-6 py-4">
                        <ExpiryCell expiresAt={company.expiresAt} suspendedAt={company.suspendedAt} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatDate(company.createdAt)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => handleEnterOverwatch(company.id)}
                          disabled={enteringCompanyId === company.id}
                          title="Enter company in overwatch mode"
                          className="inline-flex items-center justify-center rounded-md border border-gray-200 p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ArrowRightCircleIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats */}
        {companies.length > 0 && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-blue-600">{companies.length}</div>
              <div className="text-sm text-gray-500 mt-0.5">Total companies</div>
            </div>
            <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-green-600">
                {companies.filter(c => !c.suspendedAt && (!c.expiresAt || new Date(c.expiresAt) > new Date())).length}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">Active</div>
            </div>
            <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-orange-500">
                {companies.filter(c => {
                  if (!c.expiresAt || c.suspendedAt) return false
                  const days = Math.ceil((new Date(c.expiresAt).getTime() - Date.now()) / 86400000)
                  return days >= 0 && days <= 7
                }).length}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">Expiring this week</div>
            </div>
            <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-amber-600">
                {companies.filter(c => c.suspendedAt).length}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">On hold</div>
            </div>
            <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-violet-600">
                {companies.filter(c => (c.plan || 'standard') === 'pro').length}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">Pro plan</div>
            </div>
            <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-gray-600">
                {companies.filter(c => !c.plan || c.plan === 'standard').length}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">Standard plan</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

