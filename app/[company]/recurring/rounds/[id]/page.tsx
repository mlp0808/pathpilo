'use client'

/**
 * Round detail — the “what is this round” page.
 * Layout explains the model: ordered stops (+ their cadence) → schedule → days placed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  MapIcon,
  PauseIcon,
  PencilSquareIcon,
  PlayIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '@/app/utils/api'
import { useAppI18n } from '@/app/components/I18nProvider'
import RoundOccurrenceCalendar, { type CalendarDay } from '@/app/components/rounds/RoundOccurrenceCalendar'
import RoundDayRouteSidebar from '@/app/components/rounds/RoundDayRouteSidebar'

const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface RoundStop {
  id: number
  position: number
  label: string | null
  client_id: number | null
  client_name: string | null
  client_last_name: string | null
  client_address: string | null
  client_city: string | null
  client_zip_code: string | null
  estimated_duration_minutes: number | null
  recurring_job_id: number | null
  linked_subscription_id: number | null
  subscription_paused_at: string | null
}

interface Placement {
  scheduled_date: string
  assigned_user_id: number | null
  assigned_first_name: string | null
  assigned_last_name: string | null
  daily_route_id: number
  name: string | null
  job_count: number
}

interface RoundDetail {
  id: number
  name: string | null
  status: string
  schedule_kind: 'manual' | 'recurring' | null
  day_of_week: number | null
  day_of_month: number | null
  interval_value: number | null
  recurrence_type: 'weekly' | 'monthly' | null
  starting_date: string | null
  assigned_user_id: number | null
  assigned_first_name: string | null
  assigned_last_name: string | null
  stops: RoundStop[]
  placements: Placement[]
  subscriptions: Array<{ id: number; paused_at: string | null }>
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function stopTitle(s: RoundStop): string {
  const fromClient = [s.client_name, s.client_last_name].filter(Boolean).join(' ').trim()
  return (s.label && s.label.trim()) || fromClient || 'Stop'
}

function stopPlace(s: RoundStop): string {
  return [s.client_address, s.client_zip_code, s.client_city].filter(Boolean).join(', ')
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return `${d} ${MONTH[m - 1]} ${y}`
}

export default function RoundDetailPage() {
  const { t } = useAppI18n() as unknown as { t: (key: string, fallback: string) => string }
  const params = useParams<{ company: string; id: string }>()
  const companySlug = params?.company ?? ''
  const roundId = Number(params?.id)

  const [round, setRound] = useState<RoundDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [pausingStopId, setPausingStopId] = useState<number | null>(null)
  const [openDay, setOpenDay] = useState<CalendarDay | null>(null)
  const [manageDay, setManageDay] = useState<CalendarDay | null>(null)

  const load = useCallback(async () => {
    if (!Number.isFinite(roundId)) {
      setError('Invalid round')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(apiUrl(`/rounds/${roundId}`), { headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not load round')
      const next = data.round as RoundDetail
      setRound(next)
      setNameDraft(next.name?.trim() || '')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load round')
      setRound(null)
    } finally {
      setLoading(false)
    }
  }, [roundId])

  useEffect(() => { void load() }, [load])

  const listHref = `/${companySlug}/recurring/rounds`
  const mapHref = `/${companySlug}/map?focus=round&roundId=${roundId}&back=${encodeURIComponent(listHref)}`
  const mapAddHref = `${mapHref}&intent=add-stop`

  const cadence = useMemo(() => {
    if (!round) return null
    if (round.schedule_kind === 'recurring') {
      if (round.recurrence_type === 'monthly') {
        const n = round.interval_value || 1
        const ord = round.day_of_month || 1
        return n <= 1 ? `Monthly · day ${ord}` : `Every ${n} months · day ${ord}`
      }
      const day = round.day_of_week != null ? WEEKDAY_LONG[round.day_of_week] : ''
      const n = round.interval_value || 1
      return n <= 1 ? `Weekly · ${day}` : `Every ${n} weeks · ${day}`
    }
    if (round.schedule_kind === 'manual') {
      const n = round.placements?.length || 0
      return n > 0 ? `${n} day${n === 1 ? '' : 's'} placed` : 'One-time'
    }
    return 'Draft'
  }, [round])

  const employee = round
    ? [round.assigned_first_name, round.assigned_last_name].filter(Boolean).join(' ').trim()
    : ''

  const saveName = async () => {
    if (!round) return
    const next = nameDraft.trim()
    setSavingName(true)
    try {
      const res = await fetch(apiUrl(`/rounds/${round.id}`), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ name: next || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not rename')
      setRound(data.round)
      setEditingName(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not rename')
    } finally {
      setSavingName(false)
    }
  }

  const togglePause = async (stop: RoundStop) => {
    if (!round) return
    const isPaused = !!stop.subscription_paused_at
    setPausingStopId(stop.id)
    try {
      const res = await fetch(apiUrl(`/rounds/${round.id}/stops/${stop.id}/pause`), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ paused: !isPaused }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update stop')
      setRound(data.round)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update stop')
    } finally {
      setPausingStopId(null)
    }
  }

  if (loading) {
    return (
      <div className="w-full max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="h-8 w-48 rounded-lg bg-gray-100 animate-pulse mb-6" />
        <div className="h-40 rounded-3xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  if (error || !round) {
    return (
      <div className="w-full max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href={listHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeftIcon className="h-4 w-4" /> Rounds
        </Link>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Round not found'}
        </div>
      </div>
    )
  }

  const kind = round.schedule_kind === 'recurring'
    ? 'recurring'
    : round.schedule_kind === 'manual'
      ? 'manual'
      : 'draft'

  return (
    <div className="w-full max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-16">
      {openDay && (
        <RoundDayRouteSidebar
          companySlug={companySlug}
          date={openDay.date}
          focusUserId={openDay.assigned_user_id}
          roundName={openDay.name || round.name}
          onClose={() => setOpenDay(null)}
          onChanged={() => void load()}
          onManage={() => {
            setManageDay(openDay)
            setOpenDay(null)
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <Link
          href={listHref}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900 w-fit"
        >
          <ArrowLeftIcon className="h-4 w-4" strokeWidth={2} />
          {t('app.recurring.roundsTitle', 'Rounds')}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={mapHref}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 shadow-sm"
          >
            <MapIcon className="h-4 w-4" strokeWidth={2} />
            {t('app.rounds.editOnMap', 'Edit on map')}
          </Link>
          <Link
            href={mapHref}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 shadow-sm"
          >
            <CalendarDaysIcon className="h-4 w-4" strokeWidth={2} />
            {t('app.rounds.planRound', 'Plan round')}
          </Link>
        </div>
      </div>

      {/* Hero — title + living schedule picture */}
      <header className="relative overflow-hidden rounded-[28px] border border-gray-200/80 bg-white mb-6">
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            background:
              'radial-gradient(1200px 280px at 10% -20%, rgba(61,213,122,0.22), transparent 55%), radial-gradient(900px 260px at 90% 0%, rgba(25,52,52,0.08), transparent 50%)',
          }}
        />
        <div className="relative px-5 sm:px-8 pt-7 pb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {kind === 'draft' && (
              <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Draft</span>
            )}
            {kind === 'manual' && (
              <span className="inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">Days</span>
            )}
            {kind === 'recurring' && (
              <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Repeat</span>
            )}
            {employee && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-gray-200 px-2.5 py-0.5 text-[12px] font-medium text-gray-700">
                <span className="h-5 w-5 rounded-full bg-[#193434] text-white text-[10px] font-bold inline-flex items-center justify-center">
                  {employee.slice(0, 1).toUpperCase()}
                </span>
                {employee}
              </span>
            )}
          </div>

          {editingName ? (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center max-w-2xl">
              <input
                autoFocus
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void saveName()
                  if (e.key === 'Escape') {
                    setNameDraft(round.name?.trim() || '')
                    setEditingName(false)
                  }
                }}
                className="flex-1 h-12 rounded-2xl border border-gray-200 bg-white px-4 text-2xl font-semibold tracking-tight text-gray-950 focus:outline-none focus:ring-2 focus:ring-[#193434]/15"
                placeholder="Round name"
              />
              <button
                type="button"
                disabled={savingName}
                onClick={() => void saveName()}
                className="h-11 px-4 rounded-2xl bg-[#193434] text-white text-sm font-semibold disabled:opacity-50"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="group inline-flex items-center gap-2 text-left max-w-full"
            >
              <h1 className="text-3xl sm:text-[2.15rem] font-semibold tracking-tight text-gray-950 truncate">
                {round.name?.trim() || 'Untitled round'}
              </h1>
              <PencilSquareIcon className="h-5 w-5 text-gray-300 group-hover:text-gray-500 flex-shrink-0" strokeWidth={1.8} />
            </button>
          )}

          {/* Visual cadence */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
            <div className="rounded-2xl bg-white/80 border border-gray-100 px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-3">Schedule</p>
              {kind === 'recurring' && round.recurrence_type !== 'monthly' ? (
                <div className="flex items-center justify-between gap-1 max-w-sm">
                  {WEEKDAY_SHORT.map((label, i) => {
                    const active = round.day_of_week === i
                    return (
                      <div
                        key={i}
                        className={[
                          'h-10 w-10 rounded-full flex items-center justify-center text-[12px] font-bold transition-colors',
                          active ? 'bg-accent-500 text-white shadow-sm' : 'bg-gray-50 text-gray-400',
                        ].join(' ')}
                      >
                        {label}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[22px] font-semibold tracking-tight text-gray-900">{cadence}</p>
              )}
              {kind === 'recurring' && round.recurrence_type !== 'monthly' && (
                <p className="mt-3 text-sm font-medium text-gray-600">{cadence}</p>
              )}
              {round.starting_date && kind === 'recurring' && (
                <p className="mt-1 text-[12px] text-gray-400">From {fmtDate(round.starting_date)}</p>
              )}
            </div>

            <div className="rounded-2xl bg-[#193434] text-white px-4 py-4 flex flex-col justify-between min-h-[120px]">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Stops · together</p>
              <div className="flex items-end justify-between gap-3 mt-3">
                <p className="text-4xl font-semibold tabular-nums tracking-tight">{round.stops.length}</p>
                <div className="flex -space-x-2">
                  {round.stops.slice(0, 5).map((s, i) => (
                    <span
                      key={s.id}
                      className="h-8 w-8 rounded-full border-2 border-[#193434] bg-accent-500/90 text-[11px] font-bold flex items-center justify-center"
                      style={{ zIndex: 5 - i }}
                      title={stopTitle(s)}
                    >
                      {i + 1}
                    </span>
                  ))}
                  {round.stops.length > 5 && (
                    <span className="h-8 w-8 rounded-full border-2 border-[#193434] bg-white/15 text-[10px] font-bold flex items-center justify-center">
                      +{round.stops.length - 5}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[12px] text-white/55">
                {kind === 'recurring'
                  ? 'Each stop has its own subscription — kept with this round'
                  : 'Placed as one named package on the day'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-5">
        {/* Stop order */}
        <section className="rounded-[24px] border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900">Route order</h2>
              <p className="text-[12px] text-gray-400 mt-0.5">Pause a stop or reorder on the map</p>
            </div>
            <Link
              href={mapHref}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              <MapIcon className="h-3.5 w-3.5" />
              Reorder
            </Link>
          </div>

          {round.stops.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-semibold text-gray-800">No stops yet</p>
              <Link href={mapHref} className="inline-flex mt-3 items-center gap-1.5 text-sm font-semibold text-accent-700 hover:text-accent-800">
                <PlusIcon className="h-4 w-4" /> Add on map
              </Link>
            </div>
          ) : (
            <ol className="divide-y divide-gray-50">
              {round.stops.map((stop, index) => {
                const paused = !!stop.subscription_paused_at
                const hasSub = stop.linked_subscription_id != null || stop.recurring_job_id != null
                return (
                  <li
                    key={stop.id}
                    className={[
                      'flex items-stretch gap-0',
                      paused ? 'bg-gray-50/80' : 'bg-white',
                    ].join(' ')}
                  >
                    <div className="w-14 flex-shrink-0 flex flex-col items-center pt-4 pb-3 relative">
                      <span
                        className={[
                          'h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold z-[1]',
                          paused
                            ? 'bg-gray-200 text-gray-500'
                            : 'bg-[#193434] text-white',
                        ].join(' ')}
                      >
                        {index + 1}
                      </span>
                      {index < round.stops.length - 1 && (
                        <span className="absolute top-12 bottom-0 w-px bg-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 py-3.5 pr-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`text-[14px] font-semibold truncate ${paused ? 'text-gray-500' : 'text-gray-900'}`}>
                            {stopTitle(stop)}
                          </p>
                          {stopPlace(stop) && (
                            <p className="text-[12px] text-gray-400 truncate mt-0.5">{stopPlace(stop)}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {stop.estimated_duration_minutes != null && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 rounded-md px-1.5 py-0.5">
                                {stop.estimated_duration_minutes} min
                              </span>
                            )}
                            {hasSub && !paused && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-1.5 py-0.5">
                                Subscription
                              </span>
                            )}
                            {paused && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-1.5 py-0.5">
                                Paused
                              </span>
                            )}
                          </div>
                        </div>
                        {hasSub ? (
                          <button
                            type="button"
                            disabled={pausingStopId === stop.id}
                            onClick={() => void togglePause(stop)}
                            className={[
                              'flex-shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border text-[11px] font-semibold disabled:opacity-40',
                              paused
                                ? 'border-accent-200 bg-accent-50 text-accent-800 hover:bg-accent-100'
                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                            ].join(' ')}
                            title={paused ? 'Resume stop' : 'Pause stop'}
                          >
                            {paused ? (
                              <><PlayIcon className="h-3.5 w-3.5" /> Resume</>
                            ) : (
                              <><PauseIcon className="h-3.5 w-3.5" /> Pause</>
                            )}
                          </button>
                        ) : kind === 'recurring' ? (
                          <span className="text-[11px] text-gray-400 flex-shrink-0 pt-1">Not linked yet</span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <Link
              href={mapAddHref}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#193434] hover:opacity-80"
            >
              <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
              Add stop on map
            </Link>
          </div>
        </section>

        {/* Calendar */}
        <section>
          <RoundOccurrenceCalendar
            roundId={round.id}
            assignedUserId={round.assigned_user_id}
            hasStops={round.stops.length > 0}
            schedule={{
              schedule_kind: round.schedule_kind,
              recurrence_type: round.recurrence_type,
              day_of_week: round.day_of_week,
              day_of_month: round.day_of_month,
              interval_value: round.interval_value,
              starting_date: round.starting_date,
            }}
            onPlaced={() => void load()}
            onOpenPlacedDay={day => setOpenDay(day)}
            manageDay={manageDay}
            onManageDayHandled={() => setManageDay(null)}
          />
        </section>
      </div>
    </div>
  )
}
