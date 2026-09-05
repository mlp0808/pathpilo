'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '../../../components/AppLayout'
import ProFeatureGate from '../../../components/ProFeatureGate'
import { apiUrl } from '../../../utils/api'
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

// ─── Main page ───────────────────────────────────────────────────────────────

export default function EmployeeSettingsPage() {
  const { t, locale } = useAppI18n()
  const router = useRouter()
  const params = useParams()
  const company = params?.company as string
  const userId = params?.userId as string

  const [member, setMember] = useState<Member | null>(null)
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
      const usersRes = await fetch(apiUrl('/users'), { headers })
      if (usersRes.ok) {
        const d = await usersRes.json()
        setMember((d.users || []).find((u: Member) => String(u.id) === String(userId)) || null)
      }
    } finally { setLoading(false) }
  }, [userId])

  useEffect(() => { fetchAll(); fetchAppointments() }, [fetchAll, fetchAppointments])

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
      <ProFeatureGate>
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

        {/* ── Section 1: Work Hours → Settings ───────────────────────── */}
        <SectionCard
          icon={<ClockIcon />}
          iconBg="bg-accent-50"
          iconColor="text-accent-600"
          title={t('app.workHours.title', 'Work hours')}
          subtitle={t('app.teamMember.workHoursMoved', 'Start time and daily hours are managed in Settings')}
        >
          <p className="text-sm text-gray-600 leading-relaxed">
            {t(
              'app.teamMember.workHoursMovedHelp',
              'Set the company default (37h week from 08:00) or customize this employee from Work hours settings.',
            )}
          </p>
          <button
            type="button"
            onClick={() => router.push(`/${company}/settings/work-hours`)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
          >
            {t('app.teamMember.openWorkHoursSettings', 'Open work hours settings')}
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </SectionCard>

        {/* ── Section 2: Route locations → Business settings ─────────── */}
        <SectionCard
          icon={<MapPinIcon />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          title={t('app.teamMember.routeLocations', 'Route locations')}
          subtitle={t('app.teamMember.routeLocationsMoved', 'Start and end points are set in Business Settings')}
        >
          <p className="text-sm text-gray-600 leading-relaxed">
            {t(
              'app.teamMember.routeLocationsMovedHelp',
              'Configure the default route start and end for everyone, or set custom locations per person.',
            )}
          </p>
          <button
            type="button"
            onClick={() => router.push(`/${company}/settings/business?routeFor=${userId}`)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
          >
            {t('app.teamMember.openRouteSettings', 'Open route locations')}
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
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
      </ProFeatureGate>
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
