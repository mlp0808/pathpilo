'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
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
import { ArrowLeftIcon, EyeIcon, PauseCircleIcon, TrashIcon } from '@heroicons/react/24/outline'
import { adminFetch, useAdminData } from '../../_lib/api'
import { eventCategory, eventLabel } from '../../_lib/events'
import type { ActivityEvent, DayCell, EventPage } from '../../_lib/types'
import PlanChip from '../../_components/PlanChip'
import {
  Card, Chip, DayCalendar, Empty, ErrorBox, HeatLegend, Kpi, PageHeader, Segmented, Spinner, Timeline,
  formatDate, timeAgo,
} from '../../_components/ui'
import { startOverwatchSession } from '../../../utils/overwatch'
import BillingPanel from './BillingPanel'

interface CompanyDetail extends EventPage {
  company: {
    id: number; name: string; slug: string; industry: string | null; country: string | null; city: string | null
    website: string | null; createdAt: string; plan: string; billingInterval: string | null
    hasStripeSubscription: boolean; expiresAt: string | null; suspendedAt: string | null
    onboardingCompleted: boolean; onboardingStep: string | null; usageGoals: string[]
    owner: { id: number; name: string; email: string } | null
  }
  totals: {
    clients: number; jobs: number; jobsManual: number; jobsCompleted: number
    invoices: number; invoicedPaid: number; offers: number; subscriptions: number; services: number
  }
  growth: {
    bucket: 'week' | 'month'
    points: Array<{
      bucket: string; clientsNew: number; clientsTotal: number; jobsCreated: number
      jobsScheduled: number; jobsCompleted: number; invoices: number; offers: number
    }>
  }
  members: Array<{
    id: number; name: string; email: string; role: string; joinedAt: string
    lastActiveAt: string | null; actions30d: number; sessions30d: number; actionsTotal: number
  }>
  pendingInvites: Array<{ email: string; role: string; created_at: string }>
  features: Array<{ event: string; last30: number; total: number; lastAt: string }>
  daily: DayCell[]
}

/** The features that make PathPilo sticky. Unused ones are where to nudge. */
const CORE_FEATURES = [
  { label: 'Added clients', events: ['client.created'] },
  { label: 'Created jobs', events: ['job.created'] },
  { label: 'Completed jobs', events: ['job.completed', 'job.status_changed'] },
  { label: 'Subscriptions', events: ['subscription.created'] },
  { label: 'Route planning', events: ['route.optimized', 'route.week_optimized', 'route.reordered'] },
  { label: 'Rounds', events: ['round.created', 'round.scheduled'] },
  { label: 'Offers', events: ['offer.created', 'offer.sent'] },
  { label: 'Invoices', events: ['invoice.created', 'invoice.sent'] },
  { label: 'Leads', events: ['lead.created', 'lead.converted'] },
  { label: 'Invited team', events: ['team.invite_sent'] },
  { label: 'Integrations', events: ['settings.integration_updated'] },
]

const bucketLabel = (b: string, kind: 'week' | 'month') =>
  new Date(`${b}T12:00:00`).toLocaleDateString('en-GB', kind === 'month' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' })

export default function CompanyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const companyId = String(params?.id || '')
  const [range, setRange] = useState<'12' | 'all'>('12')
  const [memberFilter, setMemberFilter] = useState('')
  const [pageViews, setPageViews] = useState(false)

  const query = new URLSearchParams()
  if (range === 'all') query.set('range', 'all')
  if (memberFilter) query.set('userId', memberFilter)
  if (pageViews) query.set('pageViews', '1')
  const { data, loading, error, reload } = useAdminData<CompanyDetail>(`/admin/insights/companies/${companyId}?${query}`)

  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!data) return
    setEvents(data.events)
    setNextBefore(data.nextBefore)
  }, [data])

  const loadMore = async () => {
    if (!nextBefore) return
    setLoadingMore(true)
    try {
      const q = new URLSearchParams(query)
      q.set('before', nextBefore)
      const more = await adminFetch<CompanyDetail>(`/admin/insights/companies/${companyId}?${q}`)
      setEvents((prev) => [...prev, ...more.events])
      setNextBefore(more.nextBefore)
    } finally {
      setLoadingMore(false)
    }
  }

  const startOverwatch = async () => {
    const superPassword = window.prompt('Super password to open this workspace as the owner (Overwatch):')
    if (!superPassword) return
    setBusy('overwatch')
    setActionError('')
    try {
      const res = await adminFetch<{ token: string; user: { activeCompany?: { slug?: string } } }>(
        `/admin/companies/${companyId}/overwatch/start`,
        { method: 'POST', body: JSON.stringify({ superPassword }) }
      )
      startOverwatchSession(res.token, res.user)
      const slug = res.user?.activeCompany?.slug
      window.location.href = slug ? `/${slug}/dashboard` : '/select-company'
    } catch (err) {
      setActionError((err as Error).message)
      setBusy(null)
    }
  }

  const toggleHold = async () => {
    if (!data) return
    const putOnHold = !data.company.suspendedAt
    if (putOnHold && !window.confirm(`Put ${data.company.name} on hold? Nobody in the company can use the app until you lift it.`)) return
    setBusy('hold')
    setActionError('')
    try {
      await adminFetch(`/admin/companies/${companyId}/hold`, { method: 'PATCH' })
      await reload()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const deleteCompany = async () => {
    if (!data) return
    const typed = window.prompt(
      `This permanently deletes ${data.company.name} with all clients, jobs, invoices and offers. Users are kept.\n\nType the company name to confirm:`
    )
    if (typed !== data.company.name) return
    setBusy('delete')
    setActionError('')
    try {
      await adminFetch(`/admin/companies/${companyId}`, { method: 'DELETE', body: JSON.stringify({ confirmName: typed }) })
      router.push('/admin/companies')
    } catch (err) {
      setActionError((err as Error).message)
      setBusy(null)
    }
  }

  if (loading && !data) return <Spinner />
  if (error && !data) return <ErrorBox message={error} />
  if (!data) return null

  const { company: c, totals: t, growth } = data
  const featureMap = new Map(data.features.map((f) => [f.event, f]))
  const growthPoints = growth.points.map((p) => ({ ...p, label: bucketLabel(p.bucket, growth.bucket) }))

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/companies" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeftIcon className="h-4 w-4" /> Companies
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {c.name}
            <PlanChip {...c} />
            {!c.onboardingCompleted && <Chip className="bg-violet-50 text-violet-700 ring-violet-200">Setup: {c.onboardingStep || 'company'}</Chip>}
          </span>
        }
        subtitle={
          <>
            {c.owner ? <Link href={`/admin/people/u-${c.owner.id}`} className="hover:underline">{c.owner.name}</Link> : 'No owner'}
            {' · '}created {formatDate(c.createdAt)}
            {c.industry ? ` · ${c.industry}` : ''}
            {c.city ? ` · ${c.city}` : ''}
            {' · '}/{c.slug}
          </>
        }
        actions={
          <>
            <button type="button" onClick={startOverwatch} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <EyeIcon className="h-4 w-4" /> {busy === 'overwatch' ? 'Opening…' : 'Overwatch'}
            </button>
            <button type="button" onClick={toggleHold} disabled={!!busy}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${c.suspendedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50'}`}>
              <PauseCircleIcon className="h-4 w-4" /> {c.suspendedAt ? 'Lift hold' : 'Put on hold'}
            </button>
            <button type="button" onClick={deleteCompany} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
              <TrashIcon className="h-4 w-4" /> Delete
            </button>
          </>
        }
      />

      {actionError && <ErrorBox message={actionError} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Clients" value={t.clients} />
        <Kpi label="Jobs by hand" value={t.jobsManual} hint={`${t.jobs} incl. subscriptions`} />
        <Kpi label="Jobs completed" value={t.jobsCompleted} accent="text-emerald-700" />
        <Kpi label="Active subscriptions" value={t.subscriptions} />
        <Kpi label="Invoices" value={t.invoices} hint={t.invoicedPaid ? `${Math.round(t.invoicedPaid).toLocaleString('da-DK')} paid` : undefined} />
        <Kpi label="Offers" value={t.offers} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Clients over time"
          subtitle={`Total clients and new clients per ${growth.bucket}`}
          actions={<Segmented value={range} onChange={setRange} options={[{ value: '12', label: '12 mo' }, { value: 'all', label: 'All' }]} />}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={growthPoints} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="clientsTotal" name="Total clients" fill="#ccfbf1" stroke="#0d9488" strokeWidth={2} />
                <Bar dataKey="clientsNew" name="New clients" fill="#14b8a6" radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Jobs over time" subtitle={`Jobs scheduled and completed per ${growth.bucket}, plus jobs created by hand`}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={growthPoints} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="jobsScheduled" name="Scheduled" fill="#bbf7d0" radius={[3, 3, 0, 0]} />
                <Bar dataKey="jobsCompleted" name="Completed" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="jobsCreated" name="Created by hand" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="invoices" name="Invoices" stroke="#e11d48" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Activity, last 90 days" subtitle="All members combined" actions={<HeatLegend />}>
          <DayCalendar daily={data.daily} />
        </Card>

        <Card title="Feature adoption" subtitle="Has this company ever used it?">
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
            {CORE_FEATURES.map((f) => {
              const hits = f.events.map((e) => featureMap.get(e)).filter(Boolean) as CompanyDetail['features']
              const total = hits.reduce((s, h) => s + h.total, 0)
              const recent = hits.reduce((s, h) => s + h.last30, 0)
              return (
                <li key={f.label} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${total ? (recent ? 'bg-emerald-500' : 'bg-emerald-200') : 'bg-gray-200'}`} />
                    <span className={total ? 'text-gray-800' : 'text-gray-400'}>{f.label}</span>
                  </span>
                  <span className="text-xs tabular-nums text-gray-400">{total ? `${total}× · ${recent} in 30d` : 'never'}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Team" subtitle="Who in this company actually uses it" bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-5 py-2 text-left font-semibold">Member</th>
                <th className="px-3 py-2 text-left font-semibold">Role</th>
                <th className="px-3 py-2 text-left font-semibold">Last active</th>
                <th className="px-3 py-2 text-right font-semibold">Sessions 30d</th>
                <th className="px-5 py-2 text-right font-semibold">Actions 30d / all</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-2.5">
                    <Link href={`/admin/people/u-${m.id}`} className="font-semibold text-gray-900 hover:underline">{m.name}</Link>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </td>
                  <td className="px-3 py-2.5 capitalize text-gray-600">{m.role}</td>
                  <td className="px-3 py-2.5 text-gray-500">{timeAgo(m.lastActiveAt)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{m.sessions30d}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    <span className="font-semibold text-gray-900">{m.actions30d}</span>
                    <span className="text-gray-400"> / {m.actionsTotal}</span>
                  </td>
                </tr>
              ))}
              {data.pendingInvites.map((inv) => (
                <tr key={inv.email} className="border-t border-gray-50 text-gray-400">
                  <td className="px-5 py-2.5">{inv.email}</td>
                  <td className="px-3 py-2.5 capitalize">{inv.role}</td>
                  <td className="px-3 py-2.5" colSpan={3}>Invited {formatDate(inv.created_at)}, not accepted yet</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Most used" subtitle="All-time actions in this company" bodyClassName="p-0">
          {data.features.length === 0 ? (
            <Empty>Nothing yet.</Empty>
          ) : (
            <ul className="divide-y divide-gray-50">
              {data.features.slice(0, 12).map((f) => (
                <li key={f.event} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${eventCategory(f.event).dot}`} />
                    <span className="truncate text-gray-800">{eventLabel(f.event)}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-gray-500">{f.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Plan, free trial &amp; SMS</h2>
        <BillingPanel companyId={companyId} onPlanChanged={() => { void reload() }} />
      </div>

      <Card
        title="Timeline"
        subtitle="Every change made in this workspace, grouped by day"
        actions={
          <>
            <select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700"
            >
              <option value="">All members</option>
              {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-600">
              <input type="checkbox" checked={pageViews} onChange={(e) => setPageViews(e.target.checked)} className="rounded border-gray-300" />
              Page views
            </label>
          </>
        }
      >
        {loading ? <Spinner /> : (
          <Timeline events={events} showCompany={false} nextBefore={nextBefore} onLoadMore={loadMore} loadingMore={loadingMore} />
        )}
      </Card>
    </div>
  )
}
