'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { apiUrl } from '../../../utils/api'

interface User {
  id: number
  first_name: string
  last_name: string
  email: string
  company_role: string
  created_at: string
}

interface Company {
  id: number
  name: string
  country: string
  cvrNumber: string
  address: string
  zipCode: string
  city: string
  createdAt: string
  updatedAt: string
  suspendedAt: string | null
  expiresAt: string | null
  owner: { firstName: string; lastName: string; email: string }
}

export default function CompanyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const companyId = params?.id as string

  const [company, setCompany] = useState<Company | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Hold state
  const [holdLoading, setHoldLoading] = useState(false)
  const [holdError, setHoldError] = useState('')

  // Expiry state
  const [expiryInput, setExpiryInput] = useState('')
  const [expirySaving, setExpirySaving] = useState(false)
  const [expiryError, setExpiryError] = useState('')
  const [expirySuccess, setExpirySuccess] = useState('')

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deleteInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('token')
      const userData = localStorage.getItem('user')
      if (!token || !userData) { router.push('/admin'); return false }
      try {
        const user = JSON.parse(userData)
        if (user.role !== 'admin') { router.push('/admin'); return false }
        return true
      } catch { router.push('/admin'); return false }
    }
    if (checkAuth() && companyId) {
      setIsAuthenticated(true)
      fetchCompanyData()
    }
  }, [router, companyId])

  useEffect(() => {
    if (showDeleteModal) setTimeout(() => deleteInputRef.current?.focus(), 50)
  }, [showDeleteModal])

  const fetchCompanyData = async () => {
    if (!companyId) return
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const [companyRes, usersRes] = await Promise.all([
        fetch(apiUrl(`/admin/companies/${companyId}`), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl(`/admin/companies/${companyId}/users`), { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const companyData = await companyRes.json()
      const usersData = await usersRes.json()
      if (companyRes.ok) {
        const c = companyData.company || companyData
        setCompany(c)
        // Pre-fill expiry input with existing value (YYYY-MM-DD for date input)
        if (c.expiresAt) {
          setExpiryInput(new Date(c.expiresAt).toISOString().split('T')[0])
        }
      } else {
        setError(companyData.error || 'Failed to fetch company')
      }
      if (usersRes.ok) setUsers(usersData.users || [])
    } catch (err) {
      setError('Network error: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveExpiry = async (dateStr: string | null) => {
    setExpirySaving(true); setExpiryError(''); setExpirySuccess('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/admin/companies/${companyId}/expiry`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresAt: dateStr ? new Date(dateStr).toISOString() : null }),
      })
      const data = await res.json()
      if (res.ok) {
        setCompany(prev => prev ? { ...prev, expiresAt: data.company.expiresAt } : prev)
        setExpirySuccess(data.message)
        setTimeout(() => setExpirySuccess(''), 3000)
      } else {
        setExpiryError(data.error || 'Failed to save')
      }
    } catch {
      setExpiryError('Network error. Please try again.')
    } finally {
      setExpirySaving(false)
    }
  }

  const handleToggleHold = async () => {
    if (!company) return
    setHoldLoading(true)
    setHoldError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/admin/companies/${companyId}/hold`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) {
        setCompany(prev => prev ? { ...prev, suspendedAt: data.company.suspendedAt } : prev)
      } else {
        setHoldError(data.error || 'Failed to update status')
      }
    } catch {
      setHoldError('Network error. Please try again.')
    } finally {
      setHoldLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!company || deleteConfirmText !== company.name) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/admin/companies/${companyId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: deleteConfirmText }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push('/admin/companies')
      } else {
        setDeleteError(data.error || 'Failed to delete company')
      }
    } catch {
      setDeleteError('Network error. Please try again.')
    } finally {
      setDeleteLoading(false)
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const expiryStatus = () => {
    if (!company?.expiresAt) return null
    const now = Date.now()
    const exp = new Date(company.expiresAt).getTime()
    const days = Math.ceil((exp - now) / 86400000)
    if (days < 0)  return { label: 'Expired', cls: 'bg-red-100 text-red-700 border-red-200' }
    if (days <= 7) return { label: `Expires in ${days} day${days === 1 ? '' : 's'}`, cls: 'bg-orange-100 text-orange-700 border-orange-200' }
    return { label: `Expires ${new Date(company.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, cls: 'bg-green-100 text-green-700 border-green-200' }
  }

  const roleBadge = (role: string) => ({
    owner: 'bg-purple-100 text-purple-800 border-purple-200',
    admin: 'bg-purple-100 text-purple-800 border-purple-200',
    manager: 'bg-blue-100 text-blue-800 border-blue-200',
    employee: 'bg-green-100 text-green-800 border-green-200',
  }[role] || 'bg-gray-100 text-gray-800 border-gray-200')

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="mt-2 text-gray-600">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  const isSuspended = !!company?.suspendedAt

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">V</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Vevago Admin</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Link href="/admin/overview" className="text-gray-600 hover:text-gray-900">Overview</Link>
            <Link href="/admin/users" className="text-gray-600 hover:text-gray-900">Users</Link>
            <Link href="/admin/companies" className="text-blue-600 font-medium">Companies</Link>
            <Link href="/admin/trials" className="text-gray-600 hover:text-gray-900">Trials</Link>
            <button onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.push('/admin') }} className="text-gray-600 hover:text-gray-900">Logout</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Link href="/admin/companies" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Companies
        </Link>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800">{error}</p>
            <button onClick={fetchCompanyData} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Try Again</button>
          </div>
        ) : company ? (
          <>
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl font-bold text-blue-600">{company.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
                      {isSuspended && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                          On hold
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">ID: {company.id} · Created {fmt(company.createdAt)}</p>
                    {isSuspended && (
                      <p className="text-xs text-amber-600 mt-0.5">Suspended {fmt(company.suspendedAt!)}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {holdError && <p className="text-xs text-red-600">{holdError}</p>}
                  <button
                    onClick={handleToggleHold}
                    disabled={holdLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                      isSuspended
                        ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                        : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    {holdLoading ? 'Saving…' : isSuspended ? 'Reactivate company' : 'Put on hold'}
                  </button>
                  <button
                    onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError('') }}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                  >
                    Delete company
                  </button>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-gray-100">
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Company info</h3>
                  <dl className="space-y-2">
                    <div><dt className="text-xs text-gray-500">CVR</dt><dd className="text-sm font-medium text-gray-900">{company.cvrNumber || '—'}</dd></div>
                    <div><dt className="text-xs text-gray-500">Address</dt><dd className="text-sm font-medium text-gray-900">{[company.address, company.zipCode, company.city].filter(Boolean).join(', ') || '—'}</dd></div>
                    <div><dt className="text-xs text-gray-500">Country</dt><dd className="text-sm font-medium text-gray-900">{company.country || '—'}</dd></div>
                  </dl>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Owner</h3>
                  <dl className="space-y-2">
                    <div><dt className="text-xs text-gray-500">Name</dt><dd className="text-sm font-medium text-gray-900">{company.owner.firstName} {company.owner.lastName}</dd></div>
                    <div><dt className="text-xs text-gray-500">Email</dt><dd className="text-sm font-medium text-gray-900">{company.owner.email}</dd></div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Access expiry */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Access &amp; expiry</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Set a date when access should expire. Leave blank for permanent access.</p>
                </div>
                {expiryStatus() && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${expiryStatus()!.cls}`}>
                    {expiryStatus()!.label}
                  </span>
                )}
                {!company?.expiresAt && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border bg-gray-100 text-gray-500 border-gray-200">
                    No expiry set — permanent
                  </span>
                )}
              </div>

              {/* Mismatch banner: company is suspended but expiry is in the future (or cleared) */}
              {isSuspended && (!company?.expiresAt || new Date(company.expiresAt) > new Date()) && (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900">This company is still on hold</p>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Access is valid {company?.expiresAt ? `until ${new Date(company.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'permanently'}, but the company is suspended (likely auto-suspended when the previous trial expired). Click <strong>Reactivate now</strong> to lift the hold so the owner can log in.
                    </p>
                  </div>
                  <button
                    onClick={handleToggleHold}
                    disabled={holdLoading}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold border border-green-400 bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50 flex-shrink-0"
                  >
                    {holdLoading ? 'Reactivating…' : 'Reactivate now'}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                {/* Date input */}
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Expiry date</label>
                  <input
                    type="date"
                    value={expiryInput}
                    onChange={e => { setExpiryInput(e.target.value); setExpiryError(''); setExpirySuccess('') }}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </div>

                {/* Quick presets */}
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: '14-day trial', days: 14 },
                    { label: '1 month',      days: 30 },
                    { label: '6 months',     days: 183 },
                    { label: '1 year',       days: 365 },
                  ].map(p => {
                    const d = new Date(); d.setDate(d.getDate() + p.days)
                    const iso = d.toISOString().split('T')[0]
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => { setExpiryInput(iso); setExpiryError(''); setExpirySuccess('') }}
                        className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveExpiry(expiryInput || null)}
                    disabled={expirySaving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {expirySaving ? 'Saving…' : 'Save'}
                  </button>
                  {company?.expiresAt && (
                    <button
                      onClick={() => { setExpiryInput(''); handleSaveExpiry(null) }}
                      disabled={expirySaving}
                      className="px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                    >
                      Clear (permanent)
                    </button>
                  )}
                </div>
              </div>

              {expiryError   && <p className="mt-3 text-sm text-red-600">{expiryError}</p>}
              {expirySuccess && <p className="mt-3 text-sm text-green-600">{expirySuccess}</p>}
            </div>

            {/* Users table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Team members</h2>
                <p className="text-sm text-gray-500 mt-0.5">{users.length} {users.length === 1 ? 'person' : 'people'}</p>
              </div>
              {users.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No users associated with this company.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {['User', 'Email', 'Role', 'Joined'].map(h => (
                          <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map(user => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600">
                                {user.first_name[0]}{user.last_name[0]}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{user.first_name} {user.last_name}</div>
                                <div className="text-xs text-gray-400">ID: {user.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleBadge(user.company_role)}`}>
                              {user.company_role.charAt(0).toUpperCase() + user.company_role.slice(1)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{fmt(user.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && company && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Delete company</h2>
                <p className="text-sm text-gray-500">This cannot be undone</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm text-red-800 space-y-1">
              <p className="font-semibold">Everything will be permanently deleted:</p>
              <ul className="list-disc list-inside text-red-700 space-y-0.5 mt-1">
                <li>All clients</li>
                <li>All jobs &amp; schedules</li>
                <li>All invoices &amp; subscriptions</li>
                <li>All services, routes and notes</li>
              </ul>
              <p className="mt-2 text-red-600">Team members are <strong>not</strong> deleted — they can still log in and create a new company.</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type <strong className="font-mono">{company.name}</strong> to confirm
              </label>
              <input
                ref={deleteInputRef}
                type="text"
                value={deleteConfirmText}
                onChange={e => { setDeleteConfirmText(e.target.value); setDeleteError('') }}
                placeholder={company.name}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
                onKeyDown={e => { if (e.key === 'Enter' && deleteConfirmText === company.name) handleDelete() }}
              />
              {deleteError && <p className="text-xs text-red-600 mt-1">{deleteError}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteError('') }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmText !== company.name || deleteLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deleteLoading ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
