'use client'

/**
 * Recurring → Rounds
 * One list for all round packages: drafts, manual (multi-day), and recurring.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '@/app/utils/api'
import { useAppI18n } from '@/app/components/I18nProvider'

interface RoundRow {
  id: number
  name: string | null
  status: string
  assigned_user_id: number | null
  scheduled_date: string | null
  schedule_kind: 'manual' | 'recurring' | null
  day_of_week: number | null
  interval_value: number | null
  round_template_id: number | null
  is_recurring: boolean
  template_name: string | null
  template_day_of_week: number | null
  template_interval_value: number | null
  assigned_first_name: string | null
  assigned_last_name: string | null
  stop_count: number
  placement_count: number
  updated_at: string
  source: 'round'
}

interface TemplateRow {
  id: number
  name: string
  assigned_user_id: number | null
  assigned_first_name: string | null
  assigned_last_name: string | null
  day_of_week: number | null
  interval_value: number
  is_active: boolean
  stop_count: number
  source: 'template'
}

type ListRow = RoundRow | TemplateRow

interface Emp {
  id: number
  first_name: string
  last_name: string
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { Authorization: `Bearer ${token}` }
}

function person(first: string | null, last: string | null): string | null {
  const n = [first, last].filter(Boolean).join(' ').trim()
  return n || null
}

function cadenceLabel(dayOfWeek: number | null | undefined, interval: number | null | undefined): string {
  const day = dayOfWeek != null ? WEEKDAY[dayOfWeek] : ''
  const n = interval || 1
  if (n === 1) return day ? `Every ${day}` : 'Weekly'
  return day ? `Every ${n} weeks · ${day}` : `Every ${n} weeks`
}

function rowTitle(r: ListRow): string {
  if (r.source === 'template') return r.name?.trim() || 'Untitled round'
  return r.name?.trim() || r.template_name?.trim() || 'Untitled round'
}

function rowKind(r: ListRow): 'draft' | 'manual' | 'recurring' {
  if (r.source === 'template') return 'recurring'
  if (r.is_recurring || r.schedule_kind === 'recurring' || r.round_template_id != null) return 'recurring'
  if (r.schedule_kind === 'manual' || Number(r.placement_count || 0) > 0 || r.scheduled_date) return 'manual'
  return 'draft'
}

function scheduleText(r: ListRow): string {
  const kind = rowKind(r)
  if (kind === 'draft') return 'Draft'
  if (r.source === 'template') return cadenceLabel(r.day_of_week, r.interval_value)
  if (kind === 'recurring') {
    return cadenceLabel(
      r.day_of_week ?? r.template_day_of_week,
      r.interval_value ?? r.template_interval_value,
    )
  }
  const n = Number(r.placement_count || 0)
  if (n > 0) return n === 1 ? '1 day placed' : `${n} days placed`
  if (r.scheduled_date) return String(r.scheduled_date).slice(0, 10)
  return 'Manual'
}

function backToRounds(companySlug: string) {
  return encodeURIComponent(`/${companySlug}/recurring/rounds`)
}

export default function RecurringRoundsPage() {
  const { t } = useAppI18n() as unknown as { t: (key: string, fallback: string) => string }
  const params = useParams<{ company: string }>()
  const companySlug = params?.company ?? ''

  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [users, setUsers] = useState<Emp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [employeeId, setEmployeeId] = useState<number | 'all'>('all')
  const [deletingKey, setDeletingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [roundsRes, templatesRes, usersRes] = await Promise.all([
        fetch(apiUrl('/rounds?in_library=1'), { headers: authHeaders() }),
        fetch(apiUrl('/round-templates'), { headers: authHeaders() }),
        fetch(apiUrl('/users'), { headers: authHeaders() }),
      ])
      const roundsData = await roundsRes.json().catch(() => ({}))
      const templatesData = await templatesRes.json().catch(() => ({}))
      const usersData = await usersRes.json().catch(() => ({}))
      if (!roundsRes.ok) throw new Error(roundsData?.error || 'Failed to load rounds')
      if (!templatesRes.ok) throw new Error(templatesData?.error || 'Failed to load templates')
      setRounds(
        (Array.isArray(roundsData.rounds) ? roundsData.rounds : []).map((r: RoundRow) => ({
          ...r,
          source: 'round' as const,
        })),
      )
      setTemplates(
        (Array.isArray(templatesData.templates) ? templatesData.templates : []).map((t: TemplateRow) => ({
          ...t,
          source: 'template' as const,
        })),
      )
      setUsers(Array.isArray(usersData.users) ? usersData.users : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const linkedTemplateIds = useMemo(() => {
    const ids = new Set<number>()
    for (const r of rounds) {
      if (r.round_template_id != null) ids.add(Number(r.round_template_id))
    }
    return ids
  }, [rounds])

  const rows = useMemo(() => {
    const standaloneTemplates = templates.filter(t => !linkedTemplateIds.has(t.id))
    const merged: ListRow[] = [...rounds, ...standaloneTemplates]
    merged.sort((a, b) => {
      const au = a.source === 'round' ? String(a.updated_at || '') : ''
      const bu = b.source === 'round' ? String(b.updated_at || '') : ''
      if (au && bu) return bu.localeCompare(au)
      return rowTitle(a).localeCompare(rowTitle(b))
    })
    return merged
  }, [rounds, templates, linkedTemplateIds])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      const empId = r.assigned_user_id
      if (employeeId !== 'all' && Number(empId) !== employeeId) return false
      if (!q) return true
      const emp = person(
        r.source === 'round' ? r.assigned_first_name : r.assigned_first_name,
        r.source === 'round' ? r.assigned_last_name : r.assigned_last_name,
      ) || ''
      const hay = [
        rowTitle(r),
        scheduleText(r),
        rowKind(r),
        emp,
        String(r.stop_count),
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [rows, query, employeeId])

  const createHref = `/${companySlug}/map?focus=round&back=${backToRounds(companySlug)}`

  const deleteRow = async (r: ListRow) => {
    const label = rowTitle(r)
    const ok = window.confirm(
      r.source === 'round'
        ? `Delete “${label}”? Future placed days for this round will be removed from the calendar (jobs stay as deleted). Past days stay as history.`
        : `Delete “${label}”?`,
    )
    if (!ok) return
    const key = `${r.source}-${r.id}`
    setDeletingKey(key)
    try {
      const url = r.source === 'round'
        ? apiUrl(`/rounds/${r.id}`)
        : apiUrl(`/round-templates/${r.id}`)
      const res = await fetch(url, { method: 'DELETE', headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not delete')
      if (r.source === 'round') {
        setRounds(prev => prev.filter(x => x.id !== r.id))
      } else {
        setTemplates(prev => prev.filter(x => x.id !== r.id))
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setDeletingKey(null)
    }
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400 mb-2">
            {t('app.recurring.title', 'Recurring')}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950">
            {t('app.recurring.roundsTitle', 'Rounds')}
          </h1>
          <p className="mt-2 text-[15px] text-gray-500 max-w-2xl leading-relaxed">
            Templates you place onto days — Open for settings, Plan to schedule on the map.
          </p>
        </div>
        <Link
          href={createHref}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 shadow-sm self-start sm:self-auto"
        >
          <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
          {t('app.rounds.createRound', 'Create round')}
        </Link>
      </div>

      <div className="mb-4 flex flex-col lg:flex-row lg:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rounds, schedule, employee…"
            className="w-full h-10 rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#193434]/15 focus:border-[#193434]/40"
          />
        </div>
        <select
          value={employeeId === 'all' ? 'all' : String(employeeId)}
          onChange={(e) => setEmployeeId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#193434]/15 sm:w-52"
        >
          <option value="all">All employees</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
          <p className="text-sm font-semibold text-gray-900">
            {rows.length === 0 ? 'No rounds yet' : 'No rounds match'}
          </p>
          <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
            {rows.length === 0
              ? 'Create a round on the map, add stops, then schedule it onto days or as a weekly loop.'
              : 'Try another search or employee filter.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Employee</th>
                  <th className="px-4 py-3 hidden md:table-cell text-right">Stops</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => {
                  const kind = rowKind(r)
                  const emp = person(r.assigned_first_name, r.assigned_last_name)
                  const openHref = r.source === 'round'
                    ? `/${companySlug}/recurring/rounds/${r.id}`
                    : createHref
                  const planHref = r.source === 'round'
                    ? `/${companySlug}/map?focus=round&roundId=${r.id}&back=${backToRounds(companySlug)}`
                    : createHref
                  return (
                    <tr key={`${r.source}-${r.id}`} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {r.source === 'round' ? (
                          <Link href={openHref} className="hover:text-accent-700 hover:underline underline-offset-2">
                            {rowTitle(r)}
                          </Link>
                        ) : (
                          rowTitle(r)
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{scheduleText(r)}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-600 truncate max-w-[160px]">
                        {emp || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-right tabular-nums text-gray-600">
                        {r.stop_count}
                      </td>
                      <td className="px-4 py-3">
                        {kind === 'draft' && (
                          <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            Draft
                          </span>
                        )}
                        {kind === 'manual' && (
                          <span className="inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                            Days
                          </span>
                        )}
                        {kind === 'recurring' && (
                          <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            Repeat
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {r.source === 'round' ? (
                            <>
                              <Link
                                href={openHref}
                                className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
                              >
                                Open
                              </Link>
                              <Link
                                href={planHref}
                                className="inline-flex items-center rounded-lg border border-accent-200 bg-accent-50 px-2.5 py-1.5 text-[12px] font-semibold text-accent-800 hover:bg-accent-100"
                              >
                                {kind === 'draft' ? 'Continue' : 'Plan'}
                              </Link>
                            </>
                          ) : null}
                          <button
                            type="button"
                            disabled={deletingKey === `${r.source}-${r.id}`}
                            onClick={() => void deleteRow(r)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-40"
                            title="Delete round"
                            aria-label={`Delete ${rowTitle(r)}`}
                          >
                            <TrashIcon className="h-4 w-4" strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 tabular-nums">
            {filtered.length} of {rows.length}
          </div>
        </div>
      )}
    </div>
  )
}
