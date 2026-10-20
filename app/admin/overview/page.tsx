'use client'

import { useState } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAdminData } from '../_lib/api'
import { eventCategory, eventLabel } from '../_lib/events'
import HeatGrid from '../_components/HeatGrid'
import { Card, Chip, Empty, ErrorBox, Kpi, PageHeader, Segmented, Spinner, formatDate, pct } from '../_components/ui'

interface Overview {
  days: number
  trackingEnabled: boolean
  kpis: {
    accountsTotal: number
    companiesTotal: number
    accountsNew: number
    signupsStarted: number
    activeUsers1d: number
    activeUsers7d: number
    activeUsers30d: number
    workingCompanies7d: number
    sessions: number
    actions: number
    retention: { cohort: number; returned: number; rate: number | null; definition: string }
  }
  series: Array<{
    day: string
    activeUsers: number
    workingCompanies: number
    sessions: number
    logins: number
    actions: number
    accountsCreated: number
    signupsStarted: number
  }>
  funnel: Array<{ key: string; label: string; count: number }>
  features: Array<{ event: string; count: number; companies: number; users: number }>
}

interface Retention {
  weeks: number
  definition: string
  cohorts: Array<{ cohort: string; size: number; weeks: Array<{ week: number; active: number; rate: number }> }>
}

const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function retentionClass(rate: number): string {
  if (rate >= 0.6) return 'bg-emerald-600 text-white'
  if (rate >= 0.4) return 'bg-emerald-500 text-white'
  if (rate >= 0.25) return 'bg-emerald-300 text-emerald-950'
  if (rate >= 0.1) return 'bg-emerald-100 text-emerald-900'
  if (rate > 0) return 'bg-emerald-50 text-emerald-800'
  return 'bg-gray-50 text-gray-300'
}

export default function AdminOverviewPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error } = useAdminData<Overview>(`/admin/insights/overview?days=${days}`)
  const retention = useAdminData<Retention>('/admin/insights/retention?weeks=10')

  const k = data?.kpis
  const funnelTop = data?.funnel[0]?.count || 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        subtitle="What is really happening across PathPilo. Activity comes from every database change plus page views."
        actions={
          <>
            {data && !data.trackingEnabled && (
              <Chip className="bg-red-50 text-red-700 ring-red-200">Tracking is switched off (ACTIVITY_TRACKING=off)</Chip>
            )}
            <Segmented value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
          </>
        }
      />

      {error && <ErrorBox message={error} />}

      {loading && !data ? (
        <Spinner />
      ) : k ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Active today" value={k.activeUsers1d} hint="people who used it in 24 h" />
          <Kpi label="Active this week" value={k.activeUsers7d} hint={`of ${k.accountsTotal} accounts`} />
          <Kpi label="Active this month" value={k.activeUsers30d} hint={`${pct(k.accountsTotal ? k.activeUsers30d / k.accountsTotal : 0)} of accounts`} />
          <Kpi label="Companies doing work" value={k.workingCompanies7d} hint={`last 7 days · of ${k.companiesTotal}`} accent="text-emerald-700" />
          <Kpi label={`New accounts (${days}d)`} value={k.accountsNew} hint={`${k.signupsStarted} entered an email`} />
          <Kpi
            label="Still active after week 1"
            value={pct(k.retention.rate)}
            hint={`${k.retention.returned} of ${k.retention.cohort} · signed up 8–35 days ago`}
            accent={k.retention.rate != null && k.retention.rate < 0.3 ? 'text-amber-600' : 'text-gray-900'}
          />
        </div>
      ) : null}

      {data && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card
            className="xl:col-span-2"
            title="Usage over time"
            subtitle="People active per day, sessions (30+ minutes apart, like Google Analytics) and password logins"
          >
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={(d) => formatDate(String(d))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sessions" name="Sessions" fill="#bae6fd" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="activeUsers" name="Active people" stroke="#059669" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="workingCompanies" name="Companies doing work" stroke="#0f766e" strokeDasharray="4 3" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="logins" name="Password logins" stroke="#6366f1" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="New signups" subtitle="Emails entered vs accounts actually created">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={(d) => formatDate(String(d))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="signupsStarted" name="Entered email" fill="#ede9fe" stroke="#8b5cf6" />
                  <Bar dataKey="accountsCreated" name="Accounts created" fill="#10b981" radius={[3, 3, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      <HeatGrid />

      {data && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title={`Signup journey (last ${days} days)`} subtitle="Everyone who entered an email in the period, and how far they got">
            <div className="space-y-2.5">
              {data.funnel.map((step, i) => {
                const prev = i > 0 ? data.funnel[i - 1].count : step.count
                const width = funnelTop ? Math.max(2, (step.count / funnelTop) * 100) : 0
                return (
                  <div key={step.key}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="font-medium text-gray-700">{step.label}</span>
                      <span className="tabular-nums text-gray-500">
                        <span className="font-semibold text-gray-900">{step.count}</span>
                        {i > 0 && <span className="ml-2 text-gray-400">{pct(prev ? step.count / prev : 0)} of previous</span>}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title="Retention by signup week" subtitle={retention.data?.definition || 'Share of companies active in each week after signup'} bodyClassName="p-0">
            {retention.loading ? (
              <Spinner />
            ) : !retention.data?.cohorts.length ? (
              <Empty>No signups in this window.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                      <th className="px-4 py-2 text-left font-semibold">Week of</th>
                      <th className="px-2 py-2 text-right font-semibold">Size</th>
                      {Array.from({ length: retention.data.weeks }).map((_, i) => (
                        <th key={i} className="px-1 py-2 text-center font-semibold">W{i}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {retention.data.cohorts.map((c) => (
                      <tr key={c.cohort} className="border-t border-gray-50">
                        <td className="whitespace-nowrap px-4 py-1.5 font-medium text-gray-700">{shortDay(c.cohort)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{c.size}</td>
                        {Array.from({ length: retention.data!.weeks }).map((_, i) => {
                          const cell = c.weeks[i]
                          return (
                            <td key={i} className="px-0.5 py-1">
                              {cell ? (
                                <div
                                  title={`${cell.active} of ${c.size} companies active`}
                                  className={`rounded px-1 py-1 text-center text-[11px] font-semibold tabular-nums ${retentionClass(cell.rate)}`}
                                >
                                  {Math.round(cell.rate * 100)}
                                </div>
                              ) : null}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {data && (
        <Card
          title="What people actually use"
          subtitle={`Real actions in the last ${days} days, ranked by how many companies used the feature`}
          bodyClassName="p-0"
        >
          {data.features.length === 0 ? (
            <Empty>No actions recorded in this period yet. New activity appears here as soon as people use the app.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-2 text-left font-semibold">Action</th>
                  <th className="px-3 py-2 text-right font-semibold">Companies</th>
                  <th className="px-3 py-2 text-right font-semibold">People</th>
                  <th className="px-5 py-2 text-right font-semibold">Times</th>
                </tr>
              </thead>
              <tbody>
                {data.features.map((f) => {
                  const cat = eventCategory(f.event)
                  const maxCompanies = data.features[0]?.companies || 1
                  return (
                    <tr key={f.event} className="border-t border-gray-50">
                      <td className="px-5 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${cat.dot}`} />
                          <span className="font-medium text-gray-800">{eventLabel(f.event)}</span>
                          <span className="hidden text-xs text-gray-400 sm:inline">{f.event}</span>
                        </div>
                        <div className="ml-4 mt-1 h-1 rounded-full bg-gray-100">
                          <div className="h-1 rounded-full bg-emerald-400" style={{ width: `${(f.companies / maxCompanies) * 100}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{f.companies}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{f.users}</td>
                      <td className="px-5 py-2 text-right tabular-nums text-gray-600">{f.count}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  )
}
