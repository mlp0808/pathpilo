'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'
import AdminNav from '../components/AdminNav'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface HeatmapRow {
  userId: number
  name: string
  email: string
  company: string | null
  companySlug: string | null
  activeDays: number[]
  loginCount: number
  lastSeen: string
}

interface HeatmapData {
  year: number
  month: number
  daysInMonth: number
  totalEventsInPeriod: number
  rows: HeatmapRow[]
}

interface TooltipState {
  row: HeatmapRow
  x: number
  y: number
}

function ActivityHeatmap({ token }: { token: string }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl(`/admin/activity/monthly-logins?year=${y}&month=${m}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load(year, month) }, [load, year, month])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    const n = new Date(); const cy = n.getFullYear(); const cm = n.getMonth() + 1
    if (year > cy || (year === cy && month >= cm)) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const today = now.getDate()

  const days = data ? Array.from({ length: data.daysInMonth }, (_, i) => i + 1) : []

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">Login Activity</h2>
          <p className="text-xs text-gray-400 mt-0.5">Top 20 most active users · green = logged in that day</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-700 w-36 text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">
          No login activity recorded for this month
          {data && data.totalEventsInPeriod > 0 ? ` (${data.totalEventsInPeriod} events found but none linked to a user account)` : ''}
          .
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 180 }} />
              {days.map(d => <col key={d} style={{ width: 30 }} />)}
            </colgroup>
            <thead>
              <tr className="bg-gray-50/70">
                <th className="sticky left-0 z-10 bg-gray-50/90 backdrop-blur-sm text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  User
                </th>
                {days.map(d => (
                  <th
                    key={d}
                    className={`py-2.5 text-center font-semibold border-b border-gray-100 ${
                      isCurrentMonth && d === today
                        ? 'text-emerald-600 bg-emerald-50/60'
                        : 'text-gray-400'
                    }`}
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.map((row) => {
                const activeSet = new Set(row.activeDays)
                return (
                  <tr
                    key={row.userId}
                    className="hover:bg-gray-50/50 transition-colors group"
                    onMouseEnter={(e) => setTooltip({ row, x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {/* Name cell */}
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50/50 px-4 py-2 backdrop-blur-sm border-r border-gray-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                          {row.name[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 truncate leading-tight">{row.name}</p>
                          {row.company && (
                            <p className="text-[10px] text-gray-400 truncate leading-tight">{row.company}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Day cells */}
                    {days.map(d => {
                      const active = activeSet.has(d)
                      const isToday = isCurrentMonth && d === today
                      return (
                        <td
                          key={d}
                          className={`p-0.5 text-center ${isToday ? 'bg-emerald-50/40' : ''}`}
                        >
                          {active && (
                            <div className="mx-auto w-5 h-5 rounded bg-emerald-500 shadow-sm shadow-emerald-200" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="bg-gray-900 text-white rounded-xl px-3.5 py-3 shadow-2xl text-xs min-w-[180px]">
            <p className="font-bold text-sm leading-snug">{tooltip.row.name}</p>
            {tooltip.row.email && (
              <p className="text-gray-400 mt-0.5 truncate">{tooltip.row.email}</p>
            )}
            {tooltip.row.company && (
              <p className="text-emerald-400 font-medium mt-1.5">{tooltip.row.company}</p>
            )}
            <div className="mt-2 pt-2 border-t border-gray-700 flex items-center gap-3">
              <span className="text-gray-300">
                <span className="font-bold text-white">{tooltip.row.loginCount}</span> active days
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminOverviewPage() {
  const router = useRouter()
  const [stats, setStats] = useState({ totalUsers: 0, totalCompanies: 0, usersWithCompanies: 0, usersWithoutCompanies: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('token')
    const userData = localStorage.getItem('user')
    if (!t || !userData) { router.push('/admin'); return }
    try {
      const user = JSON.parse(userData)
      if (user.role !== 'admin') { router.push('/admin'); return }
      setToken(t)
      setIsAuthenticated(true)
      fetchStats(t)
    } catch {
      router.push('/admin')
    }
  }, [router])

  const fetchStats = async (t: string) => {
    try {
      setLoading(true)
      const [ur, cr] = await Promise.all([
        fetch(apiUrl('/admin/users'), { headers: { Authorization: `Bearer ${t}` } }),
        fetch(apiUrl('/admin/companies'), { headers: { Authorization: `Bearer ${t}` } }),
      ])
      const [ud, cd] = await Promise.all([ur.json(), cr.json()])
      if (ur.ok && cr.ok) {
        const withCo = ud.users.filter((u: { companies?: unknown[] }) => u.companies && (u.companies as unknown[]).length > 0).length
        setStats({ totalUsers: ud.users.length, totalCompanies: cd.companies.length, usersWithCompanies: withCo, usersWithoutCompanies: ud.users.length - withCo })
      } else {
        setError('Failed to fetch statistics')
      }
    } catch (err) {
      setError('Network error: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AdminNav />

      <main className="max-w-screen-2xl mx-auto px-6 py-8 w-full flex flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="text-sm text-gray-500 mt-1">System stats and user login activity</p>
        </div>

        {/* Stats */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Users', value: stats.totalUsers, color: 'bg-blue-50 text-blue-700' },
              { label: 'Total Companies', value: stats.totalCompanies, color: 'bg-emerald-50 text-emerald-700' },
              { label: 'Users with Companies', value: stats.usersWithCompanies, color: 'bg-purple-50 text-purple-700' },
              { label: 'Users without Companies', value: stats.usersWithoutCompanies, color: 'bg-amber-50 text-amber-700' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{s.label}</p>
                <p className={`text-3xl font-bold mt-2 ${s.color.split(' ')[1]}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Activity heatmap */}
        {token && <ActivityHeatmap token={token} />}
      </main>
    </div>
  )
}
