'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { apiUrl } from '../../utils/api'

interface LoginEvent {
  id: number
  createdAt: string
  ip: string | null
  userAgent: string | null
  user: { id: number; email: string; firstName: string; lastName: string } | null
  company: { id: number; name: string; slug: string } | null
}

interface DailyPoint {
  day: string
  activeCompanies: number
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtShortDay(iso: string) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

function truncate(s: string | null, max = 48) {
  if (!s) return '—'
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

export default function AdminActivityPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chartDays, setChartDays] = useState(30)
  const [logDays, setLogDays] = useState(30)
  const [series, setSeries] = useState<DailyPoint[]>([])
  const [logins, setLogins] = useState<LoginEvent[]>([])

  const checkAuth = useCallback(() => {
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
    } catch {
      router.push('/admin')
      return false
    }
  }, [router])

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const [chartRes, loginsRes] = await Promise.all([
        fetch(apiUrl(`/admin/activity/daily-companies?days=${chartDays}`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl(`/admin/activity/logins?days=${logDays}&limit=200`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      const chartData = await chartRes.json()
      const loginsData = await loginsRes.json()

      if (!chartRes.ok) throw new Error(chartData.error || 'Failed to load chart')
      if (!loginsRes.ok) throw new Error(loginsData.error || 'Failed to load logins')

      setSeries(chartData.series || [])
      setLogins(loginsData.logins || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [chartDays, logDays])

  useEffect(() => {
    if (checkAuth()) {
      setIsAuthenticated(true)
      void fetchActivity()
    }
  }, [checkAuth, fetchActivity])

  const totalActiveDays = series.filter((d) => d.activeCompanies > 0).length
  const peak = series.reduce((best, d) => (d.activeCompanies > best ? d.activeCompanies : best), 0)
  const todayKey = new Date().toISOString().slice(0, 10)
  const todayCount = series.find((d) => d.day === todayKey)?.activeCompanies ?? 0

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="mt-2 text-gray-600">Verifying admin access…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">V</span>
              </div>
              <span className="text-xl font-bold text-gray-900">PathPilo Admin</span>
            </Link>
            <div className="flex items-center space-x-4">
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
              <Link href="/admin/coupons" className="text-gray-600 hover:text-gray-900">
                Coupons
              </Link>
              <Link href="/admin/activity" className="text-blue-600 hover:text-blue-700 font-medium">
                Activity
              </Link>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('token')
                  localStorage.removeItem('user')
                  router.push('/admin')
                }}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Activity</h1>
          <p className="text-gray-600">
            Session starts (logins) and daily active companies — each company counts once per day.
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {error}
            <button
              type="button"
              onClick={() => void fetchActivity()}
              className="ml-4 text-sm underline"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <p className="mt-2 text-gray-600">Loading activity…</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <p className="text-sm font-medium text-gray-500">Active today</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{todayCount}</p>
                <p className="text-xs text-gray-400 mt-1">companies with a login</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <p className="text-sm font-medium text-gray-500">Peak (period)</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{peak}</p>
                <p className="text-xs text-gray-400 mt-1">companies in one day</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <p className="text-sm font-medium text-gray-500">Days with activity</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalActiveDays}</p>
                <p className="text-xs text-gray-400 mt-1">of last {chartDays} days</p>
              </div>
            </div>

            {/* Daily active companies chart */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Daily active companies</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Unique companies with at least one login per day
                  </p>
                </div>
                <select
                  value={chartDays}
                  onChange={(e) => setChartDays(Number(e.target.value))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700"
                >
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              </div>

              {series.length === 0 || series.every((d) => d.activeCompanies === 0) ? (
                <div className="h-64 flex items-center justify-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg">
                  No login activity recorded yet. Data appears when users sign in after this feature was enabled.
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="day"
                        tickFormatter={fmtShortDay}
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        interval={chartDays <= 14 ? 0 : chartDays <= 30 ? 2 : 6}
                        tickMargin={8}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        width={32}
                      />
                      <Tooltip
                        labelFormatter={(day) =>
                          new Date(String(day) + 'T12:00:00Z').toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        }
                        formatter={(value: number) => [value, 'Active companies']}
                      />
                      <Bar dataKey="activeCompanies" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Login log */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Session log</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Recent sign-ins (session starts)</p>
                </div>
                <select
                  value={logDays}
                  onChange={(e) => setLogDays(Number(e.target.value))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              </div>

              {logins.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-gray-500">
                  No logins recorded yet. Users will appear here after they sign in.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          When
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Company
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          IP
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {logins.map((ev) => (
                        <tr key={ev.id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">
                            {fmtDateTime(ev.createdAt)}
                          </td>
                          <td className="px-6 py-3 text-sm">
                            {ev.user ? (
                              <div>
                                <p className="font-medium text-gray-900">
                                  {ev.user.firstName} {ev.user.lastName}
                                </p>
                                <p className="text-xs text-gray-500">{ev.user.email}</p>
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-700">
                            {ev.company ? (
                              <Link
                                href={`/admin/companies/${ev.company.id}`}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                {ev.company.name}
                              </Link>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-500 font-mono text-xs">
                            {truncate(ev.ip, 24)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
