'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useAdminData } from '../_lib/api'
import { STAGES } from '../_lib/events'
import type { Person } from '../_lib/types'
import { Card, Chip, Empty, ErrorBox, PageHeader, Spinner, formatDate, timeAgo } from '../_components/ui'

interface PeopleResponse {
  total: number
  stageCounts: Record<string, number>
  people: Person[]
}

type SortKey = 'lastActive' | 'signedUp' | 'actions30d'

const STAGE_ORDER = ['email', 'details', 'verify', 'company', 'goals', 'onboarded', 'activated', 'team', 'no_company']

export default function PeoplePage() {
  const router = useRouter()
  const { data, loading, error } = useAdminData<PeopleResponse>('/admin/insights/people')
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<string>('')
  const [sort, setSort] = useState<SortKey>('lastActive')

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const list = data.people.filter((p) => {
      if (stage && p.stage !== stage) return false
      if (!q) return true
      return [p.name, p.email, p.company?.name].filter(Boolean).some((s) => String(s).toLowerCase().includes(q))
    })
    const t = (v: string | null) => (v ? new Date(v).getTime() : 0)
    list.sort((a, b) => {
      if (sort === 'signedUp') return t(b.signedUpAt) - t(a.signedUpAt)
      if (sort === 'actions30d') return b.actions30d - a.actions30d
      return t(b.lastActiveAt || b.signedUpAt) - t(a.lastActiveAt || a.signedUpAt)
    })
    return list
  }, [data, search, stage, sort])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="People"
        subtitle="Everyone who entered an email is here, whether or not they finished signing up. Click a person for their full timeline."
      />

      {error && <ErrorBox message={error} />}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStage('')}
          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${!stage ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'}`}
        >
          All <span className="ml-1 opacity-60">{data?.total ?? ''}</span>
        </button>
        {STAGE_ORDER.filter((s) => data?.stageCounts[s]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStage(stage === s ? '' : s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${stage === s ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'}`}
          >
            {STAGES[s]?.label || s} <span className="ml-1 opacity-60">{data?.stageCounts[s]}</span>
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
              placeholder="Search name, email or company"
              className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm font-normal outline-none focus:border-gray-400"
            />
          </div>
        }
        actions={
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700"
          >
            <option value="lastActive">Last active</option>
            <option value="signedUp">Newest signup</option>
            <option value="actions30d">Most actions (30d)</option>
          </select>
        }
      >
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty>No people match.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-2 text-left font-semibold">Person</th>
                  <th className="px-3 py-2 text-left font-semibold">Where they are</th>
                  <th className="px-3 py-2 text-left font-semibold">Company</th>
                  <th className="px-3 py-2 text-left font-semibold">Signed up</th>
                  <th className="px-3 py-2 text-left font-semibold">Last active</th>
                  <th className="px-3 py-2 text-right font-semibold" title="Real actions last 7 / 30 days">Actions 7d / 30d</th>
                  <th className="px-5 py-2 text-right font-semibold" title="Days with any activity, last 30 days">Active days</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const st = STAGES[p.stage]
                  const recent = p.lastActiveAt && Date.now() - new Date(p.lastActiveAt).getTime() < 86400000
                  return (
                    <tr key={p.key} onClick={() => router.push(`/admin/people/${p.key}`)} className="cursor-pointer border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${p.kind === 'signup' ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600'}`}>
                            {(p.name || '?')[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-900">{p.name}</p>
                            <p className="truncate text-xs text-gray-400">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {st && <Chip className={st.chip}>{st.label}</Chip>}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-gray-600">{p.company?.name || <span className="text-gray-300">—</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">{formatDate(p.signedUpAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className={recent ? 'font-semibold text-emerald-700' : 'text-gray-500'}>{timeAgo(p.lastActiveAt)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="font-semibold text-gray-900">{p.actions7d}</span>
                        <span className="text-gray-400"> / {p.actions30d}</span>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gray-600">{p.activeDays30d}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
