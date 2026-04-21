'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '../../../components/AppLayout'
import { apiUrl } from '../../../utils/api'
import AddressSearchInput from '../../../components/AddressSearchInput'
import { useAppI18n } from '../../../components/I18nProvider'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id: number
  first_name: string
  last_name: string
  email: string
  role: string
  created_at: string
}

interface LocationSettings {
  start_address: string; end_address: string; use_company_default_location: boolean
}

type WorkHoursMode = 'fixed' | 'flexible'

interface DaySchedule {
  start: string         // 'HH:MM'
  end: string           // 'HH:MM'
  breakMinutes: number  // minutes
  hours: number         // flexible mode total per day
  off: boolean          // computed: no hours/time at all
}

type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

interface AppointmentRow {
  id: number
  user_id: number
  title: string
  category: 'personal' | 'meeting' | 'sick' | 'vacation' | 'other'
  appointment_date: string
  time_mode: 'span' | 'hours' | 'all_day'
  start_time: string | null
  end_time: string | null
  hours_off: number | null
  status: 'requested' | 'approved'
  notes: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WEEKDAYS: Array<{ key: Weekday; labelKey: string; short: string }> = [
  { key: 'monday',    labelKey: 'app.day.monday',    short: 'Mon' },
  { key: 'tuesday',   labelKey: 'app.day.tuesday',   short: 'Tue' },
  { key: 'wednesday', labelKey: 'app.day.wednesday', short: 'Wed' },
  { key: 'thursday',  labelKey: 'app.day.thursday',  short: 'Thu' },
  { key: 'friday',    labelKey: 'app.day.friday',    short: 'Fri' },
  { key: 'saturday',  labelKey: 'app.day.saturday',  short: 'Sat' },
  { key: 'sunday',    labelKey: 'app.day.sunday',    short: 'Sun' },
]

const DEFAULT_FIXED: Record<Weekday, DaySchedule> = {
  monday:    { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  tuesday:   { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  wednesday: { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  thursday:  { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  friday:    { start: '08:00', end: '15:30', breakMinutes: 30, hours: 7.0, off: false },
  saturday:  { start: '08:00', end: '16:00', breakMinutes: 0,  hours: 0,   off: true  },
  sunday:    { start: '08:00', end: '16:00', breakMinutes: 0,  hours: 0,   off: true  },
}

const APPT_CATEGORY_COLORS: Record<AppointmentRow['category'], { bg: string; border: string; text: string }> = {
  personal: { bg: '#EEF2FF', border: '#C7D2FE', text: '#4338CA' },
  meeting:  { bg: '#ECFEFF', border: '#A5F3FC', text: '#0E7490' },
  sick:     { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
  vacation: { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
  other:    { bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' },
}

const AVATAR_COLORS = ['#3DD57A','#FF6B6B','#4ECDC4','#45B7D1','#F4A261','#E76F51','#7B2D8B','#2196F3']
const avatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length]

function roleBadge(role: string, t: (key: string, fallback?: string) => string) {
  switch (role) {
    case 'owner': case 'company-owner': return { label: t('app.role.owner', 'Owner'), cls: 'bg-purple-50 text-purple-700 border border-purple-200' }
    case 'manager': return { label: t('app.role.manager', 'Manager'), cls: 'bg-blue-50 text-blue-700 border border-blue-200' }
    default: return { label: t('app.role.employee', 'Employee'), cls: 'bg-gray-100 text-gray-600 border border-gray-200' }
  }
}

// Given HH:MM start, HH:MM end and break minutes, produce net work hours.
// Returns 0 when end <= start so we never emit negative durations.
function computeNetHours(start: string, end: string, breakMinutes: number): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map((x) => parseInt(x, 10))
  const [eh, em] = end.split(':').map((x) => parseInt(x, 10))
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return 0
  const mins = (eh * 60 + em) - (sh * 60 + sm) - (breakMinutes || 0)
  return Math.max(0, mins / 60)
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function EmployeeSettingsPage() {
  const { t, locale } = useAppI18n()
  const router = useRouter()
  const params = useParams()
  const company = params?.company as string
  const userId = params?.userId as string

  const [member, setMember] = useState<Member | null>(null)
  const [companyDefaultStart, setCompanyDefaultStart] = useState('')
  const [companyDefaultEnd, setCompanyDefaultEnd] = useState('')
  const [routeLocationsEnabled, setRouteLocationsEnabled] = useState(true)

  // Work hours model: a mode toggle + one DaySchedule per weekday. Fixed mode
  // uses start/end/break; flexible mode uses `hours` only. We always keep both
  // around so flipping between modes never loses user input.
  const [workHoursMode, setWorkHoursMode] = useState<WorkHoursMode>('fixed')
  const [schedule, setSchedule] = useState<Record<Weekday, DaySchedule>>(DEFAULT_FIXED)

  const [location, setLocation] = useState<LocationSettings>({
    start_address: '', end_address: '', use_company_default_location: true,
  })
  const [locationSaving, setLocationSaving] = useState(false)
  const [locationSaved, setLocationSaved] = useState(false)
  const [locationError, setLocationError] = useState('')

  const [hoursSaving, setHoursSaving] = useState(false)
  const [hoursSaved, setHoursSaved] = useState(false)
  const [hoursError, setHoursError] = useState('')

  const [appointments, setAppointments] = useState<AppointmentRow[]>([])

  const [loading, setLoading] = useState(true)

  // Pull appointments (all statuses) for this user. We keep the window tight
  // because this section is meant to be glanceable, not a full calendar.
  const fetchAppointments = useCallback(async () => {
    const token = localStorage.getItem('token')
    const today = new Date()
    const from = new Date(today); from.setDate(today.getDate() - 7)
    const to   = new Date(today); to.setDate(today.getDate() + 90)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const res = await fetch(
      apiUrl(`/appointments?user_id=${userId}&from=${fmt(from)}&to=${fmt(to)}`),
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.ok) {
      const d = await res.json()
      setAppointments(d.appointments || [])
    }
  }, [userId])

  const fetchAll = useCallback(async () => {
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }
    setLoading(true)
    try {
      const [usersRes, hoursRes, companyRes] = await Promise.all([
        fetch(apiUrl('/users'), { headers }),
        fetch(apiUrl(`/work-hours/${userId}`), { headers }),
        fetch(apiUrl('/companies/profile'), { headers }),
      ])
      if (usersRes.ok) {
        const d = await usersRes.json()
        setMember((d.users || []).find((u: Member) => String(u.id) === String(userId)) || null)
      }
      if (hoursRes.ok) {
        const d = await hoursRes.json()
        const wh = d.workHours || {}
        const mode: WorkHoursMode = wh.work_hours_mode === 'flexible' ? 'flexible' : 'fixed'
        setWorkHoursMode(mode)
        const next: Record<Weekday, DaySchedule> = { ...DEFAULT_FIXED }
        for (const { key } of WEEKDAYS) {
          const rawHours = wh[`${key}_hours`]
          const hours = rawHours != null && rawHours !== '' ? parseFloat(String(rawHours)) : DEFAULT_FIXED[key].hours
          const start = (wh[`${key}_start`] || DEFAULT_FIXED[key].start || '').slice(0, 5)
          const end   = (wh[`${key}_end`]   || DEFAULT_FIXED[key].end   || '').slice(0, 5)
          const brk   = wh[`${key}_break_minutes`] != null ? Number(wh[`${key}_break_minutes`]) : DEFAULT_FIXED[key].breakMinutes
          next[key] = {
            start: start || '08:00',
            end: end || '16:00',
            breakMinutes: Number.isFinite(brk) ? brk : 0,
            hours: Number.isFinite(hours) ? hours : 0,
            off: mode === 'fixed'
              ? computeNetHours(start || '08:00', end || '16:00', brk || 0) === 0
              : !hours,
          }
        }
        setSchedule(next)
        setLocation({
          start_address:               wh.start_address  || '',
          end_address:                 wh.end_address    || '',
          use_company_default_location: wh.use_company_default_location !== false,
        })
      }
      if (companyRes.ok) {
        const d = await companyRes.json()
        setCompanyDefaultStart(d.company?.defaultStartAddress || '')
        setCompanyDefaultEnd(d.company?.defaultEndAddress || '')
        setRouteLocationsEnabled(d.company?.routeLocationsEnabled !== false)
      }
    } finally { setLoading(false) }
  }, [userId])

  useEffect(() => { fetchAll(); fetchAppointments() }, [fetchAll, fetchAppointments])

  // Build a single payload that works for both modes. The backend derives
  // [day]_hours from start/end/break when mode === 'fixed', but we send both
  // so the UI can fall back gracefully if the user flips modes on the server.
  const buildWorkHoursPayload = () => {
    const payload: Record<string, unknown> = {
      work_hours_mode: workHoursMode,
      start_address: location.start_address,
      end_address: location.end_address,
      use_company_default_location: location.use_company_default_location,
    }
    for (const { key } of WEEKDAYS) {
      const d = schedule[key]
      if (workHoursMode === 'fixed') {
        payload[`${key}_start`] = d.off ? null : d.start
        payload[`${key}_end`] = d.off ? null : d.end
        payload[`${key}_break_minutes`] = d.off ? 0 : Math.max(0, d.breakMinutes || 0)
        payload[`${key}_hours`] = d.off ? 0 : computeNetHours(d.start, d.end, d.breakMinutes)
      } else {
        payload[`${key}_hours`] = d.off ? 0 : Math.max(0, d.hours || 0)
        payload[`${key}_start`] = null
        payload[`${key}_end`] = null
        payload[`${key}_break_minutes`] = 0
      }
    }
    // Also include the legacy `workHours` bag so older server builds keep working.
    const workHours: Record<string, number> = {}
    for (const { key } of WEEKDAYS) {
      const d = schedule[key]
      workHours[`${key}_hours`] = d.off
        ? 0
        : workHoursMode === 'fixed'
          ? computeNetHours(d.start, d.end, d.breakMinutes)
          : Math.max(0, d.hours || 0)
    }
    payload.workHours = workHours
    return payload
  }

  const saveHours = async () => {
    setHoursSaving(true); setHoursError(''); setHoursSaved(false)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/work-hours/${userId}`), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWorkHoursPayload()),
      })
      if (!res.ok) { const d = await res.json(); setHoursError(d.error || t('app.teamMember.errSave', 'Failed to save')) }
      else { setHoursSaved(true); setTimeout(() => setHoursSaved(false), 2500) }
    } catch { setHoursError(t('app.teamMember.errNetwork', 'Network error')) } finally { setHoursSaving(false) }
  }

  const saveLocation = async () => {
    setLocationSaving(true); setLocationError(''); setLocationSaved(false)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/work-hours/${userId}`), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWorkHoursPayload()),
      })
      if (!res.ok) { const d = await res.json(); setLocationError(d.error || t('app.teamMember.errSave', 'Failed to save')) }
      else { setLocationSaved(true); setTimeout(() => setLocationSaved(false), 2500) }
    } catch { setLocationError(t('app.teamMember.errNetwork', 'Network error')) } finally { setLocationSaving(false) }
  }

  // Copy Monday's values to Tue-Fri as a quick starting point.
  const copyMondayToWeekdays = () => {
    setSchedule((prev) => {
      const mon = prev.monday
      const next = { ...prev }
      for (const key of ['tuesday', 'wednesday', 'thursday', 'friday'] as Weekday[]) {
        next[key] = { ...mon }
      }
      return next
    })
  }

  const setDay = (key: Weekday, patch: Partial<DaySchedule>) => {
    setSchedule((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  const totalWeekHours = useMemo(() => {
    let total = 0
    for (const { key } of WEEKDAYS) {
      const d = schedule[key]
      if (d.off) continue
      total += workHoursMode === 'fixed'
        ? computeNetHours(d.start, d.end, d.breakMinutes)
        : d.hours
    }
    return total
  }, [schedule, workHoursMode])

  // Upcoming appointments: future entries only, sorted by date ascending.
  const upcomingAppointments = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return appointments
      .filter((a) => new Date(a.appointment_date + 'T00:00:00') >= today)
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))
  }, [appointments])

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
        </div>
      </AppLayout>
    )
  }

  if (!member) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-gray-500">{t('app.teamMember.notFound', 'Team member not found.')}</p>
          <button onClick={() => router.push(`/${company}/team`)} className="mt-4 text-accent-600 text-sm font-medium hover:underline">
            {t('app.teamMember.backToTeam', '<- Back to team')}
          </button>
        </div>
      </AppLayout>
    )
  }

  const color = avatarColor(member.id)
  const badge = roleBadge(member.role, t)
  const initials = `${member.first_name[0] ?? ''}${member.last_name[0] ?? ''}`.toUpperCase()

  return (
    <AppLayout>
      <div className="max-w-3xl">

        {/* Back */}
        <button
          onClick={() => router.push(`/${company}/team`)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('app.nav.team', 'Team')}
        </button>

        {/* Member header */}
        <div className="flex items-center gap-5 mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ background: color, boxShadow: `0 8px 24px ${color}40` }}
          >
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{member.first_name} {member.last_name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{member.email}</p>
            <span className={`mt-1.5 inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        </div>

        {/* ── Section 1: Work Hours ─────────────────────────────────────── */}
        <SectionCard
          icon={<ClockIcon />}
          iconBg="bg-accent-50"
          iconColor="text-accent-600"
          title={t('app.workHours.title', 'Work hours')}
          subtitle={t('app.workHours.subtitle', 'Planning template used to calculate daily capacity')}
        >
          {/* Mode toggle */}
          <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
            <div className="inline-flex bg-gray-100 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setWorkHoursMode('fixed')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  workHoursMode === 'fixed'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('app.workHours.modeFixed', 'Fixed hours')}
              </button>
              <button
                type="button"
                onClick={() => setWorkHoursMode('flexible')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  workHoursMode === 'flexible'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('app.workHours.modeFlexible', 'Flexible hours')}
              </button>
            </div>
            <button
              type="button"
              onClick={copyMondayToWeekdays}
              className="text-xs font-medium text-accent-600 hover:text-accent-700 hover:bg-accent-50 px-2.5 py-1.5 rounded-lg transition-colors"
              title={t('app.workHours.copyMondayHelp', "Apply Monday's values to Tue-Fri")}
            >
              {t('app.workHours.copyMonday', 'Copy Monday to weekdays')}
            </button>
          </div>

          {/* Mode hint */}
          <div className="mb-4 text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
            {workHoursMode === 'fixed'
              ? t('app.workHours.fixedHint', 'Fixed schedule: employee starts and ends at the same time each weekday. Good for route planning.')
              : t('app.workHours.flexibleHint', 'Flexible schedule: employee has a daily hour budget without fixed clock times. Good for contractors.')}
          </div>

          {/* Per-day rows */}
          <div className="space-y-2">
            {WEEKDAYS.map(({ key, labelKey }) => {
              const d = schedule[key]
              const netH = workHoursMode === 'fixed'
                ? computeNetHours(d.start, d.end, d.breakMinutes)
                : d.hours
              return (
                <div
                  key={key}
                  className={`flex flex-wrap items-center gap-2 py-2 px-3 rounded-xl border ${
                    d.off ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100'
                  }`}
                >
                  <span className={`w-24 text-sm font-medium flex-shrink-0 ${d.off ? 'text-gray-400' : 'text-gray-800'}`}>
                    {t(labelKey, key)}
                  </span>

                  {/* Off toggle */}
                  <button
                    type="button"
                    onClick={() => setDay(key, { off: !d.off })}
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors ${
                      d.off
                        ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        : 'bg-accent-50 text-accent-700 hover:bg-accent-100'
                    }`}
                  >
                    {d.off ? t('app.workHours.dayOff', 'Off') : t('app.workHours.dayOn', 'Working')}
                  </button>

                  {!d.off && workHoursMode === 'fixed' && (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-gray-400">{t('app.workHours.start', 'Start')}</span>
                        <input
                          type="time"
                          value={d.start}
                          onChange={(e) => setDay(key, { start: e.target.value })}
                          className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-gray-400">{t('app.workHours.end', 'End')}</span>
                        <input
                          type="time"
                          value={d.end}
                          onChange={(e) => setDay(key, { end: e.target.value })}
                          className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-gray-400">{t('app.workHours.break', 'Break')}</span>
                        <input
                          type="number"
                          min={0}
                          max={480}
                          step={5}
                          value={d.breakMinutes}
                          onChange={(e) => {
                            const n = Math.max(0, Math.min(480, parseInt(e.target.value || '0', 10) || 0))
                            setDay(key, { breakMinutes: n })
                          }}
                          className="w-16 text-sm text-right border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                        />
                        <span className="text-[11px] text-gray-400">{t('app.workHours.minShort', 'min')}</span>
                      </div>
                    </>
                  )}

                  {!d.off && workHoursMode === 'flexible' && (
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-gray-400">{t('app.workHours.hours', 'Hours')}</span>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        value={d.hours}
                        onChange={(e) => {
                          const n = Math.max(0, Math.min(24, parseFloat(e.target.value) || 0))
                          setDay(key, { hours: n })
                        }}
                        className="w-20 text-sm text-right border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                      />
                      <span className="text-[11px] text-gray-400">h</span>
                    </div>
                  )}

                  {/* Net hours summary pushed to the right */}
                  <span className="ml-auto text-[11px] font-semibold text-gray-600 tabular-nums">
                    {d.off ? '—' : `${netH.toFixed(1)} h`}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {t('app.workHours.total', 'Weekly total:')}{' '}
              <span className="font-semibold text-gray-600">{totalWeekHours.toFixed(1)} h</span>
            </p>
            <div className="flex items-center gap-3">
              {hoursError && <p className="text-sm text-red-600">{hoursError}</p>}
              <SaveButton saving={hoursSaving} saved={hoursSaved} onClick={saveHours} t={t} />
            </div>
          </div>
        </SectionCard>

        {/* ── Section 2: Route Locations (only when company has feature on) ── */}
        <SectionCard
          icon={<MapPinIcon />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          title={t('app.teamMember.routeLocations', 'Route locations')}
          subtitle={t('app.teamMember.routeLocationsHelp', 'Start and end point for daily routes')}
        >
          {!routeLocationsEnabled ? (
            <div className="py-4 px-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-800 font-medium">{t('app.teamMember.routeDisabledTitle', 'Start & end locations are disabled')}</p>
              <p className="text-xs text-amber-700 mt-1">{t('app.teamMember.routeDisabledHelp', 'Your company has turned off this feature. An admin can enable it in Settings -> Business.')}</p>
            </div>
          ) : (
            <>
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={location.use_company_default_location}
                onChange={e => setLocation(prev => ({ ...prev, use_company_default_location: e.target.checked }))}
                className="sr-only"
              />
              <div className={`w-10 h-6 rounded-full transition-colors ${location.use_company_default_location ? 'bg-accent-500' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${location.use_company_default_location ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{t('app.teamMember.useCompanyDefault', 'Use company default')}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {companyDefaultStart
                  ? `${t('app.teamMember.startsAt', 'Starts at:')} ${companyDefaultStart}`
                  : t('app.teamMember.noCompanyDefault', 'No company default set - configure in Business Settings')}
              </p>
            </div>
          </label>

          {!location.use_company_default_location && (
            <div className="space-y-4 mt-4">
              <AddressSearchInput
                label={t('app.teamMember.startLocation', 'Start location')}
                dotColor="#3DD57A"
                value={location.start_address}
                onChange={v => setLocation(prev => ({ ...prev, start_address: v }))}
                placeholder={t('app.teamMember.searchStartAddress', 'Search for a start address...')}
              />
              <AddressSearchInput
                label={t('app.teamMember.endLocation', 'End location')}
                dotColor="#F87171"
                value={location.end_address}
                onChange={v => setLocation(prev => ({ ...prev, end_address: v }))}
                placeholder={t('app.teamMember.leaveEmptyUseStart', 'Leave empty to use start location')}
              />
              <p className="text-[11px] text-gray-400">{t('app.teamMember.endLocationHelp', 'If end location is empty, the route ends at the start location.')}</p>
            </div>
          )}

          {location.use_company_default_location && (companyDefaultStart || companyDefaultEnd) && (
            <div className="mt-4 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-2">
              {companyDefaultStart && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-accent-500 flex-shrink-0" />
                  <span className="text-gray-400 w-10">{t('app.teamMember.start', 'Start')}</span>
                  <span>{companyDefaultStart}</span>
                </div>
              )}
              {companyDefaultEnd && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                  <span className="text-gray-400 w-10">{t('app.teamMember.end', 'End')}</span>
                  <span>{companyDefaultEnd}</span>
                </div>
              )}
            </div>
          )}

          {locationError && <p className="mt-3 text-sm text-red-600">{locationError}</p>}
          <div className="flex justify-end mt-4">
            <SaveButton saving={locationSaving} saved={locationSaved} onClick={saveLocation} t={t} />
          </div>
            </>
          )}
        </SectionCard>

        {/* ── Section 3: Upcoming appointments (read-only) ─────────────── */}
        <SectionCard
          icon={<CalendarIcon />}
          iconBg="bg-orange-50"
          iconColor="text-orange-500"
          title={t('app.appointments.upcoming', 'Upcoming appointments')}
          subtitle={t('app.appointments.upcomingSubtitle', 'Appointments, time off and leave. Add them from the jobs page.')}
          extra={
            <button
              type="button"
              onClick={() => router.push(`/${company}/jobs`)}
              className="text-xs font-semibold text-accent-700 hover:text-accent-800 hover:underline"
            >
              {t('app.appointments.goToJobs', 'Go to jobs')}
            </button>
          }
        >
          {upcomingAppointments.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-xl">
              <p className="text-sm text-gray-400">
                {t('app.appointments.emptyForMember', 'No upcoming appointments.')}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                {t('app.appointments.addFromJobs', 'Open the jobs page and use + to add one.')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingAppointments.slice(0, 10).map((a) => (
                <AppointmentRowView key={a.id} a={a} locale={locale} t={t} />
              ))}
              {upcomingAppointments.length > 10 && (
                <p className="text-xs text-gray-400 text-center pt-2">
                  {t('app.appointments.moreCount', 'and {{n}} more').replace(
                    '{{n}}',
                    String(upcomingAppointments.length - 10),
                  )}
                </p>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </AppLayout>
  )
}

// ─── Appointment row (read-only) ─────────────────────────────────────────────

function AppointmentRowView({
  a,
  locale,
  t,
}: {
  a: AppointmentRow
  locale: string
  t: (key: string, fallback?: string) => string
}) {
  const meta = APPT_CATEGORY_COLORS[a.category]
  const d = new Date(a.appointment_date + 'T00:00:00')
  const dateLabel = d.toLocaleDateString(locale === 'da' ? 'da-DK' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const isPending = a.status === 'requested'

  let timeLabel = ''
  if (a.time_mode === 'span' && a.start_time && a.end_time) {
    timeLabel = `${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}`
  } else if (a.time_mode === 'hours' && a.hours_off) {
    timeLabel = `${Number(a.hours_off).toFixed(1)} h`
  } else if (a.time_mode === 'all_day') {
    timeLabel = t('app.appointments.allDay', 'All day')
  }

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border ${isPending ? 'border-dashed' : ''}`}
      style={{ background: isPending ? '#ffffff' : meta.bg, borderColor: meta.border }}
    >
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: meta.text }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
          {isPending && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">
              {t('app.appointments.requestBadge', 'Request')}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          {dateLabel}
          {timeLabel && ` · ${timeLabel}`}
          {' · '}
          {t(`app.appointments.cat.${a.category}`, a.category)}
        </p>
      </div>
    </div>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────

function SectionCard({ icon, iconBg, iconColor, title, subtitle, extra, children }: {
  icon: React.ReactNode; iconBg: string; iconColor: string
  title: string; subtitle: string; extra?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl mb-4">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center`}>
            <span className={iconColor}>{icon}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-[11px] text-gray-400">{subtitle}</p>
          </div>
        </div>
        {extra}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function SaveButton({
  saving,
  saved,
  onClick,
  t,
}: {
  saving: boolean
  saved: boolean
  onClick: () => void
  t: (key: string, fallback?: string) => string
}) {
  return (
    <button
      type="button"
      onClick={onClick} disabled={saving}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
      style={{
        background: saved ? '#10b981' : '#3DD57A',
        color: saved ? '#fff' : '#0A1A0A',
        boxShadow: saved ? '0 0 16px rgba(16,185,129,0.25)' : '0 2px 12px rgba(61,213,122,0.2)',
      }}
    >
      {saving ? (
        <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>{t('app.common.saving', 'Saving...')}</>
      ) : saved ? (
        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>{t('app.teamMember.saved', 'Saved')}</>
      ) : t('settings.business.save', 'Save changes')}
    </button>
  )
}

// Inline SVG icons
const MapPinIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 3" />
  </svg>
)
