'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'

interface AdminCoupon {
  id: string
  code: string
  active: boolean
  maxRedemptions: number | null
  timesRedeemed: number
  createdAt: string | null
  coupon: {
    id: string
    name: string | null
    percentOff: number | null
    amountOff: number | null
    currency: string | null
    duration: string
    durationInMonths: number | null
    appliesTo: string
    valid: boolean
  } | null
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function discountLabel(c: AdminCoupon) {
  const coupon = c.coupon
  if (!coupon) return '—'
  if (coupon.percentOff) return `${coupon.percentOff}% off`
  if (coupon.amountOff) return `£${coupon.amountOff.toFixed(2)} off`
  return '—'
}

function appliesLabel(appliesTo: string) {
  if (appliesTo === 'month') return 'Monthly plan'
  if (appliesTo === 'year') return 'Annual plan'
  return 'Monthly & annual'
}

export default function AdminCouponsPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [coupons, setCoupons] = useState<AdminCoupon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const [form, setForm] = useState({
    code: '',
    discountType: 'percent' as 'percent' | 'fixed',
    percentOff: '50',
    amountOff: '10',
    durationMonths: '3',
    appliesTo: 'month' as 'month' | 'year' | 'both',
    maxRedemptions: '',
    name: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')
    if (!token || !userData) {
      router.push('/admin')
      return
    }
    try {
      const user = JSON.parse(userData)
      if (user.role !== 'admin') {
        router.push('/admin')
        return
      }
      setIsAuthenticated(true)
    } catch {
      router.push('/admin')
    }
  }, [router])

  const fetchCoupons = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/admin/coupons'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) {
        setCoupons(data.coupons || [])
      } else {
        setError(data.error || 'Failed to load coupons')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) void fetchCoupons()
  }, [isAuthenticated, fetchCoupons])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    try {
      const token = localStorage.getItem('token')
      const body: Record<string, unknown> = {
        code: form.code,
        durationMonths: parseInt(form.durationMonths, 10) || 1,
        appliesTo: form.appliesTo,
        name: form.name.trim() || undefined,
      }
      if (form.discountType === 'percent') {
        body.percentOff = parseFloat(form.percentOff)
      } else {
        body.amountOff = parseFloat(form.amountOff)
      }
      if (form.maxRedemptions.trim()) {
        body.maxRedemptions = parseInt(form.maxRedemptions, 10)
      }

      const res = await fetch(apiUrl('/admin/coupons'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setCoupons((prev) => [data.coupon, ...prev])
        setForm({
          code: '',
          discountType: 'percent',
          percentOff: '50',
          amountOff: '10',
          durationMonths: '3',
          appliesTo: 'month',
          maxRedemptions: '',
          name: '',
        })
        setShowForm(false)
      } else {
        setCreateError(data.error || 'Failed to create coupon')
      }
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this coupon? New customers will not be able to use it.')) return
    setDeactivatingId(id)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/admin/coupons/${id}/deactivate`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) {
        setCoupons((prev) => prev.map((c) => (c.id === id ? data.coupon : c)))
      }
    } catch {
      /* ignore */
    } finally {
      setDeactivatingId(null)
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const activeCount = coupons.filter((c) => c.active).length

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">V</span>
            </div>
            <span className="text-xl font-bold text-gray-900">PathPilo Admin</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/admin/overview" className="text-gray-600 hover:text-gray-900">
              Overview
            </Link>
            <Link href="/admin/users" className="text-gray-600 hover:text-gray-900">
              Users
            </Link>
            <Link href="/admin/companies" className="text-gray-600 hover:text-gray-900">
              Companies
            </Link>
            <Link href="/admin/video-guides" className="text-gray-600 hover:text-gray-900">
              Video Guides
            </Link>
            <Link href="/admin/trials" className="text-gray-600 hover:text-gray-900">
              Trials
            </Link>
            <Link href="/admin/coupons" className="text-blue-600 font-semibold">
              Coupons
            </Link>
            <Link href="/admin/activity" className="text-gray-600 hover:text-gray-900">
              Activity
            </Link>
            <button
              onClick={() => {
                localStorage.removeItem('token')
                localStorage.removeItem('user')
                router.push('/admin')
              }}
              className="text-gray-500 hover:text-gray-800"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Discount coupons</h1>
            <p className="text-gray-600 mt-1 max-w-2xl">
              Create promo codes for Stripe checkout. Customers enter the code once — Stripe
              automatically applies the discount for the number of billing periods you set (e.g. 3
              months at 50% off on the monthly plan).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
          >
            {showForm ? 'Cancel' : 'Create coupon'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Total codes</p>
            <p className="text-2xl font-bold text-gray-900">{coupons.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-2xl font-bold text-green-700">{activeCount}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Total redemptions</p>
            <p className="text-2xl font-bold text-gray-900">
              {coupons.reduce((n, c) => n + (c.timesRedeemed || 0), 0)}
            </p>
          </div>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-xl border border-gray-200 p-6 mb-8 space-y-5"
          >
            <h2 className="text-lg font-semibold text-gray-900">New coupon</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Promo code *
                </label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="HALFOFF3"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase"
                />
                <p className="text-xs text-gray-500 mt-1">Customer enters this at Stripe checkout</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Internal name (optional)
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Launch offer — 50% monthly"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Discount type</label>
                <select
                  value={form.discountType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      discountType: e.target.value as 'percent' | 'fixed',
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="percent">Percentage off</option>
                  <option value="fixed">Fixed amount off (£)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.discountType === 'percent' ? 'Percent off *' : 'Amount off (£) *'}
                </label>
                <input
                  type="number"
                  required
                  min={form.discountType === 'percent' ? 1 : 0.01}
                  max={form.discountType === 'percent' ? 100 : undefined}
                  step={form.discountType === 'percent' ? 1 : 0.01}
                  value={form.discountType === 'percent' ? form.percentOff : form.amountOff}
                  onChange={(e) =>
                    setForm((f) =>
                      f.discountType === 'percent'
                        ? { ...f, percentOff: e.target.value }
                        : { ...f, amountOff: e.target.value }
                    )
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Billing periods *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={36}
                  value={form.durationMonths}
                  onChange={(e) => setForm((f) => ({ ...f, durationMonths: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Auto-applied each invoice — customer does not re-enter the code
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Applies to *</label>
                <select
                  value={form.appliesTo}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      appliesTo: e.target.value as 'month' | 'year' | 'both',
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="month">Monthly plan only (£39/mo)</option>
                  <option value="year">Annual plan only (£299/yr)</option>
                  <option value="both">Both plans</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max customers (optional)
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                  placeholder="Unlimited"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  How many different customers can redeem this code in total
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-900">
              <strong>Example:</strong> 50% off · 3 billing periods · Monthly plan → customer pays
              ~£19.50/mo for 3 months, then full price. They enter the code once at checkout.
            </div>

            {createError && <p className="text-sm text-red-600">{createError}</p>}

            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {creating ? 'Creating…' : 'Create in Stripe'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center text-red-800">
            {error}
            <button
              type="button"
              onClick={() => void fetchCoupons()}
              className="block mx-auto mt-3 text-sm underline"
            >
              Retry
            </button>
          </div>
        ) : coupons.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
            No coupons yet. Create one to offer discounts at checkout.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Discount</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Used</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-gray-900">{c.code}</span>
                        <button
                          type="button"
                          onClick={() => copyCode(c.code)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {copied === c.code ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(c.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-800">{discountLabel(c)}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {c.coupon?.durationInMonths
                        ? `${c.coupon.durationInMonths} billing period${c.coupon.durationInMonths === 1 ? '' : 's'}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {appliesLabel(c.coupon?.appliesTo || 'both')}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {c.timesRedeemed}
                      {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      {c.active && c.coupon?.valid ? (
                        <span className="inline-flex items-center gap-1.5 text-green-700">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-gray-500">
                          <span className="w-2 h-2 rounded-full bg-gray-400" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.active && (
                        <button
                          type="button"
                          disabled={deactivatingId === c.id}
                          onClick={() => void handleDeactivate(c.id)}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          {deactivatingId === c.id ? '…' : 'Deactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
