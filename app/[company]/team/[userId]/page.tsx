'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '../../../components/AppLayout'
import { apiUrl } from '../../../utils/api'
import AddressSearchInput from '../../../components/AddressSearchInput'
import AddLeaveModal from '../../../components/AddLeaveModal'
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

type LeaveType = 'full_day' | 'half_day_morning' | 'half_day_afternoon' | 'custom_hours'
type LeaveCategory = 'holiday' | 'sick' | 'personal' | 'public_holiday' | 'other'

interface LeaveEntry {
  id: number
  leave_date: string   // 'YYYY-MM-DD'
  leave_type: LeaveType
  hours_off: number | null
  category: LeaveCategory
  note: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_HOURS = {
  monday_hours: 7.5, tuesday_hours: 7.5, wednesday_hours: 7.5,
  thursday_hours: 7.5, friday_hours: 7.0, saturday_hours: 0, sunday_hours: 0,
}

const CATEGORY_META: Record<LeaveCategory, { color: string; bg: string; border: string }> = {
  holiday:       { color: '#3DD57A', bg: '#F0FDF4', border: '#BBF7D0' },
  sick:          { color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
  personal:      { color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE' },
  public_holiday:{ color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE' },
  other:         { color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
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

  const [hours, setHours] = useState(DEFAULT_HOURS)

  const [location, setLocation] = useState<LocationSettings>({
    start_address: '', end_address: '', use_company_default_location: true,
  })
  const [locationSaving, setLocationSaving] = useState(false)
  const [locationSaved, setLocationSaved] = useState(false)
  const [locationError, setLocationError] = useState('')

  const [hoursSaving, setHoursSaving] = useState(false)
  const [hoursSaved, setHoursSaved] = useState(false)
  const [hoursError, setHoursError] = useState('')

  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([])
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }
  })

  // Modal state — date/existing populated when clicking a calendar day
  const [leaveModal, setLeaveModal] = useState<{
    open: boolean; date: string; existing: LeaveEntry | null
  }>({ open: false, date: '', existing: null })

  const [loading, setLoading] = useState(true)

  // Fetch a wide window of leave (±6 months) so calendar can show it all
  const fetchLeave = useCallback(async () => {
    const token = localStorage.getItem('token')
    const now = new Date()
    const from = `${now.getFullYear()}-01-01`
    const to   = `${now.getFullYear() + 1}-12-31`
    const res = await fetch(apiUrl(`/employee-leave/${userId}?from=${from}&to=${to}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) { const d = await res.json(); setLeaveEntries(d.leave || []) }
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
        const d = await hoursRes.json(); const wh = d.workHours
        setHours({
          monday_hours:    parseFloat(wh.monday_hours)    || 7.5,
          tuesday_hours:   parseFloat(wh.tuesday_hours)   || 7.5,
          wednesday_hours: parseFloat(wh.wednesday_hours) || 7.5,
          thursday_hours:  parseFloat(wh.thursday_hours)  || 7.5,
          friday_hours:    parseFloat(wh.friday_hours)    || 7.0,
          saturday_hours:  parseFloat(wh.saturday_hours)  || 0,
          sunday_hours:    parseFloat(wh.sunday_hours)    || 0,
        })
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

  useEffect(() => { fetchAll(); fetchLeave() }, [fetchAll, fetchLeave])

  const saveHours = async () => {
    setHoursSaving(true); setHoursError(''); setHoursSaved(false)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/work-hours/${userId}`), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workHours: hours,
          start_address: location.start_address, end_address: location.end_address,
          use_company_default_location: location.use_company_default_location,
        }),
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
        body: JSON.stringify({
          workHours: hours,
          start_address: location.start_address, end_address: location.end_address,
          use_company_default_location: location.use_company_default_location,
        }),
      })
      if (!res.ok) { const d = await res.json(); setLocationError(d.error || t('app.teamMember.errSave', 'Failed to save')) }
      else { setLocationSaved(true); setTimeout(() => setLocationSaved(false), 2500) }
    } catch { setLocationError(t('app.teamMember.errNetwork', 'Network error')) } finally { setLocationSaving(false) }
  }

  // ── Leave actions ──────────────────────────────────────────────────────────

  const openLeaveModal = (dateStr: string) => {
    const existing = leaveEntries.find(e => e.leave_date === dateStr) || null
    setLeaveModal({ open: true, date: dateStr, existing })
  }

  const leaveByDate = Object.fromEntries(leaveEntries.map(e => [e.leave_date, e]))

  // ── Upcoming leave list (future entries) ──────────────────────────────────
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcomingLeave = leaveEntries.filter(e => new Date(e.leave_date + 'T00:00:00') >= today)
  const pastLeave = leaveEntries.filter(e => new Date(e.leave_date + 'T00:00:00') < today).slice(-5).reverse()

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
          title={t('app.teamMember.workHours', 'Work hours')}
          subtitle={t('app.teamMember.workHoursHelp', 'Weekly working hours used for capacity planning')}
        >
          <div className="space-y-2">
            {([
              { key: 'monday_hours',    label: t('app.day.monday', 'Monday') },
              { key: 'tuesday_hours',   label: t('app.day.tuesday', 'Tuesday') },
              { key: 'wednesday_hours', label: t('app.day.wednesday', 'Wednesday') },
              { key: 'thursday_hours',  label: t('app.day.thursday', 'Thursday') },
              { key: 'friday_hours',    label: t('app.day.friday', 'Friday') },
              { key: 'saturday_hours',  label: t('app.day.saturday', 'Saturday') },
              { key: 'sunday_hours',    label: t('app.day.sunday', 'Sunday') },
            ] as { key: keyof typeof hours; label: string }[]).map(({ key, label }) => {
              const val = hours[key]
              const isOff = val === 0
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className={`w-24 text-sm font-medium flex-shrink-0 ${isOff ? 'text-gray-400' : 'text-gray-700'}`}>
                    {label}
                  </span>
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="range"
                      min={0} max={12} step={0.5}
                      value={val}
                      onChange={e => setHours(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                      className="flex-1 accent-accent-500 h-1.5 rounded-full cursor-pointer"
                    />
                    <div className="relative w-16 flex-shrink-0">
                      <input
                        type="number"
                        min={0} max={12} step={0.5}
                        value={val}
                        onChange={e => {
                          const n = Math.min(12, Math.max(0, parseFloat(e.target.value) || 0))
                          setHours(prev => ({ ...prev, [key]: n }))
                        }}
                        className="w-full pr-5 pl-2 py-1.5 text-sm text-right border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">h</span>
                    </div>
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${isOff ? 'bg-gray-200' : 'bg-accent-400'}`}
                      title={isOff ? t('app.teamMember.dayOff', 'Day off') : `${val}h ${t('app.teamMember.workingDay', 'working day')}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {t('app.teamMember.total', 'Total:')} <span className="font-semibold text-gray-600">
                {Object.values(hours).reduce((s, v) => s + v, 0).toFixed(1)}h / {t('app.teamMember.week', 'week')}
              </span>
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

        {/* ── Section 2: Time Off & Leave ───────────────────────────────── */}
        <SectionCard
          icon={<CalendarIcon />}
          iconBg="bg-orange-50"
          iconColor="text-orange-500"
          title={t('app.teamMember.timeOffTitle', 'Time off & leave')}
          subtitle={t('app.teamMember.timeOffSubtitle', 'Manage holidays, sick days, and absences')}
          extra={
            <div className="flex items-center gap-2">
              {upcomingLeave.length > 0 && (
                <span className="text-xs font-semibold text-orange-500 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full">
                  {upcomingLeave.length} {t('app.teamMember.upcoming', 'upcoming')}
                </span>
              )}
              <button
                onClick={() => setLeaveModal({ open: true, date: new Date().toISOString().split('T')[0], existing: null })}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
                style={{ background: '#3DD57A', color: '#0A1A0A', boxShadow: '0 2px 8px rgba(61,213,122,0.2)' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                {t('app.teamMember.add', 'Add')}
              </button>
            </div>
          }
        >
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-5">
            {(Object.entries(CATEGORY_META) as [LeaveCategory, typeof CATEGORY_META[LeaveCategory]][]).map(([key, meta]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                <span className="text-xs text-gray-500">{t(`app.teamMember.leaveCategory.${key}`, key)}</span>
              </div>
            ))}
          </div>

          {/* Calendar */}
          <LeaveCalendar
            year={calendarMonth.year}
            month={calendarMonth.month}
            leaveByDate={leaveByDate}
            onDayClick={openLeaveModal}
            locale={locale}
            t={t}
            onPrev={() => setCalendarMonth(m => {
              const d = new Date(m.year, m.month - 1, 1)
              return { year: d.getFullYear(), month: d.getMonth() }
            })}
            onNext={() => setCalendarMonth(m => {
              const d = new Date(m.year, m.month + 1, 1)
              return { year: d.getFullYear(), month: d.getMonth() }
            })}
          />

          {/* Upcoming leave list */}
          {upcomingLeave.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{t('app.teamMember.upcoming', 'Upcoming')}</p>
              <div className="space-y-2">
                {upcomingLeave.map(entry => (
                  <LeaveRow key={entry.id} entry={entry} onClick={() => openLeaveModal(entry.leave_date)} locale={locale} t={t} />
                ))}
              </div>
            </div>
          )}

          {/* Past leave */}
          {pastLeave.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{t('app.teamMember.recentPast', 'Recent past')}</p>
              <div className="space-y-2 opacity-60">
                {pastLeave.map(entry => (
                  <LeaveRow key={entry.id} entry={entry} onClick={() => openLeaveModal(entry.leave_date)} locale={locale} t={t} />
                ))}
              </div>
            </div>
          )}

          {upcomingLeave.length === 0 && pastLeave.length === 0 && (
            <div className="mt-4 text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
              <p className="text-sm text-gray-400">{t('app.teamMember.noLeave', 'No leave recorded. Click any day on the calendar to add.')}</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Leave Modal ─────────────────────────────────────────────────── */}
      {leaveModal.open && (
        <AddLeaveModal
          preselectedUserId={Number(userId)}
          preselectedDate={leaveModal.date || undefined}
          existingLeave={leaveModal.existing ?? undefined}
          onClose={() => setLeaveModal({ open: false, date: '', existing: null })}
          onSaved={async () => { await fetchLeave(); setLeaveModal({ open: false, date: '', existing: null }) }}
        />
      )}
    </AppLayout>
  )
}

// ─── Calendar ────────────────────────────────────────────────────────────────

function LeaveCalendar({
  year, month, leaveByDate, onDayClick, onPrev, onNext, locale, t,
}: {
  year: number; month: number; leaveByDate: Record<string, LeaveEntry>
  onDayClick: (date: string) => void; onPrev: () => void; onNext: () => void
  locale: string
  t: (key: string, fallback?: string) => string
}) {
  const monthNames = Array.from({ length: 12 }).map((_, i) =>
    new Date(2000, i, 1).toLocaleDateString(locale === 'da' ? 'da-DK' : 'en-US', { month: 'long' })
  )
  const today = new Date(); today.setHours(0,0,0,0)
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7  // Mon=0
  const totalDays = lastDay.getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const fmt = (d: number) => `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`

  return (
    <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
      {/* Month nav */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <button
          onClick={onPrev}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-900">{monthNames[month]} {year}</span>
        <button
          onClick={onNext}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {[
          t('app.day.short.monday', 'Mon'),
          t('app.day.short.tuesday', 'Tue'),
          t('app.day.short.wednesday', 'Wed'),
          t('app.day.short.thursday', 'Thu'),
          t('app.day.short.friday', 'Fri'),
          t('app.day.short.saturday', 'Sat'),
          t('app.day.short.sunday', 'Sun'),
        ].map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-400">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 p-2 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = fmt(day)
          const entry = leaveByDate[dateStr]
          const isToday = new Date(dateStr + 'T00:00:00').getTime() === today.getTime()
          const isPast  = new Date(dateStr + 'T00:00:00') < today
          const meta    = entry ? CATEGORY_META[entry.category] : null

          return (
            <button
              key={i}
              onClick={() => onDayClick(dateStr)}
              className={`
                relative aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-medium
                transition-all hover:scale-105
                ${entry
                  ? 'text-white shadow-sm'
                  : isPast
                    ? 'text-gray-300 hover:bg-gray-100 hover:text-gray-600'
                    : 'text-gray-700 hover:bg-white hover:shadow-sm'
                }
                ${isToday && !entry ? 'ring-2 ring-accent-400 text-accent-600 font-bold' : ''}
              `}
              style={entry ? { background: meta?.color } : undefined}
              title={entry
                ? `${t(`app.teamMember.leaveCategory.${entry.category}`, entry.category)} - ${t(`app.teamMember.leaveType.${entry.leave_type}`, entry.leave_type)}${entry.note ? `: ${entry.note}` : ''}`
                : t('app.teamMember.clickAddLeave', 'Click to add leave')}
            >
              {day}
              {entry && entry.leave_type !== 'full_day' && (
                <span className="absolute bottom-1 left-0 right-0 text-center text-[7px] font-bold opacity-80 leading-none">
                  {entry.leave_type === 'half_day_morning' ? '½AM' :
                   entry.leave_type === 'half_day_afternoon' ? '½PM' :
                   entry.hours_off ? `${entry.hours_off}h` : ''}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Leave list row ───────────────────────────────────────────────────────────

function LeaveRow({
  entry,
  onClick,
  locale,
  t,
}: {
  entry: LeaveEntry
  onClick: () => void
  locale: string
  t: (key: string, fallback?: string) => string
}) {
  const meta = CATEGORY_META[entry.category]
  const d = new Date(entry.leave_date + 'T00:00:00')
  const dateLabel = d.toLocaleDateString(locale === 'da' ? 'da-DK' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm group text-left"
      style={{ background: meta.bg, borderColor: meta.border }}
    >
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{dateLabel}</p>
        <p className="text-xs text-gray-500">
          {t(`app.teamMember.leaveCategory.${entry.category}`, entry.category)} · {t(`app.teamMember.leaveType.${entry.leave_type}`, entry.leave_type)}
          {entry.leave_type === 'custom_hours' && entry.hours_off ? ` (${entry.hours_off}h)` : ''}
          {entry.note ? ` · ${entry.note}` : ''}
        </p>
      </div>
      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
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
