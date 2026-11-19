'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '@/app/utils/api'
import { formatMoney } from '@/app/config/countryRules'
import { useUser } from '@/app/hooks/useUser'
import type { BucketUnit } from './period'

export interface RangeInfo {
  from: string
  to: string
  today: string
  unit: BucketUnit
}

export interface EarnedPoint {
  bucket: string
  earned: number
  jobs: number
  lastYear: number
}

export interface EarnedBlock {
  total: number
  jobs: number
  lastYearTotal: number
  averageJob: number
  series: EarnedPoint[]
}

export interface JobsPoint {
  bucket: string
  done: number
  open: number
  planned: number
  cancelled: number
  booked: number
}

export interface JobsBlock {
  done: number
  open: number
  planned: number
  cancelled: number
  booked: number
  series: JobsPoint[]
}

export interface ClientsPoint {
  bucket: string
  added: number
  total: number
}

export interface ClientsBlock {
  total: number
  companies: number
  added: number
  series: ClientsPoint[]
}

export interface SubscriptionsPoint {
  bucket: string
  value: number
  active: number
}

export interface SubscriptionsBlock {
  monthlyValue: number
  active: number
  paused: number
  series: SubscriptionsPoint[]
}

export interface SalesPoint {
  bucket: string
  leads: number
  sent: number
  accepted: number
  acceptedValue: number
}

export interface SalesBlock {
  leadsEnabled: boolean
  everUsed: boolean
  leads: number
  sent: number
  accepted: number
  acceptedValue: number
  series: SalesPoint[]
}

export interface Attention {
  offersToVerify: { count: number; firstId: number | null }
  newLeads: { count: number; firstId: number | null }
  quietOffers: { count: number }
  overdueInvoices: { count: number; total: number; firstId: number | null }
  notMarkedDone: { jobs: number; total: number }
  notInvoiced: { jobs: number; total: number }
  timeOffRequests: { count: number; firstDate: string | null }
}

export interface TodayBlock {
  date: string
  jobs: number
  done: number
  people: number
  next: { date: string; jobs: number } | null
  nextWeek: number
}

export interface TeamMember {
  userId: number
  name: string
  done: number
  open: number
  earned: number
}

export interface DashboardData {
  range: RangeInfo
  earned: EarnedBlock
  jobs: JobsBlock
  clients: ClientsBlock
  subscriptions: SubscriptionsBlock
  sales: SalesBlock
  attention: Attention
  today: TodayBlock
  team: { size: number; members: TeamMember[] }
  setup: { services: number; jobs: number }
}

export interface EarningsData {
  range: RangeInfo
  earned: EarnedBlock
  funnel: { earned: number; invoiced: number; paid: number }
  origin: {
    oneOffJobs: number
    subscriptionJobs: number
    oneOffValue: number
    subscriptionValue: number
    feeValue: number
    cancelledJobs: number
  }
  services: Array<{ title: string; times: number; total: number; average: number }>
  notInvoiced: {
    total: number
    jobs: number
    clients: number
    byClient: Array<{ clientId: number; name: string; jobs: number; total: number; oldest: string | null }>
  }
  unpaid: {
    total: number
    invoices: number
    overdue: number
    overdueTotal: number
    list: Array<{
      id: number
      number: string | null
      client: string
      dueDate: string | null
      remaining: number
      overdue: boolean
    }>
  }
}

export interface JobsData extends JobsBlock {
  range: RangeInfo
  stillOpen: {
    jobs: number
    total: number
    list: Array<{ id: number; date: string; title: string; client: string; employee: string; value: number }>
  }
  weekdays: Array<{ dow: number; jobs: number }>
  fees: { jobs: number; value: number }
  team: TeamMember[]
}

export interface AheadData {
  range: { from: string; to: string; months: number }
  booked: { jobs: number; total: number }
  projected: { jobs: number; total: number }
  subscriptionsPerMonth: number
  byMonth: Array<{
    month: string
    bookedJobs: number
    bookedValue: number
    projectedJobs: number
    projectedValue: number
  }>
}

export interface ClientsData extends ClientsBlock {
  range: RangeInfo
  withSubscription: number
  activeLastYear: number
  topClients: Array<{ id: number; name: string; clientType: string; earned: number; jobs: number }>
  goneQuiet: {
    count: number
    list: Array<{ id: number; name: string; lastJob: string | null; jobs: number; lifetime: number }>
  }
  newest: Array<{ id: number; name: string; clientType: string; added: string }>
  places: Array<{ city: string; clients: number }>
}

export interface SubscriptionRow {
  id: number
  clientId: number | null
  name: string
  title: string
  frequency: string
  perVisit: number
  perMonth: number
  since: string | null
  pausedAt: string | null
}

export interface SubscriptionsData {
  range: RangeInfo
  monthlyValue: number
  active: number
  paused: number
  started: number
  ended: number
  visitsPerMonth: number
  averagePerMonth: number
  series: SubscriptionsPoint[]
  mix: Array<{ label: string; count: number; perMonth: number }>
  list: SubscriptionRow[]
  pausedList: SubscriptionRow[]
}

export interface SalesData extends SalesBlock {
  range: RangeInfo
  cohort: {
    sent: number
    accepted: number
    declined: number
    expired: number
    open: number
    winRate: number | null
    averageOffer: number
  }
  medianAnswerHours: number | null
  sources: Array<{ source: string; leads: number }>
  toVerify: Array<{ id: number; name: string; date: string | null; at: string | null; value: number }>
  newLeads: Array<{ id: number; name: string; source: string; at: string }>
  waiting: Array<{ id: number; name: string; sentAt: string | null; viewed: boolean; expired: boolean; value: number }>
  lost: Array<{ id: number; name: string; at: string; reason: string; value: number }>
}

/**
 * Loads one insights endpoint and reloads whenever its parameters change.
 * The previous numbers stay on screen while the next ones load.
 */
export function useInsights<T>(
  path: string,
  params: Record<string, string | number> = {},
  enabled = true
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl(`${path}${query ? `?${query}` : ''}`), {
          headers: { Authorization: `Bearer ${token || ''}` },
          signal,
        })
        const payload = await res.json()
        if (!res.ok) throw new Error(payload.error || 'Could not load these numbers')
        setData(payload as T)
        setError(null)
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return
        setError(e instanceof Error ? e.message : 'Could not load these numbers')
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [path, query]
  )

  useEffect(() => {
    if (!enabled) return
    const ctrl = new AbortController()
    setLoading(true)
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load, enabled])

  return { data, loading, error, reload: () => load() }
}

/** The company's country drives every currency format on these screens. */
export function useMoneyFormatter() {
  const { user } = useUser()
  const [countryCode, setCountryCode] = useState('DK')

  useEffect(() => {
    const code = (user?.activeCompany as { countryCode?: string } | null)?.countryCode
    if (code) setCountryCode(String(code))
  }, [user])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(apiUrl('/companies/profile'), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.company?.countryCode) setCountryCode(String(d.company.countryCode))
      })
      .catch(() => {
        /* keep whatever the session already told us */
      })
  }, [])

  return useCallback((amount: number) => formatMoney(amount, countryCode), [countryCode])
}
