'use client'

/**
 * Recurring → Subscriptions — standalone standing visits only.
 * Round-owned subscriptions (recurring_jobs.round_id set) are hidden here;
 * they are managed via the round template.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '@/app/utils/api'
import { useAppI18n } from '@/app/components/I18nProvider'
import CreateSubscription from '@/app/components/CreateSubscription'

interface StandingRow {
  id: number
  title: string | null
  client_id: number | null
  name: string | null
  last_name: string | null
  address: string | null
  zip_code: string | null
  city: string | null
  recurrence_type: string | null
  interval_value: number | null
  day_of_week: number | null
  service_count: number | string | null
  assigned_user_id: number | null
  assigned_first_name?: string | null
  assigned_last_name?: string | null
  is_active: boolean
}

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

function clientLabel(row: StandingRow): string {
  const name = [row.name, row.last_name].filter(Boolean).join(' ').trim()
  return name || `Client #${row.client_id ?? '?'}`
}

function cadenceLabel(row: StandingRow): string {
  const interval = Number(row.interval_value || 1)
  if (row.recurrence_type === 'weekly') {
    const day = row.day_of_week != null ? WEEKDAY[row.day_of_week] : ''
    if (interval <= 1) return day ? `Weekly · ${day}` : 'Weekly'
    return day ? `Every ${interval} weeks · ${day}` : `Every ${interval} weeks`
  }
  if (row.recurrence_type === 'monthly') {
    if (interval <= 1) return 'Monthly'
    return `Every ${interval} months`
  }
  return row.recurrence_type || '—'
}

export default function RecurringSubscriptionsPage() {
  const { t } = useAppI18n() as unknown as { t: (key: string, fallback: string) => string }
  const params = useParams<{ company: string }>()
  const companySlug = params?.company ?? ''

  const [rows, setRows] = useState<StandingRow[]>([])
  const [users, setUsers] = useState<Emp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [employeeId, setEmployeeId] = useState<number | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [subsRes, usersRes] = await Promise.all([
        fetch(apiUrl('/subscriptions'), { headers: authHeaders() }),
        fetch(apiUrl('/users'), { headers: authHeaders() }),
      ])
      const subsData = await subsRes.json().catch(() => ({}))
      const usersData = await usersRes.json().catch(() => ({}))
      if (!subsRes.ok) throw new Error(subsData.error || 'Failed to load subscriptions')
      setRows(Array.isArray(subsData.subscriptions) ? subsData.subscriptions : [])
      setUsers(Array.isArray(usersData.users) ? usersData.users : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const userName = useCallback((id: number | null | undefined) => {
    if (id == null) return null
    const u = users.find(x => x.id === id)
    return u ? `${u.first_name} ${u.last_name}`.trim() : null
  }, [users])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (employeeId !== 'all' && Number(row.assigned_user_id) !== employeeId) return false
      if (!q) return true
      const emp = userName(row.assigned_user_id) || ''
      const hay = [
        clientLabel(row),
        row.title || '',
        row.address || '',
        row.city || '',
        emp,
        cadenceLabel(row),
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [rows, query, employeeId, userName])

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400 mb-2">
            {t('app.recurring.title', 'Recurring')}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950">
            {t('app.recurring.subscriptionsTitle', 'Subscriptions')}
          </h1>
          <p className="mt-2 text-[15px] text-gray-500 max-w-2xl leading-relaxed">
            {t(
              'app.recurring.subscriptionsSubtitle',
              'Standing visits on their own schedule — separate from recurring rounds.',
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 shadow-sm self-start sm:self-auto"
        >
          <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
          {t('app.recurring.createSubscription', 'Create subscription')}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client, title, address, employee…"
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
          <p className="text-sm font-semibold text-gray-900">No subscriptions match</p>
          <p className="mt-1 text-sm text-gray-500">Try another search, or create a new subscription.</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
            Create subscription
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3 hidden md:table-cell">Title</th>
                  <th className="px-4 py-3">Cadence</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Employee</th>
                  <th className="px-4 py-3 hidden lg:table-cell text-right">Tasks</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => {
                  const emp = userName(row.assigned_user_id)
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{clientLabel(row)}</div>
                        <div className="text-[11px] text-gray-400 truncate max-w-[220px] md:hidden">
                          {row.title || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-600 truncate max-w-[200px]">
                        {row.title || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{cadenceLabel(row)}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-600 truncate max-w-[140px]">
                        {emp || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-right tabular-nums text-gray-600">
                        {Number(row.service_count || 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.client_id != null && (
                          <Link
                            href={`/clients/${row.client_id}?tab=subscriptions`}
                            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Open
                          </Link>
                        )}
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

      <CreateSubscription
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubscriptionCreated={() => {
          setCreateOpen(false)
          void load()
        }}
      />
    </div>
  )
}
