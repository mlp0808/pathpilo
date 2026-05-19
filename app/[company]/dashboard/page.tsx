'use client'

import { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import AppLayout from '../../components/AppLayout'
import { useUser } from '../../hooks/useUser'
import { apiUrl } from '@/app/utils/api'
import { formatMoney } from '../../config/countryRules'
import dynamic from 'next/dynamic'
import { markSetupWizardComplete } from '@/app/utils/sessionClient'
import type { DashboardTimelineRange } from '../../components/dashboard/JobsTimelineChart'
import DashboardTeamPerformance, {
  type EmployeeStatsRow,
} from '../../components/dashboard/DashboardTeamPerformance'

const JobsTimelineChart = dynamic(
  () => import('../../components/dashboard/JobsTimelineChart'),
  {
    ssr: false,
    loading: () => (
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm w-full min-h-[360px] sm:min-h-[420px] flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent" />
      </div>
    ),
  },
)

function parseISODateLocal(s: string): Date | null {
  const part = s.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return null
  return new Date(y, mo, day)
}

function stripTime(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isScheduledOrProjected(job: { status: string; is_projected?: boolean | null }) {
  if (job.status === 'cancelled' || job.status === 'completed') return false
  return job.status === 'scheduled' || job.status === 'in-progress' || job.is_projected === true
}

function formatRangeLabel(startDate: string, endDate: string) {
  const start = parseISODateLocal(startDate)
  const end = parseISODateLocal(endDate)
  if (!start || !end) return `${startDate} – ${endDate}`
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const yOpt: Intl.DateTimeFormatOptions = { ...opts, year: 'numeric' }
  if (start.getFullYear() === end.getFullYear()) {
    if (start.getMonth() === end.getMonth() && start.getDate() === end.getDate()) {
      return start.toLocaleDateString('en-US', yOpt)
    }
    return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', yOpt)}`
  }
  return `${start.toLocaleDateString('en-US', yOpt)} – ${end.toLocaleDateString('en-US', yOpt)}`
}

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser()
  const [timelineRange, setTimelineRange] = useState<DashboardTimelineRange | null>(null)
  const [employeeStats, setEmployeeStats] = useState<EmployeeStatsRow[]>([])
  const [teamLoading, setTeamLoading] = useState(false)

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
        /* keep cached */
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
    [companyCountryCode],
  )

  const formatDuration = (minutes: number) => {
    if (!minutes) return '0h'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`
    }
    return `${mins}m`
  }

  const handleTimelineRangeChange = useCallback((range: DashboardTimelineRange) => {
    setTimelineRange(range)
  }, [])

  useEffect(() => {
    if (userLoading || !user || !timelineRange) return

    const ctrl = new AbortController()

    const fetchTeamStats = async () => {
      try {
        setTeamLoading(true)
        const token = localStorage.getItem('token')
        if (!token) return

        const { startDate, endDate } = timelineRange

        const [jobsRes, usersRes] = await Promise.all([
          fetch(apiUrl(`/jobs?start_date=${startDate}&end_date=${endDate}`), {
            headers: { Authorization: `Bearer ${token}` },
            signal: ctrl.signal,
          }),
          fetch(apiUrl('/users'), {
            headers: { Authorization: `Bearer ${token}` },
            signal: ctrl.signal,
          }),
        ])

        if (!jobsRes.ok || !usersRes.ok) return

        const jobsPayload = await jobsRes.json()
        const usersPayload = await usersRes.json()
        const allJobs: Array<{
          status: string
          scheduled_date: string | null
          is_projected?: boolean | null
          assigned_user_id?: number | null
          total_price?: number | string | null
          total_duration?: number | string | null
        }> = jobsPayload.jobs || []
        const users: Array<{ id: number; first_name: string; last_name: string }> =
          usersPayload.users || []

        const rangeStart = stripTime(parseISODateLocal(startDate)!)
        const rangeEnd = stripTime(parseISODateLocal(endDate)!)
        const today = stripTime(new Date())

        const parseNum = (v: unknown) => (v != null && v !== '' ? parseFloat(String(v)) : 0) || 0
        const parseIntVal = (v: unknown) => (v != null && v !== '' ? parseInt(String(v), 10) : 0) || 0

        const completedInRange: typeof allJobs = []
        const upcomingInRange: typeof allJobs = []

        for (const job of allJobs) {
          if (!job.scheduled_date) continue
          const jd = parseISODateLocal(job.scheduled_date)
          if (!jd) continue
          const jd0 = stripTime(jd)
          if (jd0 < rangeStart || jd0 > rangeEnd) continue

          if (job.status === 'completed') {
            completedInRange.push(job)
          }
          if (isScheduledOrProjected(job)) {
            // Match chart: in the current calendar year, only count future scheduled jobs.
            if (jd0.getFullYear() === today.getFullYear() && jd0.getTime() <= today.getTime()) {
              continue
            }
            upcomingInRange.push(job)
          }
        }

        const empStats: EmployeeStatsRow[] = users
          .map((u) => {
            const empCompleted = completedInRange.filter((j) => j.assigned_user_id === u.id)
            const empUpcoming = upcomingInRange.filter((j) => j.assigned_user_id === u.id)
            return {
              userId: u.id,
              firstName: u.first_name,
              lastName: u.last_name,
              completedJobs: empCompleted.length,
              completedRevenue: empCompleted.reduce((sum, j) => sum + parseNum(j.total_price), 0),
              upcomingJobs: empUpcoming.length,
              upcomingRevenue: empUpcoming.reduce((sum, j) => sum + parseNum(j.total_price), 0),
              totalHours: empCompleted.reduce((sum, j) => sum + parseIntVal(j.total_duration), 0),
            }
          })
          .filter((e) => e.completedJobs > 0 || e.upcomingJobs > 0)
          .sort((a, b) => b.completedRevenue - a.completedRevenue)

        setEmployeeStats(empStats)
      } catch (e) {
        if ((e as { name?: string }).name !== 'AbortError') {
          console.error('Dashboard team stats fetch failed', e)
        }
      } finally {
        setTeamLoading(false)
      }
    }

    void fetchTeamStats()
    return () => ctrl.abort()
  }, [user, userLoading, timelineRange])

  const rangeLabel = timelineRange
    ? formatRangeLabel(timelineRange.startDate, timelineRange.endDate)
    : 'selected period'

  if (userLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent" />
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
      <div className="space-y-6 sm:space-y-8 p-0 sm:p-4 lg:p-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">
            Use the timeline to choose your date range. Team stats below follow the same period.
          </p>
        </div>

        <JobsTimelineChart onRangeChange={handleTimelineRangeChange} />

        <DashboardTeamPerformance
          employees={employeeStats}
          loading={teamLoading || !timelineRange}
          formatPrice={formatPrice}
          formatDuration={formatDuration}
          rangeLabel={rangeLabel}
        />
      </div>
    </AppLayout>
  )
}
