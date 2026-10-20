'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useAdminData } from '../_lib/api'
import { HEALTH } from '../_lib/events'
import type { CompanyRow } from '../_lib/types'
import PlanChip from '../_components/PlanChip'
import { Card, Chip, Empty, ErrorBox, HeatLegend, HeatStrip, PageHeader, Spinner, formatDate, timeAgo } from '../_components/ui'

interface CompaniesResponse {
  days: string[]
  healthCounts: Record<string, number>
  companies: CompanyRow[]
}

type SortKey = 'lastActive' | 'actions30d' | 'clients' | 'jobs' | 'created'

const HEALTH_ORDER = ['active', 'new', 'at_risk', 'in_setup', 'dormant']

export default function CompaniesPage() {
  const router = useRouter()
  const { data, loading, error } = useAdminData<CompaniesResponse>('/admin/insights/companies')
  const [search, setSearch] = useState('')
  const [health, setHealth] = useState('')
  const [sort, setSort] = useState<SortKey>('lastActive')

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const list = data.companies.filter((c) => {
      if (health && c.health !== health) return false
      if (!q) return true
      return [c.name, c.slug, c.owner?.name, c.owner?.email].filter(Boolean).some((s) => String(s).toLowerCase().includes(q))
    })
    const t = (v: string | null) => (v ? new Date(v).getTime() : 0)
    list.sort((a, b) => {
      switch (sort) {
        case 'actions30d': return b.activity.actions30d - a.activity.actions30d
        case 'clients': return b.counts.clients - a.counts.clients
        case 'jobs': return b.counts.jobs - a.counts.jobs
        case 'created': return t(b.createdAt) - t(a.createdAt)
        default: return t(b.activity.lastActiveAt) - t(a.activity.lastActiveAt)
      }
    })
    return list
  }, [data, search, health, sort])

  const maxActions = useMemo(
    () => Math.max(0, ...(data?.companies || []).flatMap((c) => c.activity.cells.map((x) => x.a))),
    [data]
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Companies"
        subtitle="Each workspace with its health, plan and how much real work happens in it. Click one for growth charts, members, billing and its timeline."
      />

      {error && <ErrorBox message={error} />}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setHealth('')}
          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${!health ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'}`}
        >
          All <span className="ml-1 opacity-60">{data?.companies.length ?? ''}</span>
        </button>
        {HEALTH_ORDER.filter((h) => data?.healthCounts[h]).map((h) => (
          <button
            key={h}
            type="button"
            title={HEALTH[h].hint}
            onClick={() => setHealth(health === h ? '' : h)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${health === h ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'}`}
          >
            {HEALTH[h].label} <span className="ml-1 opacity-60">{data?.healthCounts[h]}</span>
          </button>
        ))}
      </div>

      <Card
        bodyClassName="p-0"
        title={
          <div className="relative w-72 max-w-full">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company or owner"
              className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm font-normal outline-none focus:border-gray-400"
            />
          </div>
        }
        actions={
          <>
            <div className="hidden md:block"><HeatLegend /></div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700"
            >
              <option value="lastActive">Last active</option>
              <option value="actions30d">Most actions (30d)</option>
              <option value="clients">Most clients</option>
              <option value="jobs">Most jobs</option>
              <option value="created">Newest</option>
            </select>
          </>
        }
      >
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty>No companies match.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-2 text-left font-semibold">Company</th>
                  <th className="px-3 py-2 text-left font-semibold">Health</th>
                  <th className="px-3 py-2 text-left font-semibold">Plan</th>
                  <th className="px-3 py-2 text-left font-semibold">Last 30 days</th>
                  <th className="px-3 py-2 text-right font-semibold">Clients</th>
                  <th className="px-3 py-2 text-right font-semibold" title="Jobs created by hand / all jobs incl. subscriptions">Jobs</th>
                  <th className="px-3 py-2 text-right font-semibold">Team</th>
                  <th className="px-5 py-2 text-left font-semibold">Last active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/admin/companies/${c.id}`)} className="cursor-pointer border-t border-gray-50 hover:bg-gray-50">
                    <td className="max-w-[240px] px-5 py-2.5">
                      <p className="truncate font-semibold text-gray-900">{c.name}</p>
                      <p className="truncate text-xs text-gray-400">{c.owner?.name || c.owner?.email || '—'} · since {formatDate(c.createdAt)}</p>
                    </td>
                    <td className="px-3 py-2.5"><Chip className={HEALTH[c.health].chip} title={HEALTH[c.health].hint}>{HEALTH[c.health].label}</Chip></td>
                    <td className="px-3 py-2.5"><PlanChip {...c} /></td>
                    <td className="px-3 py-2.5"><HeatStrip cells={c.activity.cells} max={maxActions} size="h-3 w-[7px]" /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className="font-semibold text-gray-900">{c.counts.clients}</span>
                      {c.counts.clients30d > 0 && <span className="ml-1 text-xs text-emerald-600">+{c.counts.clients30d}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className="font-semibold text-gray-900">{c.counts.jobsManual}</span>
                      <span className="text-gray-400"> / {c.counts.jobs}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{c.counts.members}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-gray-500">{timeAgo(c.activity.lastActiveAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
