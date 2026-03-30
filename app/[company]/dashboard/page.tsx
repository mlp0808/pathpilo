'use client'

import { useState, useEffect, useMemo, useLayoutEffect, useCallback } from 'react'
import AppLayout from '../../components/AppLayout'
import { useUser } from '../../hooks/useUser'
import { apiUrl } from '@/app/utils/api'
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircleIcon, ClockIcon, CurrencyDollarIcon, UserGroupIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline'
import { getLocalTimeZone, today, startOfMonth, endOfMonth, CalendarDate, parseDate } from '@internationalized/date'
import { DashboardDateRangePicker } from '../../components/date-picker/dashboard-date-range-picker'
import { formatMoney } from '../../config/countryRules'
import { markSetupWizardComplete } from '@/app/utils/sessionClient'

interface DashboardStats {
  completedJobs: number
  upcomingJobs: number
  totalRevenue: number
  upcomingRevenue: number
  totalHours: number
  upcomingHours: number
  activeClients: number
  activeSubscriptions: number
}

interface EmployeeStats {
  userId: number
  firstName: string
  lastName: string
  completedJobs: number
  completedRevenue: number
  upcomingJobs: number
  upcomingRevenue: number
  totalHours: number
}

type ChartGranularity = 'day' | 'week' | 'month'

interface ChartBucketData {
  key: string
  label: string
  completed: number
  scheduled: number
  cancelled: number
  revenue: number
  projectedRevenue: number
}

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats[]>([])
  const [chartJobs, setChartJobs] = useState<any[]>([])
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>('week')

  // Date range state - default to last month
  const now = today(getLocalTimeZone())
  const lastMonthStart = startOfMonth(now.subtract({ months: 1 }))
  const lastMonthEnd = endOfMonth(now.subtract({ months: 1 }))
  const [dateRange, setDateRange] = useState<{ start: CalendarDate; end: CalendarDate } | null>({
    start: lastMonthStart,
    end: lastMonthEnd
  })

  /** Company country → currency + Intl locale (see `countryRules` / `formatMoney`) */
  const [companyCountryCode, setCompanyCountryCode] = useState('DK')

  useLayoutEffect(() => {
    try {
      const rawCompany = localStorage.getItem('company')
      if (rawCompany) {
        const c = JSON.parse(rawCompany)
        if (c?.countryCode) {
          setCompanyCountryCode(String(c.countryCode))
          return
        }
      }
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      const code =
        u.activeCompany?.countryCode ||
        (Array.isArray(u.companies)
          ? u.companies.find((co: { id?: number }) => co?.id === u.companyId)?.countryCode
          : undefined)
      if (code) setCompanyCountryCode(String(code))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    markSetupWizardComplete()
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl('/companies/profile'), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        const code = data.company?.countryCode || 'DK'
        setCompanyCountryCode(String(code))
      } catch {
        /* keep cached value */
      }
    }
    load()
  }, [])

  useEffect(() => {
    const c = user?.activeCompany?.countryCode
    if (c) setCompanyCountryCode(String(c))
  }, [user])

  const formatPrice = useCallback(
    (price: number) => formatMoney(price, companyCountryCode),
    [companyCountryCode]
  )

  // Format duration
  const formatDuration = (minutes: number) => {
    if (!minutes) return '0h'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`
    }
    return `${mins}m`
  }

  // Convert CalendarDate to ISO string
  const dateToISO = (date: CalendarDate) => {
    return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
  }

  // ISO day of week 1=Monday .. 7=Sunday (CalendarDate has no dayOfWeek)
  const getISODayOfWeek = (date: CalendarDate) => {
    const d = new Date(date.year, date.month - 1, date.day).getDay()
    return d === 0 ? 7 : d
  }

  // Monday of the week containing date
  const getMonday = (date: CalendarDate) => date.subtract({ days: getISODayOfWeek(date) - 1 })

  // Build chart buckets from selected date range and granularity (day / week / month)
  const chartData = useMemo((): ChartBucketData[] => {
    if (!dateRange) return []
    const num = (v: any) => (v != null && v !== '' ? parseFloat(String(v)) : 0) || 0
    const buckets: ChartBucketData[] = []
    const rangeStart = dateRange.start
    const rangeEnd = dateRange.end

    if (chartGranularity === 'day') {
      let d = rangeStart
      while (d.compare(rangeEnd) <= 0) {
        const key = dateToISO(d)
        buckets.push({ key, label: key, completed: 0, scheduled: 0, cancelled: 0, revenue: 0, projectedRevenue: 0 })
        d = d.add({ days: 1 })
      }
    } else if (chartGranularity === 'week') {
      let weekStart = getMonday(rangeStart)
      while (weekStart.compare(rangeEnd) <= 0) {
        const key = dateToISO(weekStart)
        buckets.push({ key, label: key, completed: 0, scheduled: 0, cancelled: 0, revenue: 0, projectedRevenue: 0 })
        weekStart = weekStart.add({ weeks: 1 })
      }
    } else {
      let monthStart = startOfMonth(rangeStart)
      while (monthStart.compare(rangeEnd) <= 0) {
        const key = dateToISO(monthStart)
        const label = `${monthStart.year}-${String(monthStart.month).padStart(2, '0')}`
        buckets.push({ key, label, completed: 0, scheduled: 0, cancelled: 0, revenue: 0, projectedRevenue: 0 })
        monthStart = startOfMonth(monthStart.add({ months: 1 }))
      }
    }

    const map = new Map(buckets.map((b) => [b.key, b]))
    chartJobs.forEach((job: any) => {
      if (!job.scheduled_date) return
      try {
        const jobDate = parseDate(job.scheduled_date)
        let bucketKey: string
        if (chartGranularity === 'day') {
          bucketKey = dateToISO(jobDate)
        } else if (chartGranularity === 'week') {
          const weekStart = getMonday(jobDate)
          bucketKey = dateToISO(weekStart)
        } else {
          bucketKey = dateToISO(startOfMonth(jobDate))
        }
        const bucket = map.get(bucketKey)
        if (!bucket) return
        if (job.status === 'completed') {
          bucket.completed++
          bucket.revenue += num(job.total_price)
        } else if (job.status === 'cancelled') {
          bucket.cancelled++
        } else if (job.status === 'scheduled' || job.is_projected === true) {
          bucket.scheduled++
          bucket.projectedRevenue += num(job.total_price)
        }
      } catch (e) {
        // skip invalid dates
      }
    })
    return buckets
  }, [dateRange, chartGranularity, chartJobs])

  // Fetch dashboard data
  useEffect(() => {
    if (userLoading || !user || !dateRange) return

    const fetchDashboardData = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('token')
        if (!token) return

        const start = dateToISO(dateRange.start)
        const end = dateToISO(dateRange.end)

        // Fetch all jobs in the selected date range (used for chart + all metric boxes)
        const chartRes = await fetch(apiUrl(`/jobs?start_date=${start}&end_date=${end}`), {
          headers: { Authorization: `Bearer ${token}` }
        })
        const chartJobsPayload = await chartRes.json()
        const allJobs = chartJobsPayload.jobs || []

        // Derive in-range completed and scheduled (upcoming) from the same dataset
        const completedInRange = allJobs.filter((j: any) => j.status === 'completed')
        const upcomingInRange = allJobs.filter((j: any) =>
          j.status === 'scheduled' || j.is_projected === true
        )

        // Fetch users for employee stats
        const usersRes = await fetch(apiUrl('/users'), {
          headers: { Authorization: `Bearer ${token}` }
        })
        const usersData = await usersRes.json()
        const users = usersData.users || []

        // Fetch subscriptions (for "active subscriptions" count – kept as current global count)
        const subsRes = await fetch(apiUrl('/subscriptions'), {
          headers: { Authorization: `Bearer ${token}` }
        })
        const subsData = await subsRes.json()
        const subscriptions = subsData.subscriptions || []

        // Stats: all scoped to the selected date range
        const num = (v: any) => (v != null && v !== '' ? parseFloat(String(v)) : 0) || 0
        const int = (v: any) => (v != null && v !== '' ? parseInt(String(v), 10) : 0) || 0
        const completedRevenue = completedInRange.reduce((sum: number, j: any) => sum + num(j.total_price), 0)
        const completedHours = completedInRange.reduce((sum: number, j: any) => sum + int(j.total_duration), 0)
        const upcomingRevenue = upcomingInRange.reduce((sum: number, j: any) => sum + num(j.total_price), 0)
        const upcomingHours = upcomingInRange.reduce((sum: number, j: any) => sum + int(j.total_duration), 0)
        // Active clients = distinct clients with at least one job in the selected range
        const clientIdsInRange = new Set(
          allJobs.map((j: any) => j.client_id).filter((id: any) => id != null)
        )

        setStats({
          completedJobs: completedInRange.length,
          upcomingJobs: upcomingInRange.length,
          totalRevenue: completedRevenue,
          upcomingRevenue: upcomingRevenue,
          totalHours: completedHours,
          upcomingHours: upcomingHours,
          activeClients: clientIdsInRange.size,
          activeSubscriptions: subscriptions.filter((s: any) => s.is_active).length
        })

        // Employee stats: scoped to jobs in the selected date range
        const empStats: EmployeeStats[] = users.map((u: any) => {
          const empCompleted = completedInRange.filter((j: any) => j.assigned_user_id === u.id)
          const empUpcoming = upcomingInRange.filter((j: any) => j.assigned_user_id === u.id)
          return {
            userId: u.id,
            firstName: u.first_name,
            lastName: u.last_name,
            completedJobs: empCompleted.length,
            completedRevenue: empCompleted.reduce((sum: number, j: any) => sum + num(j.total_price), 0),
            upcomingJobs: empUpcoming.length,
            upcomingRevenue: empUpcoming.reduce((sum: number, j: any) => sum + num(j.total_price), 0),
            totalHours: empCompleted.reduce((sum: number, j: any) => sum + int(j.total_duration), 0)
          }
        }).filter((e: EmployeeStats) => e.completedJobs > 0 || e.upcomingJobs > 0)
          .sort((a: EmployeeStats, b: EmployeeStats) => b.completedRevenue - a.completedRevenue)

        setEmployeeStats(empStats)
        setChartJobs(allJobs)

      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [user, userLoading, dateRange])

  // Chart tooltip formatter (turnover in company currency)
  const chartTooltipFormatter = (value: any) => formatPrice(Number(value))

  // Select evenly spaced items for X-axis
  const selectEvenlySpacedItems = (data: ChartBucketData[], count: number) => {
    if (data.length <= count) return data
    const step = Math.floor(data.length / count)
    const result = []
    for (let i = 0; i < data.length; i += step) {
      result.push(data[i])
    }
    if (result.length < count && data.length > 0) {
      result.push(data[data.length - 1])
    }
    return result
  }

  const formatChartTick = (key: string) => {
    try {
      const date = parseDate(key)
      if (chartGranularity === 'month') {
        return date.toDate('UTC').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      }
      return date.toDate('UTC').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch {
      return key
    }
  }

  if (userLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent"></div>
            <p className="mt-2 text-sm text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!user) {
    return null
  }

  return (
    <AppLayout>
      <div className="space-y-8 p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">Overview of your business performance</p>
          </div>
          <DashboardDateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Completed Jobs */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl border border-green-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center shadow-sm">
                  <CheckCircleIcon className="w-7 h-7 text-white" />
                </div>
                <ArrowTrendingUpIcon className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{stats.completedJobs}</div>
              <div className="text-sm font-medium text-gray-700 mb-1">Completed jobs</div>
              <div className="text-xs text-gray-600 mt-2">{formatDuration(stats.totalHours)} worked</div>
            </div>

            {/* Upcoming Jobs */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl border border-blue-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shadow-sm">
                  <ClockIcon className="w-7 h-7 text-white" />
                </div>
                <ArrowTrendingUpIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{stats.upcomingJobs}</div>
              <div className="text-sm font-medium text-gray-700 mb-1">Upcoming jobs</div>
              <div className="text-xs text-gray-600 mt-2">{formatDuration(stats.upcomingHours)} scheduled</div>
            </div>

            {/* Revenue */}
            <div className="bg-gradient-to-br from-accent-50 to-green-50 rounded-2xl border border-accent-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-accent-500 rounded-xl flex items-center justify-center shadow-sm">
                  <CurrencyDollarIcon className="w-7 h-7 text-white" />
                </div>
                <ArrowTrendingUpIcon className="w-5 h-5 text-accent-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{formatPrice(stats.totalRevenue)}</div>
              <div className="text-sm font-medium text-gray-700 mb-1">Completed revenue</div>
              <div className="text-xs text-accent-600 mt-2 font-semibold">{formatPrice(stats.upcomingRevenue)} upcoming</div>
            </div>

            {/* Active Clients */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl border border-purple-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center shadow-sm">
                  <UserGroupIcon className="w-7 h-7 text-white" />
                </div>
                <ArrowTrendingUpIcon className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{stats.activeClients}</div>
              <div className="text-sm font-medium text-gray-700 mb-1">Active clients</div>
              <div className="text-xs text-gray-600 mt-2">{stats.activeSubscriptions} subscriptions</div>
            </div>
          </div>
        )}

        {/* Jobs by status: full-width stacked bar chart — follows date range; Day / Week / Month */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm w-full">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Turnover by period</h3>
              <p className="text-sm text-gray-600">Green = completed revenue, blue = scheduled revenue</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Group by:</span>
              {(['day', 'week', 'month'] as const).map((gran) => (
                <button
                  key={gran}
                  onClick={() => setChartGranularity(gran)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg capitalize transition-colors ${
                    chartGranularity === gran ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {gran}
                </button>
              ))}
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ left: 4, right: 8, top: 12, bottom: 18 }}
                barCategoryGap="8%"
              >
                <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis
                  dataKey="key"
                  tickFormatter={formatChartTick}
                  ticks={chartData.length > 12 ? selectEvenlySpacedItems(chartData, 12).map((d) => d.key) : chartData.map((d) => d.key)}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickFormatter={(value) => formatPrice(Number(value))}
                  width={72}
                />
                <Tooltip
                  formatter={chartTooltipFormatter}
                  labelFormatter={(value) => {
                    try {
                      const date = parseDate(value)
                      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    } catch {
                      return value
                    }
                  }}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar dataKey="revenue" name="Completed turnover" fill="#10b981" stackId="turnover" radius={[0, 0, 0, 0]} maxBarSize={64} />
                <Bar dataKey="projectedRevenue" name="Scheduled turnover" fill="#3b82f6" stackId="turnover" radius={[6, 6, 0, 0]} maxBarSize={64} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Employee Performance Table */}
        {employeeStats.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
              <h3 className="text-xl font-bold text-gray-900 mb-1">Team Performance</h3>
              <p className="text-sm text-gray-600">Revenue and job statistics by employee</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Completed Jobs</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Completed Revenue</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Upcoming Jobs</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Upcoming Revenue</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Hours Worked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {employeeStats.map((emp, index) => (
                    <tr key={emp.userId} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gradient-to-br from-accent-400 to-accent-600 rounded-full flex items-center justify-center mr-3 shadow-sm">
                            <span className="text-sm font-bold text-white">
                              {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {emp.firstName} {emp.lastName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        {emp.completedJobs}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                        {formatPrice(emp.completedRevenue)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                        {emp.upcomingJobs}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                        {formatPrice(emp.upcomingRevenue)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                        {formatDuration(emp.totalHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
