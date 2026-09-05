'use client'

import { useState, useEffect, Suspense, useRef, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useUser } from '@/app/hooks/useUser'
import AppLayout from '@/app/components/AppLayout'
import CreateJob from '@/app/components/CreateJob'
import CreateSubscription from '@/app/components/CreateSubscription'
import JobViewSlideout from '@/app/components/JobViewSlideout'
import AddClientModal from '@/app/components/AddClientModal'
import ConfirmModal from '@/app/components/ConfirmModal'
import DayRoutePanel from '@/app/components/DayRoutePanel'
import MobileRouteSheet from '@/app/components/MobileRouteSheet'
import RouteAddSearch, {
  ROUTE_MAP_GLASS_PANEL,
  ROUTE_MAP_GLASS_PILL,
  ROUTE_MAP_GLASS_STYLE,
  type RouteSearchClient,
  type RouteLocationPick,
} from '@/app/components/RouteAddSearch'
import OnboardingCompletePopup from '@/app/components/OnboardingCompletePopup'
import WeekPlanPanel from '@/app/components/WeekPlanPanel'
import WorkDriveDayBar from '@/app/components/jobs/WorkDriveDayBar'
import {
  advanceOnboardingProgress,
  getOwnerOnboardingStep,
} from '@/app/utils/onboardingClient'
import CreateAppointment, { CATEGORY_OPTIONS as APPT_CATEGORY_OPTIONS, type AppointmentPayload } from '@/app/components/CreateAppointment'
import { apiUrl } from '@/app/utils/api'
import { forceReLogin, refreshSession } from '@/app/utils/sessionRefresh'
import { groupJobsIntoVisits, visitSiblingsFor } from '@/app/utils/visitMerge'
import { formatMoney } from '@/app/config/countryRules'
import { useCompanyCountryCode } from '@/app/hooks/useCompanyCountryCode'
import { getEmailTemplate } from '@/app/utils/emailTemplates'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useAppI18n } from '@/app/components/I18nProvider'
import { CheckIcon, PlusIcon, UserCircleIcon, DocumentTextIcon, ClockIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CalendarDaysIcon, EllipsisHorizontalIcon, ArchiveBoxArrowDownIcon } from '@heroicons/react/24/outline'
import type { UserRoute, RouteJob, IsolatedRouteSeg } from '@/app/components/RouteMap'
import {
  buildDayJobsFingerprint,
  formatRouteTime,
  routesHaveDirections,
} from '@/app/utils/routeDirections'
import { buildDayRoutesFromJobs, fetchRouteDirections } from '@/app/utils/dayRouteShared'
import { optimizeMiddleJobsClient } from '@/app/utils/clientRouteOptimize'
import {
  PLANNER_ARCHIVED_JOBS_EVENT,
  archivePlannerJobId,
  getArchivedPlannerJobIds,
} from '@/app/utils/plannerArchivedJobs'

// RouteMap uses mapbox-gl which cannot be server-rendered
const RouteMap = dynamic(() => import('@/app/components/RouteMap'), { ssr: false })

// 10 distinct colours for up to 10 users
const USER_COLORS = [
  '#3DD57A', '#FF6B6B', '#4ECDC4', '#45B7D1',
  '#F4A261', '#A8DADC', '#E76F51', '#7B2D8B',
  '#2196F3', '#FF9800',
]

/** Mobile route planner bottom sheet â keep in sync with RouteMap fitInsets. */
const MOBILE_ROUTE_SHEET_SNAPS = [0.3, 0.58, 0.85] as const
const MOBILE_ROUTE_SHEET_INITIAL_SNAP = 1
const MOBILE_ROUTE_MAP_FIT_INSETS = {
  top: 72,
  bottomRatio: MOBILE_ROUTE_SHEET_SNAPS[MOBILE_ROUTE_SHEET_INITIAL_SNAP],
  side: 48,
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

/** Task count for job cards â list API exposes all_service_count, not job_services[]. */
function getJobTaskCount(job: any): number {
  const fromApi = Number(job.all_service_count ?? job.service_count ?? 0)
  if (fromApi > 0) return fromApi
  const fromArrays = (job.job_services || job.services || []).length
  return fromArrays > 0 ? fromArrays : 1
}

/** Planned job value (all tasks); total_price on list API is completed tasks only.
 *  Cancelled jobs show the cancellation fee (not the original service total). */
function getJobDisplayPrice(job: any): number {
  if (String(job?.status || '') === 'cancelled') {
    const fee = parseFloat(String(job.cancellation_fee_amount ?? job.estimated_price ?? job.total_price ?? 0))
    return Number.isFinite(fee) ? Math.max(0, fee) : 0
  }
  const estimated = parseFloat(String(job.estimated_price ?? ''))
  if (!Number.isNaN(estimated) && estimated > 0) return estimated
  const total = parseFloat(String(job.total_price ?? ''))
  if (!Number.isNaN(total) && total > 0) return total
  return 0
}

function parseNumericJobId(id: unknown): number | null {
  if (typeof id === 'number' && Number.isFinite(id)) return id
  if (typeof id === 'string' && /^\d+$/.test(id.trim())) return parseInt(id.trim(), 10)
  return null
}

function getProjectedJobMeta(job: any): { subscriptionId: number; occurrence: number } | null {
  const subId = typeof job?.recurring_job_id === 'number' ? job.recurring_job_id : null
  const occ = typeof job?.recurring_occurrence === 'number' ? job.recurring_occurrence : null
  if (subId && occ) return { subscriptionId: subId, occurrence: occ }

  if (typeof job?.id === 'string' && String(job.id).startsWith('subscription-')) {
    const parts = String(job.id).split('-')
    if (parts.length >= 3) {
      const ps = parseInt(parts[1], 10)
      const po = parseInt(parts[2], 10)
      if (Number.isFinite(ps) && Number.isFinite(po)) return { subscriptionId: ps, occurrence: po }
    }
  }
  return null
}

function isProjectedJobRow(job: any): boolean {
  return !!(job?.is_projected || (typeof job?.id === 'string' && String(job.id).startsWith('subscription-')))
}

async function ensureRealJobIdForAction(job: any, token: string): Promise<number> {
  const parsed = parseNumericJobId(job?.id)
  if (parsed != null) return parsed

  if (!isProjectedJobRow(job)) {
    throw new Error('Invalid job id')
  }

  const meta = getProjectedJobMeta(job)
  if (!meta) {
    throw new Error('Could not resolve subscription occurrence to materialize')
  }

  const mat = await fetch(
    apiUrl(`/subscriptions/${meta.subscriptionId}/occurrences/${meta.occurrence}/materialize`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ scheduled_date: job.scheduled_date }),
    },
  )
  const matData = await mat.json().catch(() => ({}))
  if (!mat.ok) {
    const msg = matData.details
      ? `${matData.error || 'Failed to create real job from subscription'}: ${matData.details}`
      : (matData.error || 'Failed to create real job from subscription')
    throw new Error(msg)
  }
  const jobId = matData.jobId
  if (typeof jobId !== 'number') {
    throw new Error('Invalid jobId returned from materialize endpoint')
  }
  return jobId
}

interface User {
    id: number
    first_name: string
    last_name: string
    email: string
    role: string
}

interface WorkHours {
    monday_hours: number
    tuesday_hours: number
    wednesday_hours: number
    thursday_hours: number
    friday_hours: number
    saturday_hours: number
    sunday_hours: number
    monday_start?: string | null
    tuesday_start?: string | null
    wednesday_start?: string | null
    thursday_start?: string | null
    friday_start?: string | null
    saturday_start?: string | null
    sunday_start?: string | null
}

/** Standard 37h week — used while hours are still loading so days never flash as 0h. */
const DEFAULT_WORK_HOURS: WorkHours = {
    monday_hours: 7.5,
    tuesday_hours: 7.5,
    wednesday_hours: 7.5,
    thursday_hours: 7.5,
    friday_hours: 7.0,
    saturday_hours: 0,
    sunday_hours: 0,
    monday_start: '08:00',
    tuesday_start: '08:00',
    wednesday_start: '08:00',
    thursday_start: '08:00',
    friday_start: '08:00',
    saturday_start: null,
    sunday_start: null,
}

const WORK_HOUR_KEYS: (keyof WorkHours)[] = [
    'monday_hours',
    'tuesday_hours',
    'wednesday_hours',
    'thursday_hours',
    'friday_hours',
    'saturday_hours',
    'sunday_hours',
]

const WORK_START_KEYS = [
    'monday_start',
    'tuesday_start',
    'wednesday_start',
    'thursday_start',
    'friday_start',
    'saturday_start',
    'sunday_start',
] as const

function parseWorkHoursRow(raw: Record<string, unknown> | null | undefined): WorkHours {
    const src = raw || {}
    const num = (key: keyof WorkHours, fallback: number) => {
        const n = parseFloat(String(src[key] ?? fallback))
        return Number.isFinite(n) ? n : fallback
    }
    const start = (key: typeof WORK_START_KEYS[number], hours: number) => {
        const rawStart = src[key]
        if (rawStart == null || rawStart === '') return hours > 0 ? '08:00' : null
        return String(rawStart).slice(0, 5)
    }
    const monday_hours = num('monday_hours', 7.5)
    const tuesday_hours = num('tuesday_hours', 7.5)
    const wednesday_hours = num('wednesday_hours', 7.5)
    const thursday_hours = num('thursday_hours', 7.5)
    const friday_hours = num('friday_hours', 7.0)
    const saturday_hours = num('saturday_hours', 0)
    const sunday_hours = num('sunday_hours', 0)
    return {
        monday_hours,
        tuesday_hours,
        wednesday_hours,
        thursday_hours,
        friday_hours,
        saturday_hours,
        sunday_hours,
        monday_start: start('monday_start', monday_hours),
        tuesday_start: start('tuesday_start', tuesday_hours),
        wednesday_start: start('wednesday_start', wednesday_hours),
        thursday_start: start('thursday_start', thursday_hours),
        friday_start: start('friday_start', friday_hours),
        saturday_start: start('saturday_start', saturday_hours),
        sunday_start: start('sunday_start', sunday_hours),
    }
}

function hoursForDayIndex(hours: WorkHours | null | undefined, dayIndex: number): number {
    const src = hours || DEFAULT_WORK_HOURS
    const raw = src[WORK_HOUR_KEYS[dayIndex]]
    const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw)
    return Number.isFinite(n) ? n : (DEFAULT_WORK_HOURS[WORK_HOUR_KEYS[dayIndex]] as number)
}

function startForDayIndex(hours: WorkHours | null | undefined, dayIndex: number): string | null {
    const src = hours || DEFAULT_WORK_HOURS
    const start = src[WORK_START_KEYS[dayIndex]]
    if (start) return String(start).slice(0, 5)
    return hoursForDayIndex(src, dayIndex) > 0 ? '08:00' : null
}

/** Add minutes to HH:MM; returns HH:MM (wraps past midnight). */
function addMinutesToClock(hhmm: string, minutes: number): string {
    const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/)
    if (!m) return hhmm
    const total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + Math.round(minutes)
    const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
    const h = Math.floor(wrapped / 60)
    const min = wrapped % 60
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function DayClockDivider({
    label,
    hint,
}: {
    label: string
    hint?: string | null
}) {
    return (
        <div className="flex items-center gap-2 py-1" title={hint || undefined}>
            <span className="flex-shrink-0 text-[10px] font-semibold tabular-nums tracking-wide text-gray-500">
                {label}
                {hint ? (
                    <span className="ml-1.5 font-medium text-gray-400">{hint}</span>
                ) : null}
            </span>
            <div className="h-px min-w-0 flex-1 bg-gray-200/90" />
        </div>
    )
}

function JobsPageContent() {
  const { t, locale } = useAppI18n()
  const dateLocale = locale === 'da' ? 'da-DK' : 'en-US'
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: userLoading } = useUser()
  const companyCountryCode = useCompanyCountryCode(user)
  const companySlug = (params?.company as string) || ''
  const ownerOnboardingStep = user
    ? getOwnerOnboardingStep(user as unknown as Record<string, unknown>)
    : 'done'
  const inJobsWizard = ownerOnboardingStep === 'jobs'
  const inRouteWizard = ownerOnboardingStep === 'route'
  
  // Format a Date as YYYY-MM-DD in local time (avoids timezone shifting from toISOString)
  const toLocalDateString = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /** Route planning lives on the map multitool — Jobs only deep-links into it. */
  const openMapPlanner = useCallback((date: string, userId?: number | null) => {
    if (!companySlug) return
    const uid = userId != null && Number.isFinite(Number(userId)) ? Number(userId) : null
    const back = encodeURIComponent(`/${companySlug}/jobs`)
    const href = uid != null
      ? `/${companySlug}/map?focus=route&date=${date}&userId=${uid}&back=${back}`
      : `/${companySlug}/map?focus=day&date=${date}&back=${back}`
    router.push(href)
  }, [companySlug, router])

  // Old jobs?view=day bookmarks → map planner (same date / optional user).
  useEffect(() => {
    if (searchParams.get('view') !== 'day') return
    const date = searchParams.get('date') || toLocalDateString(new Date())
    const userParam = searchParams.get('user') || searchParams.get('userId')
    const uid = userParam && userParam !== 'all' ? Number(userParam) : null
    openMapPlanner(date, Number.isFinite(uid as number) ? uid : null)
  }, [searchParams, openMapPlanner])

  // Normalize any date-ish value (YYYY-MM-DD, ISO string, Date) to YYYY-MM-DD
  const toDateOnlyString = (v: any) => {
    if (!v) return ''
    if (v instanceof Date) return toLocalDateString(v)
    const s = String(v)
    // If it looks like an ISO timestamp, take the date part
    if (s.includes('T')) return s.split('T')[0]
    return s
  }
  
  // Load saved state from localStorage
  // Initialise currentWeek from URL ?date= param if present (used by day-view
  // shareable links / refreshes), otherwise always start on today. We intentionally
  // do NOT restore from localStorage â opening the jobs page should always land
  // on the current week/month, regardless of where the user was last time.
  const [currentWeek, setCurrentWeek] = useState(() => {
    const dateStr = searchParams.get('date')
    if (dateStr) {
      const [y, m, d] = dateStr.split('-').map(Number)
      if (y && m && d) {
        const parsed = new Date(y, m - 1, d)
        if (!isNaN(parsed.getTime())) return parsed
      }
    }
    return new Date()
  })
  const [jobs, setJobs] = useState<any[]>([])
  // Full jobs dataset (unfiltered). Used by the route planner so "All employees" always works.
  const [allJobs, setAllJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string>('')
  const [viewingJob, setViewingJob] = useState<any>(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false)
  const [createJobPrefillDate, setCreateJobPrefillDate] = useState<string | null>(null)
  const [createJobPrefillUserId, setCreateJobPrefillUserId] = useState<number | null>(null)
  // Route planner "add a job" search â prefill the create-job modal
  const [createJobClientId, setCreateJobClientId] = useState<number | undefined>(undefined)
  const [createJobLockClient, setCreateJobLockClient] = useState(false)
  const [createJobNewClient, setCreateJobNewClient] = useState<{ name?: string; address?: string; zip_code?: string; city?: string } | null>(null)
  const [routeClients, setRouteClients] = useState<RouteSearchClient[]>([])
  const [mobileRouteDayPickerOpen, setMobileRouteDayPickerOpen] = useState(false)
  const mobileRouteHeaderRef = useRef<HTMLDivElement>(null)
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | 'all'>('all')
  const [workHours, setWorkHours] = useState<WorkHours | null>(DEFAULT_WORK_HOURS)
  const [allUsersWorkHours, setAllUsersWorkHours] = useState<WorkHours | null>(null)
  const [workHoursByUser, setWorkHoursByUser] = useState<Record<number, WorkHours>>({})
  /** Which employee `workHours` belongs to — never show another person's capacity. */
  const [workHoursOwnerId, setWorkHoursOwnerId] = useState<number | 'all' | null>(null)
  const workHoursFetchSeq = useRef(0)
  const selectedUserIdRef = useRef(selectedUserId)
  selectedUserIdRef.current = selectedUserId
  // Capacity bars always follow work-hours (weekends / 0h days stay closed).
  const dailyCapacityEnabled = true
  // Initialise viewMode from URL ?view= param (day planning moved to the map)
  const [viewMode, setViewMode] = useState<'day'|'week'|'month'|'year'>(() => {
    const v = searchParams.get('view')
    if (v === 'month' || v === 'year' || v === 'week') return v
    return 'week'
  })
  
  // Drag and drop state
  const [draggedJob, setDraggedJob] = useState<any>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [dragOverJobId, setDragOverJobId] = useState<number | 'top' | 'bottom' | null>(null) // Track which job we're hovering over for divider, or 'top'/'bottom' for list edges
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below' | null>(null) // Track position relative to hovered job
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [pendingMoveDate, setPendingMoveDate] = useState<string | null>(null)
  const [pendingMoveJob, setPendingMoveJob] = useState<any>(null) // Store job separately for modal
  const [isMovingJob, setIsMovingJob] = useState(false)
  const [moveTemplate, setMoveTemplate] = useState<{ subject: string; message: string }>({ subject: '', message: '' })
  const weekScrollContainerRef = useRef<HTMLDivElement>(null)
  const [weekScrollPosition, setWeekScrollPosition] = useState(0)

  // ââ Day view / route planner ââââââââââââââââââââââââââââââââââââââââââââââ
  const [dayRoutes, setDayRoutes] = useState<UserRoute[]>([])
  const [dayFocusUserId, setDayFocusUserId] = useState<number | null>(null)
  // AllEmployees panel: hover-to-preview and checkbox-select isolation
  const [allPanelHoveredUserId, setAllPanelHoveredUserId] = useState<number | null>(null)
  const [allPanelSelectedIds, setAllPanelSelectedIds] = useState<number[]>([])
  // Clear panel isolation when navigating into a focused-employee route view
  useEffect(() => {
    if (dayFocusUserId != null) {
      setAllPanelHoveredUserId(null)
      setAllPanelSelectedIds([])
    }
  }, [dayFocusUserId])
  // lg breakpoint (1024px) â drives the mobile bottom-sheet vs desktop split layout
  const [isDesktopRoute, setIsDesktopRoute] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsDesktopRoute(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    if (viewMode !== 'day') setMobileRouteDayPickerOpen(false)
  }, [viewMode])
  useEffect(() => {
    if (!mobileRouteDayPickerOpen) return
    const onDown = (e: PointerEvent) => {
      if (mobileRouteHeaderRef.current && !mobileRouteHeaderRef.current.contains(e.target as Node)) {
        setMobileRouteDayPickerOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [mobileRouteDayPickerOpen])
  // Saved clients for the route planner "add a job" search
  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl('/clients'), { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        setRouteClients(Array.isArray(data.clients) ? data.clients : [])
      } catch {
        /* ignore */
      }
    }
    load()
  }, [])
  const [dayOptimizing, setDayOptimizing] = useState(false)
  const [optimizeNotice, setOptimizeNotice] = useState<string | null>(null)
  const optimizeNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [weekPlanOpen, setWeekPlanOpen] = useState(false)
  const [dayGeocodingCount, setDayGeocodingCount] = useState(0)
  const [hoveredJobId, setHoveredJobId] = useState<number | string | null>(null)
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleJobHover = useCallback((jobId: number | string | null) => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current)
      hoverClearTimerRef.current = null
    }
    if (jobId === null) {
      // Defer clear so mouseleave on job A doesn't wipe hover when entering job B.
      hoverClearTimerRef.current = setTimeout(() => {
        setHoveredJobId(null)
        hoverClearTimerRef.current = null
      }, 16)
    } else {
      setHoveredJobId(jobId)
    }
  }, [])
  const clearJobHover = useCallback(() => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current)
      hoverClearTimerRef.current = null
    }
    setHoveredJobId(null)
  }, [])
  // Hover-to-isolate: hovering a drive-time badge isolates that leg on the map.
  const [isolatedLeg, setIsolatedLeg] = useState<IsolatedRouteSeg | null>(null)
  const isolateClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleIsolateRoute = useCallback((seg: IsolatedRouteSeg | null) => {
    if (isolateClearTimerRef.current) {
      clearTimeout(isolateClearTimerRef.current)
      isolateClearTimerRef.current = null
    }
    if (seg === null) {
      // Defer so moving between adjacent badges doesn't flicker the map.
      isolateClearTimerRef.current = setTimeout(() => {
        setIsolatedLeg(null)
        isolateClearTimerRef.current = null
      }, 40)
    } else {
      setIsolatedLeg(seg)
    }
  }, [])
  // Manual draw-route mode (per focused user â only one drawable at a time)
  const [drawMode, setDrawMode] = useState(false)
  const [drawOrder, setDrawOrder] = useState<(number | string)[]>([])
  /** After finishing a drawn route: driving time vs order before draw (+ = saved). */
  const [drawRouteComparison, setDrawRouteComparison] = useState<{ diffMinutes: number } | null>(null)
  const drawCompareBaselineRef = useRef<number | null>(null)
  const drawRouteComparisonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bumped every time routes are rebuilt so the directions effect always re-fires
  const [dayRoutesVersion, setDayRoutesVersion] = useState(0)
  const directionsFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const routeOrderSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Cached fully-built day routes (with directions) keyed by YYYY-MM-DD. */
  const dayRouteCacheRef = useRef<Map<string, UserRoute[]>>(new Map())
  const dayRouteCacheFpRef = useRef<Map<string, string>>(new Map())

  // Baseline driving minutes per user for the current day (before edits in this session)
  const [dayBaselineMinutes, setDayBaselineMinutes] = useState<Record<number, number>>({})
  const [dayBaselineDate, setDayBaselineDate] = useState<string | null>(null)

  // Pending assignee changes in route planner (applied only on Save & apply)
  const [pendingAssigneeChanges, setPendingAssigneeChanges] = useState<Record<number, number>>({})
  // Ref so the build-routes effect can read pendingAssigneeChanges without it being a dep
  // (adding it as a dep would rebuild all routes from scratch on every drag-reassign).
  const pendingAssigneeChangesRef = useRef<Record<number, number>>({})

  // Date strings (YYYY-MM-DD) where a route has been explicitly saved via Save & Apply
  const [plannedDays, setPlannedDays] = useState<Set<string>>(new Set())

  /** Saved daily_routes rows for the visible week, keyed by date. The server is
   *  the source of truth for planned packages; localStorage is only a cache. */
  type DailyRouteMeta = {
    id: number
    user_id: number
    scheduled_date: string
    status: string | null
    name: string | null
    round_template_id: number | null
    round_id: number | null
    is_occurrence_override: boolean | null
    job_ids: number[]
  }
  const [dailyRoutesByDate, setDailyRoutesByDate] = useState<Record<string, DailyRouteMeta[]>>({})
  /** Bumped to re-fetch daily routes after a package move / save-as-round. */
  const [dailyRoutesTick, setDailyRoutesTick] = useState(0)
  /** Popover for "Move package" on a planned-route container. */
  const [movePackageMenu, setMovePackageMenu] = useState<
    | { routeIds: number[]; date: string; userId: number; x: number; y: number }
    | null
  >(null)
  const [movePackageDate, setMovePackageDate] = useState('')
  const [movePackageUserId, setMovePackageUserId] = useState<number | ''>('')
  const [movePackageBusy, setMovePackageBusy] = useState(false)
  const [movePackageError, setMovePackageError] = useState<string | null>(null)
  /** Cancelled/deleted cards hidden from the jobs board (frontend only). */
  const [archivedJobIds, setArchivedJobIds] = useState<Set<string>>(() => getArchivedPlannerJobIds())
  const [exitingJobIds, setExitingJobIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const sync = () => setArchivedJobIds(getArchivedPlannerJobIds())
    sync()
    window.addEventListener(PLANNER_ARCHIVED_JOBS_EVENT, sync)
    return () => window.removeEventListener(PLANNER_ARCHIVED_JOBS_EVENT, sync)
  }, [])

  const dismissInactiveJobs = useCallback((ids: Array<string | number>) => {
    const keys = ids.map((id) => String(id)).filter(Boolean)
    if (keys.length === 0) return
    setExitingJobIds((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => next.add(k))
      return next
    })
    window.setTimeout(() => {
      keys.forEach((k) => archivePlannerJobId(k))
      setExitingJobIds((prev) => {
        const next = new Set(prev)
        keys.forEach((k) => next.delete(k))
        return next
      })
    }, 280)
  }, [])

  /** Fingerprint for a single user's job order â used to detect per-user unsaved changes. */
  const buildUserFingerprint = useCallback(
    (route: UserRoute) => JSON.stringify(route.jobs.filter(j => !j.is_home).map(j => j.id)),
    [],
  )

  /** Per-user saved fingerprints â null entry means "not yet initialised for this user". */
  const [savedFingerprintsByUser, setSavedFingerprintsByUser] = useState<Record<number, string>>({})
  /** Per-user discard snapshots â kept fresh whenever a user's route is clean. */
  const discardSnapshotsByUserRef = useRef<Record<number, UserRoute>>({})

  /** IDs of users whose current route order differs from the last saved state. */
  const unsavedUserIds = useMemo(
    () =>
      dayRoutes
        .filter(r => {
          const saved = savedFingerprintsByUser[r.userId]
          return saved != null && buildUserFingerprint(r) !== saved
        })
        .map(r => r.userId),
    [dayRoutes, savedFingerprintsByUser, buildUserFingerprint],
  )
  const hasUnsavedRouteChanges = unsavedUserIds.length > 0

  // Map-only route isolation driven by the AllEmployees panel.
  // Hover takes precedence over checkbox selection; both are cleared when
  // entering a focused-employee view (dayFocusUserId != null).
  const mapIsolatedUserIds = useMemo((): number[] | null => {
    if (dayFocusUserId != null) return null
    if (allPanelHoveredUserId != null) return [allPanelHoveredUserId]
    if (allPanelSelectedIds.length > 0) return allPanelSelectedIds
    return null
  }, [dayFocusUserId, allPanelHoveredUserId, allPanelSelectedIds])

  // Keep ref in sync so the build-routes effect can read it without declaring it as a dep.
  pendingAssigneeChangesRef.current = pendingAssigneeChanges

  // Reset on day/view change
  useEffect(() => {
    if (viewMode !== 'day') {
      setSavedFingerprintsByUser({})
      return
    }
    setSavedFingerprintsByUser({})
    discardSnapshotsByUserRef.current = {}
  }, [viewMode, toLocalDateString(currentWeek)])

  // Initialise fingerprint once per user when their route first loads
  useEffect(() => {
    if (viewMode !== 'day' || dayRoutes.length === 0) return
    setSavedFingerprintsByUser(prev => {
      let changed = false
      const next = { ...prev }
      dayRoutes.forEach(r => {
        if (next[r.userId] == null) { next[r.userId] = buildUserFingerprint(r); changed = true }
      })
      return changed ? next : prev
    })
  }, [viewMode, dayRoutes, buildUserFingerprint])

  // Keep each user's discard snapshot fresh while their route is clean
  useEffect(() => {
    if (viewMode !== 'day') return
    dayRoutes.forEach(r => {
      if (!unsavedUserIds.includes(r.userId)) discardSnapshotsByUserRef.current[r.userId] = r
    })
  }, [dayRoutes, unsavedUserIds, viewMode])

  const handleDiscardUser = useCallback((userId: number) => {
    const snap = discardSnapshotsByUserRef.current[userId]
    if (!snap) return
    setDayRoutes(prev => prev.map(r => r.userId === userId ? snap : r))
    const dateStr = toLocalDateString(currentWeek)
    dayRouteCacheRef.current.delete(dateStr)
    setSavedFingerprintsByUser(prev => ({ ...prev, [userId]: buildUserFingerprint(snap) }))
  }, [currentWeek, buildUserFingerprint])

  const handleDiscardAll = useCallback(() => {
    const snaps = discardSnapshotsByUserRef.current
    setDayRoutes(prev => prev.map(r => snaps[r.userId] ?? r))
    const dateStr = toLocalDateString(currentWeek)
    dayRouteCacheRef.current.delete(dateStr)
    setSavedFingerprintsByUser(prev => {
      const next = { ...prev }
      for (const [uid, snap] of Object.entries(snaps)) {
        next[Number(uid)] = buildUserFingerprint(snap as Parameters<typeof buildUserFingerprint>[0])
      }
      return next
    })
  }, [currentWeek, buildUserFingerprint])

  useEffect(() => {
    try {
      const key = `planned-days-${window.location.pathname.split('/')[1]}`
      const raw = localStorage.getItem(key)
      if (raw) setPlannedDays(new Set(JSON.parse(raw)))
    } catch { /* ignore */ }
  }, [])

  // Wizard: show company-name popup when user clicks "Save and complete setup"
  const [showBusinessPopup, setShowBusinessPopup] = useState(false)

  // Saved total travel time per day. Key: "YYYY-MM-DD:userId", value: minutes
  const [travelMinutes, setTravelMinutes] = useState<Record<string, number>>({})
  // Leave entries for the currently selected employee: date â { leave_type, hours_off }
  const [employeeLeaveByDate, setEmployeeLeaveByDate] = useState<Record<string, { leave_type: string; hours_off: number | null }>>({})

  // Appointments (unified time off + blocks). Keyed by date for O(1) render
  // and capacity lookup. Each entry carries every appointment for that day
  // so the calendar cell can render pills and the capacity bar can sum up
  // the approved hours.
  type AppointmentItem = {
    id: number
    user_id: number
    title: string
    category: 'personal' | 'meeting' | 'sick' | 'vacation' | 'other'
    notes: string | null
    appointment_date: string
    end_date?: string | null
    time_mode: 'span' | 'hours' | 'all_day'
    start_time: string | null
    end_time: string | null
    hours_off: number | null
    status: 'requested' | 'approved' | 'declined'
    requested_by: number | null
    approved_by: number | null
  }
  const [appointmentsByDate, setAppointmentsByDate] = useState<Record<string, AppointmentItem[]>>({})
  const [isCreateAppointmentOpen, setIsCreateAppointmentOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<AppointmentPayload | null>(null)
  const [appointmentPrefillDate, setAppointmentPrefillDate] = useState<string | null>(null)
  const [appointmentPrefillUserId, setAppointmentPrefillUserId] = useState<number | null>(null)
  // Per-cell "+ Add" popover â two choices (Job / Appointment).
  const [cellAddMenu, setCellAddMenu] = useState<
    | { date: string; x: number; y: number }
    | null
  >(null)
  // 3-dot actions popover anchored to a specific appointment pill.
  const [apptActionsMenu, setApptActionsMenu] = useState<
    | { id: number; x: number; y: number }
    | null
  >(null)


  // Fetch saved travel times + planned-package metadata from daily_routes
  // whenever the visible week changes (or a package was moved/saved). Runs in
  // day view too so the planner can show the planned/round badge.
  useEffect(() => {
    if (viewMode !== 'week' && viewMode !== 'day') return
    const startDate = toLocalDateString(weekDays[0])
    const endDate = toLocalDateString(weekDays[6])
    const token = localStorage.getItem('token')
    fetch(apiUrl(`/daily-routes?start_date=${startDate}&end_date=${endDate}`), {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.routes) return
        const metaByDate: Record<string, DailyRouteMeta[]> = {}
        const serverPlanned: string[] = []
        setTravelMinutes(prev => {
          const next = { ...prev }
          for (const row of data.routes) {
            // scheduled_date may be a plain "YYYY-MM-DD" string (from to_char on server)
            // or a JS Date serialized as "YYYY-MM-DDT23:00:00.000Z" (UTC, server in UTC+1).
            // Plain string â use directly.
            // ISO timestamp â convert to LOCAL date so the day matches the browser timezone.
            const raw = String(row.scheduled_date)
            const dateStr = raw.includes('T')
              ? toLocalDateString(new Date(raw))
              : raw
            if (row.total_minutes != null) {
              next[`${dateStr}:${row.user_id}`] = row.total_minutes
            }
            const meta: DailyRouteMeta = {
              id: Number(row.id),
              user_id: Number(row.user_id),
              scheduled_date: dateStr,
              // Library round placements always count as a planned package.
              status: (row.status === 'planned' || row.round_id != null) ? 'planned' : (row.status ?? null),
              name: row.name ?? null,
              round_template_id: row.round_template_id != null ? Number(row.round_template_id) : null,
              round_id: row.round_id != null ? Number(row.round_id) : null,
              is_occurrence_override: row.is_occurrence_override ?? null,
              job_ids: (() => {
                const raw = row.job_ids
                if (Array.isArray(raw)) return raw.map((n: unknown) => Number(n)).filter((n) => Number.isFinite(n))
                if (typeof raw === 'string') {
                  return raw
                    .replace(/[{}]/g, '')
                    .split(',')
                    .map((s) => Number(s.trim()))
                    .filter((n) => Number.isFinite(n))
                }
                return []
              })(),
            }
            ;(metaByDate[dateStr] ??= []).push(meta)
            if (meta.status === 'planned') serverPlanned.push(dateStr)
          }
          return next
        })
        setDailyRoutesByDate(prev => {
          // Replace the visible week's entries; keep other cached dates.
          const next = { ...prev }
          for (const d of weekDays) delete next[toLocalDateString(d)]
          return { ...next, ...metaByDate }
        })
        if (serverPlanned.length > 0) {
          // Server-planned days are the source of truth â merge into the local
          // cache so the UI reflects saves made on other devices too.
          setPlannedDays(prev => {
            const next = new Set(prev)
            serverPlanned.forEach(d => next.add(d))
            return next
          })
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, currentWeek, dailyRoutesTick])

  // Move a whole planned package (route row + all its jobs) to another day
  // and/or employee in one server call per route row.
  const handleMovePackage = useCallback(async () => {
    if (!movePackageMenu) return
    const toDate = movePackageDate && movePackageDate !== movePackageMenu.date ? movePackageDate : null
    const toUser = movePackageUserId !== '' && Number(movePackageUserId) !== movePackageMenu.userId
      ? Number(movePackageUserId)
      : null
    if (!toDate && !toUser) {
      setMovePackageError(t('app.jobsPage.movePackagePick', 'Pick a new date or employee first'))
      return
    }
    setMovePackageBusy(true)
    setMovePackageError(null)
    const token = localStorage.getItem('token')
    try {
      for (const routeId of movePackageMenu.routeIds) {
        const res = await fetch(apiUrl(`/daily-routes/${routeId}/move`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            ...(toDate ? { to_date: toDate } : {}),
            ...(toUser ? { to_user_id: toUser } : {}),
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || t('app.jobsPage.movePackageFailed', 'Could not move the route'))
        }
      }
      setMovePackageMenu(null)
      setDailyRoutesTick(tick => tick + 1)
      fetchJobsForWeek()
    } catch (err) {
      setMovePackageError(err instanceof Error ? err.message : t('app.jobsPage.movePackageFailed', 'Could not move the route'))
    } finally {
      setMovePackageBusy(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movePackageMenu, movePackageDate, movePackageUserId])


    // Get the start of the week (Monday)
    const getWeekStart = (date: Date) => {
        const d = new Date(date)
        const day = d.getDay()
        const diff = d.getDate() - day + (day === 0 ? -6 : 1)
        return new Date(d.setDate(diff))
    }

    // Get weekdays (Monday to Sunday - all 7 days)
    const getWeekDays = () => {
        const start = getWeekStart(currentWeek)
        const days = []
        for (let i = 0; i < 7; i++) {
            const day = new Date(start)
            day.setDate(start.getDate() + i)
            days.push(day)
        }
        return days
    }

    const weekDays = getWeekDays()

    const formatDate = (date: Date) => {
        return date.toLocaleDateString(dateLocale, {
            month: 'short',
            day: 'numeric'
        })
    }

    const formatWeekday = (date: Date) => {
        return date.toLocaleDateString(dateLocale, {
            weekday: 'long'
        })
    }

    const isToday = (date: Date) => {
        const today = new Date()
        return date.toDateString() === today.toDateString()
    }

  // Navigation functions
  const goToPreviousWeek = () => {
    const newWeek = new Date(currentWeek)
    newWeek.setDate(currentWeek.getDate() - 7)
    setCurrentWeek(newWeek)
    // Save to localStorage
    try {
      localStorage.setItem('vevago_jobs_week', newWeek.toISOString())
    } catch (e) {}
  }

  const goToNextWeek = () => {
    const newWeek = new Date(currentWeek)
    newWeek.setDate(currentWeek.getDate() + 7)
    setCurrentWeek(newWeek)
    // Save to localStorage
    try {
      localStorage.setItem('vevago_jobs_week', newWeek.toISOString())
    } catch (e) {}
  }

  const goToCurrentWeek = () => {
    const today = new Date()
    setCurrentWeek(today)
    // Save to localStorage
    try {
      localStorage.setItem('vevago_jobs_week', today.toISOString())
    } catch (e) {}
  }

  // Month navigation functions
  const goToPreviousMonth = () => {
    const newDate = new Date(currentWeek)
    newDate.setMonth(newDate.getMonth() - 1)
    setCurrentWeek(newDate)
    try {
      localStorage.setItem('vevago_jobs_week', newDate.toISOString())
    } catch (e) {}
  }

  const goToNextMonth = () => {
    const newDate = new Date(currentWeek)
    newDate.setMonth(newDate.getMonth() + 1)
    setCurrentWeek(newDate)
    try {
      localStorage.setItem('vevago_jobs_week', newDate.toISOString())
    } catch (e) {}
  }

  const goToCurrentMonth = () => {
    const today = new Date()
    setCurrentWeek(today)
    try {
      localStorage.setItem('vevago_jobs_week', today.toISOString())
    } catch (e) {}
  }

  // Get all days for month view (including padding days from previous/next month)
  const getMonthDays = () => {
    const year = currentWeek.getFullYear()
    const month = currentWeek.getMonth()
    
    // First day of the month
    const firstDay = new Date(year, month, 1)
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0)
    
    // Get the day of week for the first day (0 = Sunday, 1 = Monday, etc.)
    // We want Monday to be the first day of the week, so adjust
    let firstDayOfWeek = firstDay.getDay()
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1 // Convert to Monday=0, Sunday=6
    
    // Start from the Monday before (or on) the first day of the month
    const startDate = new Date(firstDay)
    startDate.setDate(firstDay.getDate() - firstDayOfWeek)
    
    // Calculate how many days to show (6 weeks = 42 days)
    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const day = new Date(startDate)
      day.setDate(startDate.getDate() + i)
      days.push(day)
    }
    
    return days
  }
  
  // (We intentionally don't persist currentWeek anywhere â see the initializer
  //  comment above. The URL `?date=` is only set in day view by the effect below.)

  // Clean up any legacy persisted week so old installs also reset to "today".
  useEffect(() => {
    try { localStorage.removeItem('vevago_jobs_week') } catch (e) {}
  }, [])

  // Keep the browser URL in sync with the current view so that:
  //  â¢ Refreshing the page returns you to the same day view
  //  â¢ The URL can be copied and shared
  // Uses replaceState (no new history entry) so the back button works naturally.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (viewMode === 'day') {
      params.set('view', 'day')
      params.set('date', toLocalDateString(currentWeek))
    } else {
      params.delete('view')
      params.delete('date')
    }
    const qs = params.toString()
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', newUrl)
  }, [viewMode, currentWeek])

  // Tell AppLayout to step the global header aside â the day route planner is
  // a full-bleed tool, same as the map multitool.
  useEffect(() => {
    if (viewMode === 'day') {
      document.documentElement.dataset.fullBleedTool = '1'
    } else {
      delete document.documentElement.dataset.fullBleedTool
    }
    window.dispatchEvent(new Event('pathpilo:full-bleed'))
    return () => {
      delete document.documentElement.dataset.fullBleedTool
      window.dispatchEvent(new Event('pathpilo:full-bleed'))
    }
  }, [viewMode])

  // Fetch users for employee selector
  const fetchUsers = async () => {
    try {
      let token = localStorage.getItem('token')
      let response = await fetch(apiUrl('/users'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.status === 401 || response.status === 403) {
        // Token may have simply gone stale while the tab was away â try a
        // silent renew and retry once before giving up.
        const result = await refreshSession()
        if (result === 'ok') {
          token = localStorage.getItem('token')
          response = await fetch(apiUrl('/users'), {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        } else if (result === 'expired') {
          forceReLogin()
          return
        }
      }

      const data = await response.json()
      
      if (response.ok) {
        setUsers(data.users || [])
        // Don't auto-select first user here - let the URL initialization handle it
        setApiError('')
      } else {
        // Keep UI visible, but show why nothing loads
        setApiError(data?.error || 'Failed to fetch users')
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      setApiError('Network error: Failed to fetch users')
    }
  }

    // Fetch work hours for selected user. Guarded against out-of-order responses
    // so switching Alex → Sam never briefly applies Sam's old leave / Alex's hours.
    const fetchWorkHours = async () => {
        const token = localStorage.getItem('token')
        const seq = ++workHoursFetchSeq.current
        const target = selectedUserId
        const alive = () => workHoursFetchSeq.current === seq
        
        if (target === 'all') {
            try {
                const workHoursPromises = users.map(user =>
                    fetch(apiUrl(`/work-hours/${user.id}`), {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    })
                        .then(res => res.json())
                        .then(data => ({ userId: user.id, data }))
                )

                const allWorkHoursData = await Promise.all(workHoursPromises)
                if (!alive()) return

                const aggregatedWorkHours: WorkHours = {
                    monday_hours: 0,
                    tuesday_hours: 0,
                    wednesday_hours: 0,
                    thursday_hours: 0,
                    friday_hours: 0,
                    saturday_hours: 0,
                    sunday_hours: 0,
                }

                const perUser: Record<number, WorkHours> = {}

                allWorkHoursData.forEach(({ userId, data }) => {
                    const parsed = parseWorkHoursRow(data.workHours)
                    perUser[userId] = parsed

                    aggregatedWorkHours.monday_hours    += parsed.monday_hours
                    aggregatedWorkHours.tuesday_hours   += parsed.tuesday_hours
                    aggregatedWorkHours.wednesday_hours += parsed.wednesday_hours
                    aggregatedWorkHours.thursday_hours  += parsed.thursday_hours
                    aggregatedWorkHours.friday_hours    += parsed.friday_hours
                    aggregatedWorkHours.saturday_hours  += parsed.saturday_hours
                    aggregatedWorkHours.sunday_hours    += parsed.sunday_hours
                })

                setAllUsersWorkHours(aggregatedWorkHours)
                setWorkHoursByUser(perUser)
                setWorkHoursOwnerId('all')
            } catch (error) {
                console.error('Error fetching work hours for all users:', error)
            }
            return
        }

        // Prefer a cached row for this employee immediately (avoid another user's hours).
        const cached = workHoursByUser[Number(target)]
        setWorkHours(cached || DEFAULT_WORK_HOURS)
        setWorkHoursOwnerId(Number(target))
        setAllUsersWorkHours(null)

        try {
            const response = await fetch(apiUrl(`/work-hours/${target}`), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            const data = await response.json()
            if (!alive()) return

            if (response.ok) {
                const parsedWorkHours = parseWorkHoursRow(data.workHours)
                setWorkHours(parsedWorkHours)
                setWorkHoursOwnerId(Number(target))
                setAllUsersWorkHours(null)
                setWorkHoursByUser(prev => ({ ...prev, [Number(target)]: parsedWorkHours }))
            }
        } catch (error) {
            console.error('Error fetching work hours:', error)
        }
    }

    // Fetch jobs for the current week or month
    const fetchJobsForWeek = async () => {
        try {
            setLoading(true)
            setApiError('')
            let token = localStorage.getItem('token')

            let startDate: string
            let endDate: string
            
            if (viewMode === 'month') {
                const monthDays = getMonthDays()
                startDate = toLocalDateString(monthDays[0])
                endDate = toLocalDateString(monthDays[monthDays.length - 1])
            } else {
                startDate = toLocalDateString(weekDays[0])
                endDate = toLocalDateString(weekDays[6])
            }
            
            console.log(`ð Fetching jobs for date range: ${startDate} to ${endDate}`)

            let response = await fetch(apiUrl(`/jobs?start_date=${startDate}&end_date=${endDate}`), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.status === 401 || response.status === 403) {
                // Token may have simply gone stale while the tab was away â
                // try a silent renew and retry once before giving up.
                const result = await refreshSession()
                if (result === 'ok') {
                    token = localStorage.getItem('token')
                    response = await fetch(apiUrl(`/jobs?start_date=${startDate}&end_date=${endDate}`), {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                } else if (result === 'expired') {
                    forceReLogin()
                    return
                }
            }

            const data = await response.json().catch((err) => {
                console.error('â JSON parse error:', err)
                return {}
            })

            if (!response.ok) {
                console.error('â API Error:', response.status, data)
                setApiError(data?.error || 'Failed to fetch jobs')
                // Don't clear jobs on error - keep existing jobs visible
                // setJobs([])
                return
            }

            if (response.ok) {
                const allJobs = (data.jobs || [])
                console.log(`ð Frontend received ${allJobs.length} total job(s)`)
                
                // Log projected jobs
                const projectedJobs = allJobs.filter((job: any) => job.is_projected || (typeof job.id === 'string' && job.id.startsWith('subscription-')))
                console.log(`ð» Found ${projectedJobs.length} projected job(s):`, projectedJobs.map(j => ({ 
                  id: j.id, 
                  assigned_user_id: j.assigned_user_id, 
                  scheduled_date: j.scheduled_date,
                  is_projected: j.is_projected 
                })))
                
                // Log status breakdown
                const statusCounts = allJobs.reduce((acc: any, job: any) => {
                  acc[job.status || 'undefined'] = (acc[job.status || 'undefined'] || 0) + 1
                  return acc
                }, {})
                console.log('ð Jobs by status:', statusCounts)
                
                const cancelledJobs = allJobs.filter((job: any) => job.status === 'cancelled')
                if (cancelledJobs.length > 0) {
                  console.log(`ð Found ${cancelledJobs.length} cancelled job(s):`, cancelledJobs.map(j => ({ id: j.id, status: j.status, assigned_user_id: j.assigned_user_id, scheduled_date: j.scheduled_date })))
                }
                
                console.log(`ð Current selectedUserId: ${selectedUserId} (type: ${typeof selectedUserId})`)
                
                // Always keep the full dataset for the route planner
                setAllJobs(allJobs)

                if (selectedUserId === 'all') {
                  setJobs(allJobs)
                  console.log(`â Set ${allJobs.length} jobs (all users)`)
                } else {
                  // Convert selectedUserId to number for comparison
                  const userIdNum = typeof selectedUserId === 'string' ? parseInt(selectedUserId, 10) : selectedUserId
                  const filteredJobs = allJobs.filter((job: any) => {
                    // Check if job is assigned to the selected user (both real and projected jobs)
                    const jobUserId = job.assigned_user_id
                    if (jobUserId === null || jobUserId === undefined) return false
                    return Number(jobUserId) === Number(userIdNum)
                  })
                  const projectedCount = filteredJobs.filter((job: any) => job.is_projected).length
                  console.log(`ð Filtered to ${filteredJobs.length} jobs for user ${selectedUserId} (${projectedCount} projected)`)
                  setJobs(filteredJobs)
                }
            } else {
                setJobs([])
                setAllJobs([])
                setApiError(data?.error || 'Failed to fetch jobs')
            }
        } catch (error) {
            console.error('Network error: Failed to fetch jobs', error)
            setJobs([])
            setAllJobs([])
            setApiError('Network error: Failed to fetch jobs')
        } finally {
            setLoading(false)
        }

        // Fetch appointments for the same date range so the calendar can
        // render them alongside jobs and deduct approved time from
        // capacity. Clear first so a previous employee's all-day appt can't
        // briefly zero this employee's available hours.
        const apptTarget = selectedUserId
        setAppointmentsByDate({})
        try {
            const token = localStorage.getItem('token')
            let startDate: string
            let endDate: string
            if (viewMode === 'month') {
                const monthDays = getMonthDays()
                startDate = toLocalDateString(monthDays[0])
                endDate = toLocalDateString(monthDays[monthDays.length - 1])
            } else {
                startDate = toLocalDateString(weekDays[0])
                endDate = toLocalDateString(weekDays[6])
            }
            const userParam = apptTarget === 'all' ? 'all' : String(apptTarget)
            const apptRes = await fetch(
                apiUrl(`/appointments?from=${startDate}&to=${endDate}&user_id=${userParam}&status=all`),
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (apptRes.ok) {
                const apptData = await apptRes.json()
                // Ignore if the selected employee changed while this request was in flight
                if (selectedUserIdRef.current !== apptTarget) return
                const list: AppointmentItem[] = apptData.appointments || []
                // Declined appointments are kept on the server so the employee's
                // mobile status page can show the outcome, but they're irrelevant
                // to the admin calendar (they don't consume capacity and aren't
                // scheduled). Filter them out here so nothing downstream has to
                // worry about them.
                const visible = list.filter((a) => a.status !== 'declined')
                const byDate: Record<string, AppointmentItem[]> = {}
                for (const a of visible) {
                    const start = String(a.appointment_date).split('T')[0]
                    const endPart = a.end_date ? String(a.end_date).split('T')[0] : start
                    const cursor = new Date(`${start}T12:00:00`)
                    const endD = new Date(`${endPart}T12:00:00`)
                    while (cursor <= endD) {
                        const key = toLocalDateString(cursor)
                        if (!byDate[key]) byDate[key] = []
                        byDate[key].push(a)
                        cursor.setDate(cursor.getDate() + 1)
                    }
                }
                setAppointmentsByDate(byDate)
            }
        } catch (err) {
            console.warn('Failed to fetch appointments:', err)
        }
    }

  // Track if we've initialized from URL to prevent loops
  const [initializedFromUrl, setInitializedFromUrl] = useState(false)
  // Track if the change is from user action (not URL initialization)
  const isUserActionRef = useRef(false)

  // Fetch users on mount
  useEffect(() => {
    if (user && !userLoading) {
      fetchUsers()
    }
  }, [user, userLoading])

  // Initialize selected user - priority: solo company > URL param > localStorage > first user
  useEffect(() => {
    if (!users || users.length === 0 || initializedFromUrl) return

    // Solo company: only one user â always pin to that user, ignore "all"/URL/localStorage.
    if (users.length === 1) {
      setSelectedUserId(users[0].id)
      setInitializedFromUrl(true)
      try {
        localStorage.setItem('vevago_jobs_selected_user', String(users[0].id))
      } catch (e) {}
      return
    }

    // First, try URL parameter
    const u = searchParams?.get('user')
    if (u) {
      if (u.toLowerCase() === 'all') {
        setSelectedUserId('all')
        setInitializedFromUrl(true)
        // Save to localStorage
        try {
          localStorage.setItem('vevago_jobs_selected_user', 'all')
        } catch (e) {}
        return
      }
      // Accept either numeric id or "First Last" (case-insensitive)
      const byId = users.find(x => String(x.id) === u)
      if (byId) {
        setSelectedUserId(byId.id)
        setInitializedFromUrl(true)
        // Save to localStorage
        try {
          localStorage.setItem('vevago_jobs_selected_user', String(byId.id))
        } catch (e) {}
        return
      }
      const normalized = u.replace(/\+/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ')
      const byName = users.find(x => `${x.first_name} ${x.last_name}`.trim().toLowerCase().replace(/\s+/g, ' ') === normalized)
      if (byName) {
        setSelectedUserId(byName.id)
        setInitializedFromUrl(true)
        // Save to localStorage
        try {
          localStorage.setItem('vevago_jobs_selected_user', String(byName.id))
        } catch (e) {}
        return
      }
    }
    
    // If no URL param, try localStorage
    try {
      const savedUserId = localStorage.getItem('vevago_jobs_selected_user')
      if (savedUserId) {
        if (savedUserId === 'all') {
          setSelectedUserId('all')
          setInitializedFromUrl(true)
          return
        }
        const userId = parseInt(savedUserId)
        if (!isNaN(userId)) {
          const foundUser = users.find(x => x.id === userId)
          if (foundUser) {
            setSelectedUserId(userId)
            setInitializedFromUrl(true)
            return
          }
        }
      }
    } catch (e) {}
    
    // Default: show all jobs
    setSelectedUserId('all')
    setInitializedFromUrl(true)
    try {
      localStorage.setItem('vevago_jobs_selected_user', 'all')
    } catch (e) {}
  }, [users, searchParams, initializedFromUrl])

  // Solo-company guard: if the company shrinks to a single user later, coerce
  // any cached "all" / stale id back to the only user so the filter UI is consistent.
  useEffect(() => {
    if (!users || users.length !== 1) return
    if (selectedUserId !== users[0].id) {
      setSelectedUserId(users[0].id)
      try {
        localStorage.setItem('vevago_jobs_selected_user', String(users[0].id))
      } catch (e) {}
    }
    // In day view there is no "all employees" picker for solo companies; pre-focus
    // the map on the only user so it doesn't render in unfocused/overview mode.
    if (dayFocusUserId !== users[0].id) {
      setDayFocusUserId(users[0].id)
    }
  }, [users, selectedUserId, dayFocusUserId])

  // Persist selected user in URL and localStorage - only after initialization and only on manual changes
  useEffect(() => {
    // Don't run if not initialized yet, or if we don't have the required data
    if (!initializedFromUrl || !users || users.length === 0) return
    
    // Only update URL/localStorage if this change came from a user action (not from URL initialization)
    if (!isUserActionRef.current) return

    const display =
      selectedUserId === 'all'
        ? 'all'
        : (() => {
            const u = users.find(x => x.id === selectedUserId)
            return u ? `${u.first_name} ${u.last_name}`.trim() : null
          })()
    if (!display) return
    const currentUser = searchParams?.get('user')
    
    // Save to localStorage
    try {
      localStorage.setItem('vevago_jobs_selected_user', String(selectedUserId))
    } catch (e) {}
    
    // Only update URL if it's different
    if (currentUser !== display) {
      const params = new URLSearchParams(window.location.search)
      params.set('user', display)
      const newUrl = `${window.location.pathname}?${params.toString()}`
      window.history.replaceState({}, '', newUrl)
    }
    
    // Reset the flag after updating
    isUserActionRef.current = false
  }, [selectedUserId, users, searchParams, initializedFromUrl])

    // Fetch work hours when user changes or users list changes
    useEffect(() => {
        if (users.length > 0 || selectedUserId !== 'all') {
            fetchWorkHours()
        }
    }, [selectedUserId, users])

    // Fetch jobs when week or selected user changes
    useEffect(() => {
        if (user && !userLoading && selectedUserId !== null && selectedUserId !== undefined) {
            console.log(`ð useEffect triggered: fetching jobs for ${viewMode} ${currentWeek}, user ${selectedUserId}`)
            fetchJobsForWeek()
        } else {
            console.log(`â¸ï¸ useEffect skipped: user=${!!user}, userLoading=${userLoading}, selectedUserId=${selectedUserId}`)
        }
    }, [currentWeek, selectedUserId, user, userLoading, viewMode])

    // Mobile week row: align today as the leftmost visible column.
    // Sunday is the exception â scroll as far right as possible.
    useEffect(() => {
        if (viewMode !== 'week') return

        const scrollWeekRow = () => {
            const node = weekScrollContainerRef.current
            if (!node) return
            const isMobile = window.matchMedia('(max-width: 1023px)').matches
            if (!isMobile) return

            const todayIndex = weekDays.findIndex((d) => isToday(d))
            if (todayIndex === -1) {
                node.scrollLeft = 0
                setWeekScrollPosition(0)
                return
            }

            const overflow = Math.max(0, node.scrollWidth - node.clientWidth)

            if (todayIndex === 6) {
                node.scrollLeft = overflow
                setWeekScrollPosition(overflow)
                return
            }

            const todayCol = node.querySelector(`[data-day-index="${todayIndex}"]`) as HTMLElement | null
            if (todayCol) {
                const target = Math.min(Math.max(0, todayCol.offsetLeft), overflow)
                node.scrollLeft = target
                setWeekScrollPosition(target)
            }
        }

        scrollWeekRow()
        const t1 = window.setTimeout(scrollWeekRow, 80)
        const t2 = window.setTimeout(scrollWeekRow, 300)
        const t3 = window.setTimeout(scrollWeekRow, 800)
        window.addEventListener('resize', scrollWeekRow)
        return () => {
            window.clearTimeout(t1)
            window.clearTimeout(t2)
            window.clearTimeout(t3)
            window.removeEventListener('resize', scrollWeekRow)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentWeek, viewMode, loading, jobs.length])


    // Fetch leave for the selected employee (whole year so week navigation needs no re-fetch).
    // Clear immediately on user change so the previous employee's leave can't zero Alex's days.
    useEffect(() => {
        if (selectedUserId === 'all' || !user) {
            setEmployeeLeaveByDate({})
            return
        }
        setEmployeeLeaveByDate({})
        const token = localStorage.getItem('token')
        const year = currentWeek.getFullYear()
        const targetUserId = selectedUserId
        let cancelled = false
        fetch(apiUrl(`/employee-leave/${targetUserId}?from=${year}-01-01&to=${year + 1}-12-31`), {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : { leave: [] })
            .then(d => {
                if (cancelled) return
                const byDate: Record<string, { leave_type: string; hours_off: number | null }> = {}
                for (const e of (d.leave || [])) byDate[e.leave_date] = { leave_type: e.leave_type, hours_off: e.hours_off }
                setEmployeeLeaveByDate(byDate)
            })
            .catch(() => {})
        return () => { cancelled = true }
    }, [selectedUserId, currentWeek, user])

    // "HH:MM" (or "HH:MM:SS") â minutes since midnight. Missing/invalid â Infinity
    // so time-less jobs fall to the bottom of the default sort.
    const parseTimeToMinutes = (t?: string | null): number => {
        if (!t) return Infinity
        const s = String(t).trim()
        if (!s) return Infinity
        const parts = s.split(':')
        const h = parseInt(parts[0] || '', 10)
        const m = parseInt(parts[1] || '0', 10)
        if (Number.isNaN(h)) return Infinity
        return h * 60 + (Number.isNaN(m) ? 0 : m)
    }

    // Filter jobs by day. Sort priority:
    //   1) localStorage route-order (route planner, most recent admin intent)
    //   2) DB route_order (set only when an admin has arranged the day â route
    //      planner run, or a drag-drop on the calendar)
    //   3) Default: scheduled_time_from ascending (earliest first). Time-less
    //      jobs sink to the bottom where creation order decides.
    //
    // Note: we intentionally do NOT use sort_order as a day-level order signal
    // anymore â it's set at creation for every job, so it doesn't distinguish
    // "admin arranged this day" from "nothing has been done here yet".
    const getJobsForDay = (date: Date) => {
        const dateString = toLocalDateString(date)
        const dayJobs = jobs.filter(job => {
          if (toDateOnlyString(job.scheduled_date) !== dateString) return false
          if (
            (job.status === 'cancelled' || job.status === 'deleted')
            && archivedJobIds.has(String(job.id))
          ) {
            return false
          }
          return true
        })

        // Build a per-user position map from the route planner's saved localStorage order
        const savedOrderMap: Record<number, Record<string, number>> = {}
        try {
            if (typeof window !== 'undefined') {
                const company = window.location.pathname.split('/')[1]
                const saved = localStorage.getItem(`route-order-${company}-${dateString}`)
                if (saved) {
                    const orderMap: Record<number, (number | string)[]> = JSON.parse(saved)
                    Object.entries(orderMap).forEach(([uid, ids]) => {
                        const uidNum = Number(uid)
                        savedOrderMap[uidNum] = {}
                        ids.forEach((id, idx) => { savedOrderMap[uidNum][String(id)] = idx })
                    })
                }
            }
        } catch { /* ignore */ }

        return dayJobs.sort((a, b) => {
            // 1) Within the same user: prefer the route planner's explicit saved order
            if (a.assigned_user_id === b.assigned_user_id) {
                const userOrder = savedOrderMap[a.assigned_user_id]
                if (userOrder) {
                    const ia = userOrder[String(a.id)] ?? Infinity
                    const ib = userOrder[String(b.id)] ?? Infinity
                    if (ia !== Infinity || ib !== Infinity) return ia - ib
                }
            }

            // 2) DB route_order â only set after admin has arranged the day.
            //    If either job has one, respect that explicit arrangement.
            if (a.route_order != null || b.route_order != null) {
                const aOrder = a.route_order ?? 999999
                const bOrder = b.route_order ?? 999999
                if (aOrder !== bOrder) return aOrder - bOrder
            }

            // 3) Default: earliest scheduled time first.
            const aMin = parseTimeToMinutes(a.scheduled_time_from)
            const bMin = parseTimeToMinutes(b.scheduled_time_from)
            if (aMin !== bMin) return aMin - bMin

            // Final tiebreakers for time-less jobs: creation order.
            const aSort = a.sort_order ?? 999999
            const bSort = b.sort_order ?? 999999
            if (aSort !== bSort) return aSort - bSort
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
    }

    const openCreateJobForDate = (dateString: string) => {
        setCreateJobClientId(undefined)
        setCreateJobLockClient(false)
        setCreateJobNewClient(null)
        setCreateJobPrefillDate(dateString)
        setCreateJobPrefillUserId(selectedUserId === 'all' ? null : selectedUserId)
        setIsCreateModalOpen(true)
    }

    // Route planner search â start a job for an existing client
    const openCreateJobForClient = (clientId: number) => {
        setCreateJobNewClient(null)
        setCreateJobClientId(clientId)
        setCreateJobLockClient(true)
        setCreateJobPrefillDate(toLocalDateString(currentWeek))
        setCreateJobPrefillUserId(
            dayFocusUserId ?? (selectedUserId === 'all' ? null : selectedUserId),
        )
        setIsCreateModalOpen(true)
    }

    // Route planner search â start a job at a picked map location (new client)
    const openCreateJobForLocation = (loc: RouteLocationPick) => {
        setCreateJobClientId(undefined)
        setCreateJobLockClient(false)
        setCreateJobNewClient({
            address: loc.address,
            zip_code: loc.zip_code,
            city: loc.city,
        })
        setCreateJobPrefillDate(toLocalDateString(currentWeek))
        setCreateJobPrefillUserId(
            dayFocusUserId ?? (selectedUserId === 'all' ? null : selectedUserId),
        )
        setIsCreateModalOpen(true)
    }

    const handleWizardAfterJobCreated = async (info?: { scheduledDate?: string | null }) => {
        if (ownerOnboardingStep !== 'jobs') return
        await advanceOnboardingProgress('route')
        const dateStr = info?.scheduledDate || createJobPrefillDate || toLocalDateString(new Date())
        const [y, m, d] = dateStr.split('-').map(Number)
        if (y && m && d) setCurrentWeek(new Date(y, m - 1, d))
        if (selectedUserId !== 'all') {
            const uid = typeof selectedUserId === 'string' ? parseInt(selectedUserId, 10) : selectedUserId
            openMapPlanner(dateStr, uid)
        } else {
            openMapPlanner(dateStr, null)
        }
    }

    // Get a specific user's scheduled work hours for a day-of-week.
    // Falls back to the standard week while that user's row is still loading.
    const getWorkHoursForUserDay = (userId: number, dayIndex: number): number => {
        return hoursForDayIndex(workHoursByUser[userId], dayIndex)
    }

    // Get work hours for a specific day (dayIndex: 0=Monday … 6=Sunday).
    // Only trust `workHours` when it belongs to the currently selected employee
    // (or the all-team aggregate). Otherwise use that user's cache / defaults —
    // never another employee's schedule.
    const getWorkHoursForDay = (dayIndex: number) => {
        if (selectedUserId === 'all') {
            return hoursForDayIndex(allUsersWorkHours || DEFAULT_WORK_HOURS, dayIndex)
        }
        const uid = Number(selectedUserId)
        if (workHoursOwnerId === uid && workHours) {
            return hoursForDayIndex(workHours, dayIndex)
        }
        if (workHoursByUser[uid]) {
            return hoursForDayIndex(workHoursByUser[uid], dayIndex)
        }
        return hoursForDayIndex(DEFAULT_WORK_HOURS, dayIndex)
    }

    const getStartTimeForDay = (dayIndex: number): string | null => {
        if (selectedUserId === 'all') return null
        const uid = Number(selectedUserId)
        const src =
            (workHoursOwnerId === uid && workHours)
                ? workHours
                : (workHoursByUser[uid] || DEFAULT_WORK_HOURS)
        return startForDayIndex(src, dayIndex)
    }

    // Returns how many hours are unavailable due to leave on a given date string.
    const getLeaveHoursOff = (dateStr: string, baseHours: number): number => {
        if (selectedUserId === 'all') return 0
        const leave = employeeLeaveByDate[dateStr]
        if (!leave) return 0
        switch (leave.leave_type) {
            case 'full_day':           return baseHours
            case 'half_day_morning':
            case 'half_day_afternoon': return baseHours / 2
            case 'custom_hours':       return Math.min(baseHours, leave.hours_off ?? 0)
            default: return 0
        }
    }

    // Convert a single approved appointment into the hours it consumes.
    // - all_day  â full base-hours for the day
    // - hours    â the declared hours_off (capped to the day's capacity)
    // - span     â end - start (in hours, capped to the day's capacity)
    const hoursForAppointment = (a: AppointmentItem, baseHoursForDay: number): number => {
        if (a.time_mode === 'all_day') return baseHoursForDay
        if (a.time_mode === 'hours') return Math.min(baseHoursForDay, a.hours_off ?? 0)
        if (a.time_mode === 'span' && a.start_time && a.end_time) {
            const [sh, sm] = a.start_time.split(':').map((n) => parseInt(n, 10))
            const [eh, em] = a.end_time.split(':').map((n) => parseInt(n, 10))
            const minutes = eh * 60 + em - (sh * 60 + sm)
            return Math.max(0, Math.min(baseHoursForDay, minutes / 60))
        }
        return 0
    }

    // Total approved-appointment hours to deduct from a day's capacity.
    // In "all employees" view we sum approved appointments across users
    // (since the capacity bar itself sums work hours across users).
    // Always scope to the selected employee so a previous user's stale
    // appointments can't zero out someone else's available hours.
    const getApprovedAppointmentHoursForDate = (dateStr: string, baseHoursForDay: number): number => {
        const list = appointmentsByDate[dateStr]
        if (!list || list.length === 0) return 0
        const scoped = selectedUserId === 'all'
            ? list
            : list.filter((a) => Number(a.user_id) === Number(selectedUserId))
        const approved = scoped.filter((a) => a.status === 'approved')
        if (approved.length === 0) return 0
        return approved.reduce((sum, a) => sum + hoursForAppointment(a, baseHoursForDay), 0)
    }

    // Pending request count, used in the page-level heads-up pill.
    const pendingRequestCount = (() => {
        const seen = new Set<number>()
        for (const list of Object.values(appointmentsByDate)) {
            for (const a of list) {
                if (a.status === 'requested') seen.add(a.id)
            }
        }
        return seen.size
    })()

    // Role check â admins can approve/decline requests and edit anyone's
    // appointments. Company-scoped role is preferred (it's what the JWT
    // already carries); we fall back to the platform role for safety.
    const isAdmin = (() => {
        const r = (user?.activeCompany?.role || user?.role || '').toString().toLowerCase()
        return r === 'owner' || r === 'admin'
    })()

    // --- Appointment actions ------------------------------------------------

    const refreshAppointments = async () => {
        // Cheap: the main fetcher already loads appointments for the visible
        // date range, so we just replay it.
        await fetchJobsForWeek()
    }

    const handleApproveAppointment = async (id: number) => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(apiUrl(`/appointments/${id}/approve`), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            })
            if (res.ok) {
                setApptActionsMenu(null)
                await refreshAppointments()
            }
        } catch (err) {
            console.error('approve appointment', err)
        }
    }

    const handleDeclineAppointment = async (id: number) => {
        // Optional reason â shown verbatim on the employee's mobile status
        // page. Empty / cancelled prompt still declines (API allows null).
        const reason = window.prompt(
            t(
                'app.appointments.declineReasonPrompt',
                'Optional: tell the employee why (leave empty to just decline).'
            ),
            ''
        )
        if (reason === null) return // user hit Cancel
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(apiUrl(`/appointments/${id}/decline`), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reason: reason.trim() || null }),
            })
            if (res.ok) {
                setApptActionsMenu(null)
                await refreshAppointments()
            }
        } catch (err) {
            console.error('decline appointment', err)
        }
    }

    const handleDeleteAppointment = async (id: number) => {
        if (!window.confirm(t('app.appointments.confirmDelete', 'Delete this appointment?'))) return
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(apiUrl(`/appointments/${id}`), {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            })
            if (res.ok) {
                setApptActionsMenu(null)
                await refreshAppointments()
            }
        } catch (err) {
            console.error('delete appointment', err)
        }
    }

    const openCreateAppointmentForDate = (dateString: string | null = null) => {
        setEditingAppointment(null)
        setAppointmentPrefillDate(dateString)
        setAppointmentPrefillUserId(selectedUserId === 'all' ? null : selectedUserId)
        setCellAddMenu(null)
        setIsCreateAppointmentOpen(true)
    }

    const openEditAppointment = (a: AppointmentItem) => {
        setEditingAppointment({
            id: a.id,
            user_id: a.user_id,
            title: a.title,
            category: a.category,
            notes: a.notes,
            appointment_date: a.appointment_date,
            end_date: a.end_date ?? null,
            time_mode: a.time_mode,
            start_time: a.start_time,
            end_time: a.end_time,
            hours_off: a.hours_off,
            status: a.status,
        })
        setAppointmentPrefillDate(a.appointment_date)
        setAppointmentPrefillUserId(a.user_id)
        setApptActionsMenu(null)
        setIsCreateAppointmentOpen(true)
    }

    // Render a compact appointment pill used inside week/month day cells.
    // - Approved appointments: solid color-tinted background keyed by category.
    // - Requested appointments: dashed border + "Request" badge so it's clear
    //   they don't yet consume capacity.
    const renderAppointmentPill = (appt: AppointmentItem, compact = false, cellDate?: string) => {
        const cat = APPT_CATEGORY_OPTIONS.find((c) => c.value === appt.category) || APPT_CATEGORY_OPTIONS[APPT_CATEGORY_OPTIONS.length - 1]
        const isPending = appt.status === 'requested'
        // Resolve an "assigned to" name so admins can see whose appointment it is in the all-team view.
        const assignedUser = users.find((u) => Number(u.id) === Number(appt.user_id))
        const assignedName = assignedUser ? `${assignedUser.first_name} ${assignedUser.last_name}`.trim() : ''

        let timeLabel = ''
        if (appt.time_mode === 'span' && appt.start_time && appt.end_time) {
            timeLabel = `${(appt.start_time + '').slice(0, 5)} - ${(appt.end_time + '').slice(0, 5)}`
        } else if (appt.time_mode === 'hours' && appt.hours_off) {
            timeLabel = `${Number(appt.hours_off).toFixed(1)} h`
        } else if (appt.time_mode === 'all_day') {
            const s = String(appt.appointment_date).split('T')[0]
            const e = appt.end_date ? String(appt.end_date).split('T')[0] : ''
            if (e && e > s) {
                const d0 = new Date(`${s}T12:00:00`)
                const d1 = new Date(`${e}T12:00:00`)
                const nd = Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1
                timeLabel = `${nd}d`
            } else {
                timeLabel = t('app.appointments.allDay', 'All day')
            }
        }

        return (
            <div
                key={`appt-${appt.id}-${cellDate ?? appt.appointment_date}`}
                onClick={(e) => {
                    e.stopPropagation()
                    openEditAppointment(appt)
                }}
                className={`group relative rounded-lg ${compact ? 'p-1.5' : 'p-2'} text-xs transition-all cursor-pointer border ${
                    isPending ? 'bg-white border-dashed' : 'bg-white'
                }`}
                style={{
                    borderColor: cat.border,
                    backgroundColor: isPending ? '#ffffff' : cat.bg,
                }}
                title={appt.title}
            >
                <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <CalendarDaysIcon className="w-3 h-3 flex-shrink-0" style={{ color: cat.text }} />
                        <span className="font-semibold truncate" style={{ color: cat.text }}>
                            {appt.title}
                        </span>
                    </div>
                    {/* Requested appointments get a pill so admins can triage at a glance. */}
                    {isPending && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">
                            {t('app.appointments.requestBadge', 'Request')}
                        </span>
                    )}
                    {/* 3-dot actions menu â only meaningful when the user has some action
                        available (admin on any, or owner on their own request/draft). */}
                    {(isAdmin || appt.user_id === (user?.id || -1)) && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                setApptActionsMenu({
                                    id: appt.id,
                                    x: Math.min(rect.right - 180, window.innerWidth - 200),
                                    y: rect.bottom + 4,
                                })
                            }}
                            className={`transition-opacity p-0.5 rounded hover:bg-black/5 flex-shrink-0 ${
                                // Hover-only controls are hard to discover and don't work
                                // well on touch devices; keep the menu trigger visible when
                                // an admin is looking at a pending request.
                                isAdmin && isPending
                                    ? 'opacity-100'
                                    : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                            }`}
                            title={t('app.appointments.moreActions', 'More')}
                        >
                            <EllipsisHorizontalIcon className="w-3.5 h-3.5" style={{ color: cat.text }} />
                        </button>
                    )}
                </div>
                {!compact && (timeLabel || (selectedUserId === 'all' && assignedName)) && (
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-80" style={{ color: cat.text }}>
                        {timeLabel && <span>{timeLabel}</span>}
                        {timeLabel && selectedUserId === 'all' && assignedName && <span>Â·</span>}
                        {selectedUserId === 'all' && assignedName && <span className="truncate">{assignedName}</span>}
                    </div>
                )}
            </div>
        )
    }

    // Calculate occupied time for a day (in hours) â use estimated_duration (all services)
    const getOccupiedTime = (date: Date) => {
        const dayJobs = getJobsForDay(date)
        const totalMinutes = dayJobs.reduce((total, job) => {
            if (job.status === 'cancelled' || job.status === 'deleted') return total
            // Prefer estimated_duration (all services), fall back to total_duration (completed only)
            const raw = job.estimated_duration ?? job.total_duration
            const minutes = raw != null && raw !== '' ? parseFloat(String(raw)) : 0
            return total + (isNaN(minutes) ? 0 : minutes)
        }, 0)
        return totalMinutes / 60
    }

    const getJobMinutesForDay = (date: Date) => Math.round(getOccupiedTime(date) * 60)

    const isDayBlockedFromLeaveOnly = (dateString: string) => {
        if (selectedUserId !== 'all') {
            const leave = employeeLeaveByDate[dateString]
            if (leave?.leave_type === 'full_day') return true
        }
        const appts = appointmentsByDate[dateString] || []
        const relevant = selectedUserId === 'all'
            ? appts
            : appts.filter((a) => Number(a.user_id) === Number(selectedUserId))
        return relevant.some((a) => a.status === 'approved' && a.time_mode === 'all_day')
    }

    const isCalendarDayBlocked = (workHoursNum: number, dateString: string) =>
        dailyCapacityEnabled ? workHoursNum === 0 : isDayBlockedFromLeaveOnly(dateString)

    // Format time duration (compact)
    const formatDuration = (minutes: number) => {
        if (!minutes) return '0m'
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        if (hours > 0) {
            return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`
        }
        return `${mins}m`
    }
    
    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent, job: any) => {
        e.stopPropagation()
        setDraggedJob(job)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(job.id))
    }
    
    const handleDragEnd = () => {
        // Only clear draggedJob if we're not showing the move modal
        // (if modal is showing, we need to keep the job for the confirmation)
        if (!showMoveModal) {
            setDraggedJob(null)
        }
        setDragOverDate(null)
        setDragOverJobId(null)
        setDragOverPosition(null)
    }
    
    const handleDragOver = (e: React.DragEvent, dateString: string) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDragOverDate(dateString)
    }

    const handleDragLeave = () => {
        setDragOverDate(null)
        setDragOverJobId(null)
        setDragOverPosition(null)
    }
    
    const handleDrop = async (e: React.DragEvent, dateString: string) => {
        e.preventDefault()
        e.stopPropagation()
        
        if (!draggedJob) return
        
        const isSameDay = draggedJob.scheduled_date === dateString
        
        // Same-day drops do nothing â job order is set exclusively via the route planner
        if (isSameDay) {
            setDraggedJob(null)
            setDragOverDate(null)
            setDragOverJobId(null)
            setDragOverPosition(null)
            return
        }

        // If dropping on a different day, show the move modal
        if (!isSameDay) {
            // Store the job and date for the modal (before handleDragEnd clears draggedJob)
            setPendingMoveJob(draggedJob)
            setPendingMoveDate(dateString)
            
            // Fetch email template
            const oldDate = new Date(draggedJob.scheduled_date + 'T00:00:00').toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
            const newDate = new Date(dateString + 'T00:00:00').toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
            
            let userName = 'Our team'
            try {
                const u = JSON.parse(localStorage.getItem('user') || '{}')
                if (u.first_name && u.last_name) {
                    userName = `${u.first_name} ${u.last_name}`
                } else if (u.firstName && u.lastName) {
                    userName = `${u.firstName} ${u.lastName}`
                }
            } catch {}
            
            const tf = draggedJob.scheduled_time_from ? String(draggedJob.scheduled_time_from).substring(0, 5) : ''
            const tt = draggedJob.scheduled_time_to   ? String(draggedJob.scheduled_time_to).substring(0, 5)   : ''
            const template = await getEmailTemplate('change_date', {
                clientName: `${draggedJob.name || ''} ${draggedJob.last_name || ''}`.trim(),
                clientFirstName: draggedJob.name || '',
                clientLastName: draggedJob.last_name || '',
                jobDate: oldDate,
                jobOldDate: oldDate,
                jobNewDate: newDate,
                jobTimeFrom: tf,
                jobTimeTo: tt,
                userName: userName,
                companyName: draggedJob.company_name || ''
            })
            
            setMoveTemplate(template)
            setShowMoveModal(true)
            setDragOverDate(null)
            setDragOverJobId(null)
            setDragOverPosition(null)
        } else {
            // Same day but no target job - just clear
            setDraggedJob(null)
            setDragOverDate(null)
            setDragOverJobId(null)
            setDragOverPosition(null)
        }
    }
    
    // Handle move job confirmation
    const handleMoveJob = async ({ notify, message, subject, email: notificationEmail }: { notify: boolean, message: string, subject: string, email?: string }) => {
        // Use the pendingMoveJob (stored at drop time) instead of draggedJob
        const jobToMove = pendingMoveJob
        const targetDate = pendingMoveDate
        
        if (!jobToMove || !targetDate) return
        
        setIsMovingJob(true)
        try {
            const token = localStorage.getItem('token')

            const getProjectedMeta = (j: any): { subscriptionId: number; occurrence: number } | null => {
                const subId = typeof j?.recurring_job_id === 'number' ? j.recurring_job_id : null
                const occ = typeof j?.recurring_occurrence === 'number' ? j.recurring_occurrence : null
                if (subId && occ) return { subscriptionId: subId, occurrence: occ }

                if (typeof j?.id === 'string' && String(j.id).startsWith('subscription-')) {
                    const parts = String(j.id).split('-')
                    if (parts.length >= 3) {
                        const ps = parseInt(parts[1], 10)
                        const po = parseInt(parts[2], 10)
                        if (Number.isFinite(ps) && Number.isFinite(po)) return { subscriptionId: ps, occurrence: po }
                    }
                }
                return null
            }

            let realJobId: number | null = (typeof jobToMove.id === 'number') ? jobToMove.id : null

            // If this is a subscription preview job, materialize it first.
            if (!realJobId && (jobToMove.is_projected || (typeof jobToMove.id === 'string' && String(jobToMove.id).startsWith('subscription-')))) {
                const meta = getProjectedMeta(jobToMove)
                if (!meta) {
                    throw new Error('Could not resolve subscription occurrence to materialize')
                }

                // Create real job for this occurrence on its original date (so move endpoint can log/notify correctly)
                const mat = await fetch(apiUrl(`/subscriptions/${meta.subscriptionId}/occurrences/${meta.occurrence}/materialize`), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ scheduled_date: jobToMove.scheduled_date })
                })
                const matData = await mat.json().catch(() => ({}))
                if (!mat.ok) {
                    const msg = matData.details
                      ? `${matData.error || 'Failed to create real job from subscription'}: ${matData.details}`
                      : (matData.error || 'Failed to create real job from subscription')
                    throw new Error(msg)
                }
                realJobId = matData.jobId
                if (typeof realJobId !== 'number') {
                    throw new Error('Invalid jobId returned from materialize endpoint')
                }
            }

            if (!realJobId) {
                throw new Error('Invalid job id')
            }

            const response = await fetch(apiUrl(`/jobs/${realJobId}/move`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    new_date: targetDate,
                    notify_customer: notify,
                    notification_message: notify ? message : null,
                    notification_subject: notify ? subject : null,
                    notification_email: notify && notificationEmail ? notificationEmail : null
                })
            })
            
            const data = await response.json()
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to move job')
            }
            
            // Refresh jobs
            await fetchJobsForWeek()

            // Auto-update the source column's saved route â remove the moved job from it
            // so remaining jobs stay "planned" and drive time can be recalculated.
            try {
                const sourceDateStr = String(jobToMove.scheduled_date).substring(0, 10)
                const co = window.location.pathname.split('/')[1]
                const routeKey = `route-order-${co}-${sourceDateStr}`
                const stored = localStorage.getItem(routeKey)
                if (stored) {
                    const orderMap: Record<string, (number | string)[]> = JSON.parse(stored)
                    let changed = false
                    for (const userId of Object.keys(orderMap)) {
                        const arr = orderMap[userId]
                        const filtered = arr.filter(id => String(id) !== String(realJobId))
                        if (filtered.length !== arr.length) {
                            orderMap[userId] = filtered
                            changed = true
                            // Re-save sequential route_order to DB for remaining real jobs
                            const validIds = filtered.filter(id => Number.isInteger(Number(id))).map(Number)
                            if (validIds.length > 0) {
                                fetch(apiUrl('/jobs/route-order'), {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ orderedIds: validIds }),
                                }).catch(() => { /* best-effort */ })
                            }
                        }
                    }
                    if (changed) localStorage.setItem(routeKey, JSON.stringify(orderMap))
                }
            } catch { /* best-effort */ }

            // Close modal and clear all drag state
            setShowMoveModal(false)
            setPendingMoveDate(null)
            setPendingMoveJob(null)
            setDraggedJob(null)
        } catch (error: any) {
            console.error('Failed to move job:', error)
            alert('Failed to move job: ' + (error.message || 'Unknown error'))
        } finally {
            setIsMovingJob(false)
        }
    }

    // Format price (compact) â company currency
    const formatPrice = (price: number) => {
        if (!price) return ''
        return formatMoney(price, companyCountryCode)
    }

    // Get address string for display (address â¢ zip city) to match design e.g. "TyttebÃ¦rvej 2 â¢ 2400 KÃ¸benhavn"
    const getAddressDisplay = (job: any) => {
        const parts: string[] = []
        if (job.address) parts.push(job.address)
        const zipCity = [job.zip_code, job.city].filter(Boolean).join(' ')
        if (zipCity) parts.push(zipCity)
        return parts.join(' â¢ ')
    }

    // Handle job click
    const handleJobClick = (job: any) => {
        setViewingJob(job)
        setIsViewModalOpen(true)
    }

  const handleToggleJobCompletion = async (job: any) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const originalId = job.id
      const realJobId = await ensureRealJobIdForAction(job, token)
      const newStatus =
        job.status === 'completed' || job.status === 'sub_completed' ? 'scheduled' : 'completed'

      const response = await fetch(apiUrl(`/jobs/${realJobId}/status`), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update job status')
      }

      const patch = { id: realJobId, status: newStatus, is_projected: false }
      const applyPatch = (prev: any[]) =>
        prev.map((j: any) => (j.id === originalId ? { ...j, ...patch } : j))

      setJobs(applyPatch)
      setAllJobs(applyPatch)
    } catch (error) {
      console.error('Failed to update job status from calendar:', error)
    }
  }

  // Build routes from loaded jobs every time viewMode=day, jobs, or users change.
  // Canonical implementation lives in app/utils/dayRouteShared.ts (shared with the map multitool).
  const buildDayRoutes = useCallback((dayJobs: any[]): UserRoute[] => {
    return buildDayRoutesFromJobs(dayJobs, users)
  }, [users])

  // Geocode addresses that don't have lat/lng yet (Mapbox Geocoding API).
  // Includes home (start/end) pins â they are not written to DB (isReal false).
  const geocodeMissingAddresses = useCallback(async (routes: UserRoute[]) => {
    if (!MAPBOX_TOKEN) return
    const token = localStorage.getItem('token')
    const toGeocode: { routeUserId: number; jobIdx: number; jobId: number | string; isReal: boolean; address: string }[] = []
    routes.forEach(route => {
      route.jobs.forEach((job, jobIdx) => {
        if (job.is_cancelled) return
        // Geocode when no coords yet (jobs or home start/end)
        if ((!job.has_own_coords || job.is_home) && job.address && (job.lat == null || job.lng == null)) {
          const isReal = !job.is_home && !job.is_projected && Number.isInteger(Number(job.id))
          toGeocode.push({ routeUserId: route.userId, jobIdx, jobId: job.id, isReal, address: job.address })
        }
      })
    })
    if (toGeocode.length === 0) return
    setDayGeocodingCount(toGeocode.length)

    // Use the centroid of already-known coordinates as a geographic proximity hint.
    // This dramatically improves accuracy: Mapbox will prefer results near existing pins
    // rather than returning the same street name from a different country.
    const knownCoords = routes.flatMap(r =>
      r.jobs.filter(j => j.lat != null && j.lng != null && Number.isFinite(j.lat) && Number.isFinite(j.lng))
    )
    const proximityParam = knownCoords.length > 0
      ? `&proximity=${(knownCoords.reduce((s, j) => s + j.lng, 0) / knownCoords.length).toFixed(4)},${(knownCoords.reduce((s, j) => s + j.lat, 0) / knownCoords.length).toFixed(4)}`
      : ''

    for (const item of toGeocode) {
      try {
        const encoded = encodeURIComponent(item.address)
        const res = await fetch(
          // types=address,place â broader than just "address" so partial/unnumbered addresses also match
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&types=address,place&limit=1${proximityParam}`
        )
        const data = await res.json()
        if (data.features?.[0]) {
          const [lng, lat] = data.features[0].center as [number, number]
          // Only persist to DB for real (non-projected) jobs with an actual DB row
          if (item.isReal) {
            await fetch(apiUrl(`/jobs/${item.jobId}/coordinates`), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ lat, lng }),
            })
          }
          // Always update local state so the pin appears on the map this session.
          // For projected jobs this is session-only (no DB row to save to).
          setDayRoutes(prev => prev.map(route => {
            if (route.userId !== item.routeUserId) return route
            return {
              ...route,
              jobs: route.jobs.map(j => j.id === item.jobId ? { ...j, lat, lng, has_own_coords: item.isReal } : j),
            }
          }))
        } else {
          console.warn('[geocode] no result for:', item.address, '(jobId:', item.jobId, ')')
        }
      } catch (err) {
        console.warn('[geocode] error for jobId', item.jobId, ':', err)
      }
      setDayGeocodingCount(c => Math.max(0, c - 1))
      await new Promise(r => setTimeout(r, 200))
    }
    setDayGeocodingCount(0)
  }, [])

  // Fetch driving times + road geometry from Mapbox Directions API.
  // Canonical implementation lives in app/utils/dayRouteShared.ts (shared with the map multitool).
  const fetchDirections = useCallback(async (route: UserRoute): Promise<Partial<UserRoute>> => {
    return fetchRouteDirections(route)
  }, [])

  // Debounced directions refresh â runs when job order OR coordinates change
  useEffect(() => {
    if (viewMode !== 'day') return
    if (directionsFetchTimeoutRef.current) clearTimeout(directionsFetchTimeoutRef.current)
    directionsFetchTimeoutRef.current = setTimeout(async () => {
      const routeSnapshot = dayRoutes
      if (routesHaveDirections(routeSnapshot)) return

      const patches = new Map<number, Partial<UserRoute>>()
      // Only re-fetch routes whose geometry was cleared (e.g. the 2 affected by a reassign).
      // Routes that still have geometry keep their existing lines â no wasted API calls.
      await Promise.all(
        routeSnapshot
          .filter(route => route.routeGeometry == null)
          .map(async route => {
            const patch = await fetchDirections(route)
            patches.set(route.userId, patch)
          })
      )

      // Capture baseline totalMinutes per user the first time we have directions
      const dateStr = toLocalDateString(currentWeek)
      setDayBaselineMinutes(prev => {
        if (dayBaselineDate === dateStr && Object.keys(prev).length > 0) return prev
        const next: Record<number, number> = {}
        routeSnapshot.forEach(route => {
          const patch = patches.get(route.userId)
          const total = patch?.totalMinutes ?? route.totalMinutes
          if (total != null) next[route.userId] = total
        })
        setDayBaselineDate(dateStr)
        return next
      })
      // Apply patches onto the CURRENT state (prev) â not the stale snapshot â
      // so any coordinates that geocoding wrote between snapshot and now are preserved.
      setDayRoutes(prev => {
        const next = prev.map(prevRoute => {
          const patch = patches.get(prevRoute.userId)
          if (!patch || Object.keys(patch).length === 0) return prevRoute
          return {
            ...prevRoute,
            totalMinutes: patch.totalMinutes ?? prevRoute.totalMinutes,
            totalKm: patch.totalKm ?? prevRoute.totalKm,
            routeGeometry: patch.routeGeometry ?? prevRoute.routeGeometry,
            jobs: prevRoute.jobs.map(prevJob => {
              const patchJob = (patch.jobs ?? []).find(j => j.id === prevJob.id)
              if (!patchJob) return prevJob
              return { ...prevJob, legMinutes: patchJob.legMinutes, etaMinutes: patchJob.etaMinutes }
            }),
          }
        })
        const dateStr = toLocalDateString(currentWeek)
        const fp = dayRouteCacheFpRef.current.get(dateStr)
        if (fp && routesHaveDirections(next)) {
          dayRouteCacheRef.current.set(dateStr, next)
        }
        return next
      })
    }, 600)
    return () => { if (directionsFetchTimeoutRef.current) clearTimeout(directionsFetchTimeoutRef.current) }
  // dayRoutesVersion ensures re-fetch even when coordinates haven't changed
  // (e.g. after Save & Apply rebuilds routes with the same lat/lng)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRoutes.map(r => r.jobs.map(j => `${j.id}:${j.lat?.toFixed(5)}:${j.lng?.toFixed(5)}`).join(',')).join('|'), viewMode, dayRoutesVersion, currentWeek, dayBaselineDate])

  // Build initial routes when entering day view or when jobs/users change.
  // Injects start/end (home) waypoints when company has route locations enabled.
  useEffect(() => {
    if (viewMode !== 'day') return
    const dayDate = currentWeek
    const dateStr = toLocalDateString(dayDate)
    const dayJobs = allJobs.filter(j => toDateOnlyString(j.scheduled_date) === dateStr)
    // Use ref (not state) so drag-reassigns don't trigger a full rebuild here.
    const dayJobsWithPending = dayJobs.map(j => ({
      ...j,
      assigned_user_id: pendingAssigneeChangesRef.current[j.id] ?? j.assigned_user_id
    }))
    const jobsFp = buildDayJobsFingerprint(dayJobsWithPending)
    // Read the PREVIOUS fingerprint before overwriting, so we can detect job changes.
    const prevFp = dayRouteCacheFpRef.current.get(dateStr)
    dayRouteCacheFpRef.current.set(dateStr, jobsFp)

    const cachedRoutes = dayRouteCacheRef.current.get(dateStr)
    if (cachedRoutes && prevFp === jobsFp) {
      setDayRoutes(cachedRoutes)
      if (routesHaveDirections(cachedRoutes)) return
    }

    const routes = buildDayRoutes(dayJobsWithPending)

    // Re-apply saved route order from localStorage (middle jobs only; no start/end in saved order).
    try {
      const companySlug = window.location.pathname.split('/')[1]
      const saved = localStorage.getItem(`route-order-${companySlug}-${dateStr}`)
      if (saved) {
        const orderMap: Record<number, (number | string)[]> = JSON.parse(saved)
        routes.forEach((route, idx) => {
          const savedIds = orderMap[route.userId]
          if (!savedIds) return
          routes[idx] = {
            ...route,
            jobs: [...route.jobs].sort((a, b) => {
              const ia = savedIds.indexOf(a.id as never)
              const ib = savedIds.indexOf(b.id as never)
              if (ia === -1 && ib === -1) return 0
              if (ia === -1) return 1
              if (ib === -1) return -1
              return ia - ib
            }),
          }
        })
      }
    } catch { /* ignore */ }

    // Async: fetch company + work-hours and inject start/end waypoints when feature is on
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }

    ;(async () => {
      let enhancedRoutes: UserRoute[] = routes
      try {
        const companyRes = await fetch(apiUrl('/companies/profile'), { headers })
        const companyData = companyRes.ok ? await companyRes.json() : null
        const defaultStart = (companyData?.company?.defaultStartAddress || '').trim()
        const defaultEnd = (companyData?.company?.defaultEndAddress || defaultStart).trim()

        enhancedRoutes = await Promise.all(
          routes.map(async (route): Promise<UserRoute> => {
            let startAddr = ''
            let endAddr = ''
            try {
              const whRes = await fetch(apiUrl(`/work-hours/${route.userId}`), { headers })
              if (whRes.ok) {
                const whData = await whRes.json()
                const wh = whData.workHours
                const useDefault = wh?.use_company_default_location !== false
                if (useDefault) {
                  startAddr = defaultStart
                  endAddr = defaultEnd || defaultStart
                } else {
                  startAddr = (wh?.start_address || '').trim()
                  endAddr = (wh?.end_address || wh?.start_address || '').trim()
                  if (!endAddr && startAddr) endAddr = startAddr
                }
              } else {
                startAddr = defaultStart
                endAddr = defaultEnd || defaultStart
              }
            } catch {
              startAddr = defaultStart
              endAddr = defaultEnd || defaultStart
            }

            if (!startAddr) return route

            const jobs = [...route.jobs]
            jobs.unshift({
              id: `start-${route.userId}`,
              lat: null,
              lng: null,
              label: 'Start (home)',
              address: startAddr,
              is_home: true,
              has_own_coords: true,
            } as RouteJob)
            jobs.push({
              id: `end-${route.userId}`,
              lat: null,
              lng: null,
              label: 'End (home)',
              address: endAddr || startAddr,
              is_home: true,
              has_own_coords: true,
            } as RouteJob)
            return { ...route, jobs }
          })
        )
      } catch { /* ignore */ }

      setDayRoutes(enhancedRoutes)
      if (routesHaveDirections(enhancedRoutes)) {
        dayRouteCacheRef.current.set(dateStr, enhancedRoutes)
      }
      setDayRoutesVersion(v => v + 1)
      geocodeMissingAddresses(enhancedRoutes)
    })()
  // pendingAssigneeChanges intentionally omitted â changes are read via ref to avoid
  // rebuilding routes from scratch every time a job is drag-reassigned.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, currentWeek, allJobs, users, buildDayRoutes, geocodeMissingAddresses])

  // Reorder handler â updates local state only (save via Save & apply button)
  const handleDayReorder = useCallback((userId: number, newJobs: RouteJob[]) => {
    setDayRoutes(prev => {
      const next = prev.map(r =>
        r.userId === userId
          ? {
              ...r,
              jobs: newJobs,
              // Clear stale directions so they re-fetch for the new stop order.
              routeGeometry: undefined,
              totalMinutes: undefined,
              totalKm: undefined,
            }
          : r,
      )
      const dateStr = toLocalDateString(currentWeek)
      dayRouteCacheRef.current.delete(dateStr)
      return next
    })
  }, [currentWeek])

  // Move a stop from one employee to another (drag-and-drop on the map/sidebar).
  // Inserts the job at the cheapest position in the target route, clears stale
  // directions on BOTH routes so they redraw, and records the assignee change
  // so it is persisted on the next save.
  const handleReassignJob = useCallback((
    jobId: number | string,
    fromUserId: number,
    toUserId: number,
  ) => {
    if (fromUserId === toUserId) return
    setDayRoutes(prev => {
      const fromRoute = prev.find(r => r.userId === fromUserId)
      const toRoute = prev.find(r => r.userId === toUserId)
      if (!fromRoute || !toRoute) return prev
      const moving = fromRoute.jobs.find(j => String(j.id) === String(jobId))
      if (!moving || moving.is_home) return prev

      const nextFromJobs = fromRoute.jobs.filter(j => String(j.id) !== String(jobId))

      // Find the cheapest insertion slot among the target's middle stops so the
      // redrawn line looks sensible (straight-line proxy; Mapbox draws the road).
      const tJobs = [...toRoute.jobs]
      const firstMiddle = tJobs.findIndex(j => !j.is_home)
      let lastMiddle = -1
      for (let i = tJobs.length - 1; i >= 0; i--) { if (!tJobs[i].is_home) { lastMiddle = i; break } }
      let insertAt = lastMiddle >= 0 ? lastMiddle + 1 : (firstMiddle >= 0 ? firstMiddle : tJobs.length)

      if (moving.lat != null && moving.lng != null && firstMiddle >= 0) {
        const d = (aLat: number, aLng: number, bLat: number, bLng: number) => {
          const dLat = aLat - bLat
          const dLng = (aLng - bLng) * Math.cos((aLat * Math.PI) / 180)
          return Math.sqrt(dLat * dLat + dLng * dLng)
        }
        // Candidate slots are between consecutive located stops (home included as anchors).
        const located = tJobs.filter(j => j.lat != null && j.lng != null)
        let bestCost = Infinity
        for (let i = 0; i < located.length - 1; i++) {
          const a = located[i], b = located[i + 1]
          const cost =
            d(a.lat as number, a.lng as number, moving.lat as number, moving.lng as number) +
            d(moving.lat as number, moving.lng as number, b.lat as number, b.lng as number) -
            d(a.lat as number, a.lng as number, b.lat as number, b.lng as number)
          if (cost < bestCost) {
            bestCost = cost
            const idxInAll = tJobs.findIndex(j => String(j.id) === String(b.id))
            if (idxInAll >= 0) insertAt = idxInAll
          }
        }
      }

      const nextToJobs = [...tJobs]
      nextToJobs.splice(insertAt, 0, { ...moving, assigned_user_id: toUserId } as RouteJob)

      const next = prev.map(r => {
        if (r.userId === fromUserId) {
          return { ...r, jobs: nextFromJobs, routeGeometry: undefined, totalMinutes: undefined, totalKm: undefined }
        }
        if (r.userId === toUserId) {
          return { ...r, jobs: nextToJobs, routeGeometry: undefined, totalMinutes: undefined, totalKm: undefined }
        }
        return r
      })
      const dateStr = toLocalDateString(currentWeek)
      dayRouteCacheRef.current.delete(dateStr)
      return next
    })

    // Record the assignee move so Save & Apply persists it to the server.
    if (Number.isInteger(Number(jobId))) {
      setPendingAssigneeChanges(prev => ({ ...prev, [jobId]: toUserId }))
    }
  }, [currentWeek])

  // ââ Manual "Draw route" mode âââââââââââââââââââââââââââââââââââââââââââââââââ
  //   The user clicks middle stops (in the focused user's route) one by one to
  //   assign them order numbers. When every middle stop has a number we apply
  //   the order via handleDayReorder and exit draw mode.
  const handleDrawStart = useCallback(() => {
    const uid =
      dayFocusUserId ?? (dayRoutes.length === 1 ? dayRoutes[0]?.userId ?? null : null)
    const route = uid != null ? dayRoutes.find(r => r.userId === uid) : null
    const tm = route?.totalMinutes
    drawCompareBaselineRef.current =
      tm != null && Number.isFinite(tm) && tm > 0 ? tm : null
    if (drawRouteComparisonTimerRef.current) {
      clearTimeout(drawRouteComparisonTimerRef.current)
      drawRouteComparisonTimerRef.current = null
    }
    // Ensure focusUserId is set so RouteMap can identify the draw target.
    // For solo companies dayFocusUserId stays null, which would leave the map
    // unable to compute drawTargetUserId correctly.
    if (uid != null && dayFocusUserId == null) {
      setDayFocusUserId(uid)
    }
    setDrawRouteComparison(null)
    setDrawMode(true)
    setDrawOrder([])
    clearJobHover()
  }, [dayFocusUserId, dayRoutes, clearJobHover])

  const handleDrawExit = useCallback(() => {
    drawCompareBaselineRef.current = null
    if (drawRouteComparisonTimerRef.current) {
      clearTimeout(drawRouteComparisonTimerRef.current)
      drawRouteComparisonTimerRef.current = null
    }
    setDrawRouteComparison(null)
    setDrawMode(false)
    setDrawOrder([])
    clearJobHover()
  }, [clearJobHover])

  const handleDrawReset = useCallback(() => {
    setDrawOrder([])
  }, [])

  const dayDrawUserId =
    dayFocusUserId ?? (dayRoutes.length === 1 ? dayRoutes[0]?.userId ?? null : null)

  const handleDrawAssign = useCallback((jobId: number | string) => {
    const userId = dayDrawUserId
    if (userId == null) return
    const route = dayRoutes.find(r => r.userId === userId)
    if (!route) return
    const middleJobs = route.jobs.filter(j => !j.is_cancelled && !j.is_home)
    const middleIds = new Set(middleJobs.map(j => String(j.id)))
    if (!middleIds.has(String(jobId))) return

    setDrawOrder(prev => {
      const idx = prev.findIndex(id => String(id) === String(jobId))
      // Toggle: clicking an already-numbered stop removes it (and shifts the rest).
      if (idx !== -1) return prev.filter(id => String(id) !== String(jobId))
      const next = [...prev, jobId]
      // If that completes the order, apply it on the next tick.
      if (next.length === middleJobs.length) {
        const orderedMiddle = next
          .map(id => middleJobs.find(j => String(j.id) === String(id)))
          .filter((j): j is RouteJob => !!j)
        const startJob = route.jobs.length > 0 && route.jobs[0].is_home ? route.jobs[0] : null
        const endJob = route.jobs.length > 1 && route.jobs[route.jobs.length - 1].is_home
          ? route.jobs[route.jobs.length - 1]
          : null
        const cancelled = route.jobs.filter(j => j.is_cancelled)
        const fullOrder = [
          ...(startJob ? [startJob] : []),
          ...orderedMiddle,
          ...(endJob ? [endJob] : []),
          ...cancelled,
        ]
        const routeForDirections: UserRoute = { ...route, jobs: fullOrder }
        queueMicrotask(() => {
          void (async () => {
            const baseline = drawCompareBaselineRef.current
            try {
              const patch = await fetchDirections(routeForDirections)
              const newTotal = patch.totalMinutes
              if (
                baseline != null &&
                newTotal != null &&
                Math.abs(baseline - newTotal) >= 0.5
              ) {
                if (drawRouteComparisonTimerRef.current) {
                  clearTimeout(drawRouteComparisonTimerRef.current)
                  drawRouteComparisonTimerRef.current = null
                }
                setDrawRouteComparison({ diffMinutes: baseline - newTotal })
                drawRouteComparisonTimerRef.current = setTimeout(() => {
                  setDrawRouteComparison(null)
                  drawRouteComparisonTimerRef.current = null
                }, 8000)
              }
            } catch {
              /* ignore */
            }
          })()
        })
        setTimeout(() => {
          handleDayReorder(userId, fullOrder)
          setDrawMode(false)
          setDrawOrder([])
          clearJobHover()
        }, 280)
      }
      return next
    })
  }, [dayDrawUserId, dayRoutes, handleDayReorder, fetchDirections])

  // Auto-exit draw mode if the focused user changes or there's no focus anymore
  useEffect(() => {
    if (!drawMode) return
    if (dayDrawUserId == null) {
      drawCompareBaselineRef.current = null
      if (drawRouteComparisonTimerRef.current) {
        clearTimeout(drawRouteComparisonTimerRef.current)
        drawRouteComparisonTimerRef.current = null
      }
      setDrawRouteComparison(null)
      setDrawMode(false)
      setDrawOrder([])
    }
  }, [dayDrawUserId, drawMode])

  // When user changes assignee from the route planner slideout, store pending change and update viewing job (no API until Save & apply)
  const handlePlannerAssigneeChange = useCallback((jobId: number, newUserId: number) => {
    setPendingAssigneeChanges(prev => ({ ...prev, [jobId]: newUserId }))
    setViewingJob(prev => prev?.id === jobId ? { ...prev, assigned_user_id: newUserId } : prev)
  }, [])

  // Save the current route order to DB and update local job state.
  // Pass userId to save only that employee; omit to save all with unsaved changes.
  const handleSaveRoute = useCallback(async (userId?: number) => {
    const routesToSaveBase = userId != null
      ? dayRoutes.filter(r => r.userId === userId)
      : dayRoutes.filter(r => unsavedUserIds.includes(r.userId))
    if (routesToSaveBase.length === 0) return

    const token = localStorage.getItem('token')
    if (!token) return

    const dateStrEarly = toLocalDateString(currentWeek)

    // Ghost/subscription fillers must become real jobs before they can join the round.
    let routesToSave = routesToSaveBase
    try {
      const { materializeProjectedJobsInList } = await import('@/app/utils/materializeRouteJobs')
      const results = await Promise.all(routesToSaveBase.map(async (route) => {
        const { jobs, changed } = await materializeProjectedJobsInList(route.jobs, {
          token,
          scheduledDate: dateStrEarly,
        })
        return { route: { ...route, jobs }, changed }
      }))
      routesToSave = results.map(r => r.route)
      if (results.some(r => r.changed)) {
        setDayRoutes(prev => prev.map(r => {
          const next = routesToSave.find(m => m.userId === r.userId)
          return next ?? r
        }))
      }
    } catch (err) {
      console.error('[Save & Apply] materialize-before-save failed', err)
      return
    }

    const allJobIds = routesToSave.flatMap(r =>
      r.jobs.filter(j => !j.is_projected && Number.isInteger(Number(j.id))).map(j => Number(j.id))
    )
    console.log('[Save & Apply] allJobIds:', allJobIds.length, allJobIds)
    if (allJobIds.length === 0) {
      console.warn('[Save & Apply] No real job IDs found after materialize. Route order not saved.')
      return
    }

    let res: Response
    try {
      res = await fetch(apiUrl('/jobs/route-order'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orderedIds: allJobIds }),
      })
    } catch (err) {
      console.error('[route-order] Network error â is the API server running?', err)
      return
    }
    if (!res.ok) {
      console.error('[route-order] Save failed:', res.status, await res.text())
      return
    }
    if (drawRouteComparisonTimerRef.current) {
      clearTimeout(drawRouteComparisonTimerRef.current)
      drawRouteComparisonTimerRef.current = null
    }
    setDrawRouteComparison(null)
    drawCompareBaselineRef.current = null

    // Baseline becomes the saved route â deltas only count from the next edit
    const dateStrForBaseline = toLocalDateString(currentWeek)
    setDayBaselineMinutes(prev => {
      const next = { ...prev }
      routesToSave.forEach(route => {
        const tm = route.totalMinutes
        if (tm != null && Number.isFinite(tm)) next[route.userId] = tm
      })
      return next
    })
    setDayBaselineDate(dateStrForBaseline)
    // Do NOT call setJobs here. Updating jobs.route_order would trigger the build-routes
    // useEffect (jobs is in its dependency array), which calls setDayRoutes(freshRoutes) and
    // immediately overwrites the user's reordered dayRoutes. The DB already has the correct
    // order; dayRoutes already reflects the user's intent; nothing else needs updating.
    // Mark this day as planned and persist across page refreshes
    const dateStr = toLocalDateString(currentWeek)
    setPlannedDays(prev => {
      const next = new Set(prev)
      next.add(dateStr)
      try {
        const key = `planned-days-${window.location.pathname.split('/')[1]}`
        localStorage.setItem(key, JSON.stringify([...next]))
      } catch { /* ignore */ }
      return next
    })

    // Persist route order to localStorage (exclude home start/end so they stay fixed).
    try {
      const company = window.location.pathname.split('/')[1]
      const storageKey = `route-order-${company}-${dateStr}`
      let orderMap: Record<number, (number | string)[]> = {}
      try { orderMap = JSON.parse(localStorage.getItem(storageKey) ?? '{}') } catch { /* ignore */ }
      routesToSave.forEach(route => {
        orderMap[route.userId] = route.jobs.filter(j => !j.is_home).map(j => j.id)
      })
      localStorage.setItem(storageKey, JSON.stringify(orderMap))
    } catch { /* ignore */ }

    // Persist pending assignee changes (from route planner) so jobs are actually moved on the server
    const pending = { ...pendingAssigneeChanges }
    const hadAssigneePending = Object.keys(pending).length > 0
    if (hadAssigneePending) {
      setPendingAssigneeChanges({})
      await Promise.all(
        Object.entries(pending).map(([jobIdStr, newUserId]) =>
          fetch(apiUrl(`/jobs/${jobIdStr}/assignee`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ assigned_user_id: newUserId, notifyCustomer: false })
          })
        )
      )
      fetchJobsForWeek()
    }

    // Persist each saved route as a planned package (and Round) even when Mapbox
    // directions can't run yet — job order + status=planned is the hard requirement.
    await Promise.all(routesToSave.map(async route => {
      const realJobs = route.jobs.filter(j => !j.is_projected && !j.is_cancelled && !j.is_home && Number.isInteger(Number(j.id)))
      if (realJobs.length === 0) return

      const waypointJobs = route.jobs.filter(j => j.lat && j.lng && !j.is_cancelled)
      const totalJobMins = realJobs.reduce((sum, j) => sum + (j.estimated_duration_minutes ?? 0), 0)

      let totalDriveMins: number | null = route.totalMinutes != null ? Math.round(route.totalMinutes) : null
      let totalKm: number | null = route.totalKm != null ? Math.round(route.totalKm * 10) / 10 : null
      let legMins: (number | null)[] = []
      let routeGeometry: string | null = route.routeGeometry?.coordinates
        ? JSON.stringify(route.routeGeometry.coordinates)
        : null

      try {
        if (waypointJobs.length >= 2) {
          const dirRoute = { ...route, jobs: waypointJobs }
          const directions = await fetchDirections(dirRoute)
          if (totalDriveMins == null && directions.totalMinutes != null) {
            totalDriveMins = Math.round(directions.totalMinutes)
          }
          if (totalKm == null && directions.totalKm != null) {
            totalKm = Math.round(directions.totalKm * 10) / 10
          }
          legMins = realJobs.map(real => {
            const idx = (directions.jobs ?? []).findIndex(j => j.id === real.id)
            const j = idx >= 0 ? (directions.jobs ?? [])[idx] : null
            return j?.legMinutes != null ? Math.round(j.legMinutes * 10) / 10 : null
          })
        }
      } catch { /* directions best-effort */ }

      try {
        console.log('[Save & Apply]', dateStr, {
          user: route.userId,
          jobCount: realJobs.length,
          totalDriveMins,
          totalJobMins: Math.round(totalJobMins),
          totalKm,
        })

        const saveRes = await fetch(apiUrl('/daily-routes'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            user_id: route.userId,
            scheduled_date: dateStr,
            job_ids: realJobs.map(j => Number(j.id)),
            leg_minutes: legMins.length > 0 ? legMins : null,
            total_minutes: totalDriveMins,
            total_job_minutes: Math.round(totalJobMins),
            total_km: totalKm,
            route_geometry: routeGeometry,
            status: 'planned',
            ...(() => {
              const prior = (dailyRoutesByDate[dateStr] || []).find(m => m.user_id === route.userId)
              if (!(prior?.round_template_id || prior?.name)) return {}
              const base = (prior?.name || route.userName || 'Round').trim()
              const name = /\(modified\)\s*$/i.test(base) ? base : `${base} (modified)`
              return { name }
            })(),
          }),
        })
        if (!saveRes.ok) {
          console.error('[Save & Apply] daily-routes save failed:', saveRes.status, await saveRes.text())
        } else {
          const body = await saveRes.json().catch(() => null)
          console.log('[Save & Apply] saved to DB', { round_id: body?.round_id })
          if (totalDriveMins != null) {
            setTravelMinutes(prev => ({ ...prev, [`${dateStr}:${route.userId}`]: totalDriveMins! }))
          }
        }
      } catch (err) {
        console.error('[Save & Apply] daily-routes network error', err)
      }
    }))

    // Mark saved users as clean
    setSavedFingerprintsByUser(prev => {
      const next = { ...prev }
      routesToSave.forEach(r => { next[r.userId] = buildUserFingerprint(r) })
      return next
    })
    dayRouteCacheRef.current.set(toLocalDateString(currentWeek), dayRoutes)

    // Optimistically mark each saved employee day as a planned round package so the
    // week board can show the connected container immediately (server sync follows).
    setDailyRoutesByDate(prev => {
      const next = { ...prev }
      const list = [...(next[dateStr] || [])]
      for (const route of routesToSave) {
        const jobIds = route.jobs
          .filter(j => !j.is_projected && !j.is_home && Number.isInteger(Number(j.id)))
          .map(j => Number(j.id))
        const idx = list.findIndex(m => m.user_id === route.userId)
        const prior = idx >= 0 ? list[idx] : null
        const priorName = (prior?.name || '').trim()
        const nextName = (prior?.round_template_id || priorName)
          ? (/\(modified\)\s*$/i.test(priorName || 'Round')
              ? (priorName || 'Round (modified)')
              : `${priorName || 'Round'} (modified)`)
          : (prior?.name ?? null)
        const base = {
          user_id: route.userId,
          scheduled_date: dateStr,
          status: 'planned' as const,
          name: nextName,
          round_template_id: prior?.round_template_id ?? null,
          round_id: prior?.round_id ?? null,
          is_occurrence_override: prior?.round_template_id != null ? true : (prior?.is_occurrence_override ?? null),
          job_ids: jobIds,
        }
        if (idx >= 0) list[idx] = { ...list[idx], ...base, id: list[idx].id }
        else list.push({ id: -route.userId, ...base })
      }
      next[dateStr] = list
      return next
    })
    setDailyRoutesTick(tick => tick + 1)
    // Refresh week jobs so materialized subscription rows replace ghosts in the board.
    try { fetchJobsForWeek() } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRoutes, unsavedUserIds, currentWeek, fetchDirections, pendingAssigneeChanges, buildUserFingerprint, dailyRoutesByDate])

  // Wizard "Save and complete setup" button handler
  const handleCompleteSetupFromWizard = useCallback(async () => {
    // Save all unsaved routes for the day
    await handleSaveRoute()
    // Advance the onboarding step to 'business' (company name entry)
    await advanceOnboardingProgress('business')
    // Fire GTM conversion event
    if (typeof window !== 'undefined') {
      window.dataLayer = window.dataLayer || []
      window.dataLayer.push({ event: 'onboarding_complete' })
    }
    // Show the company name popup immediately
    setShowBusinessPopup(true)
  }, [handleSaveRoute])

  // Auto-optimize the day's route: fastest visiting order via Mapbox drive matrix + 2-opt.
  // Runs entirely in the browser so it works regardless of API server state, and keeps
  // every located stop (including string-id subscription/projected jobs).
  const handleDayOptimize = useCallback(async (userId: number) => {
    const route = dayRoutes.find(r => r.userId === userId)
    if (!route) return

    const showNotice = (msg: string, ms = 6000) => {
      setOptimizeNotice(msg)
      if (optimizeNoticeTimerRef.current) clearTimeout(optimizeNoticeTimerRef.current)
      optimizeNoticeTimerRef.current = setTimeout(() => setOptimizeNotice(null), ms)
    }

    // Every middle stop with coordinates is routable, no matter the id type.
    const middleJobs = route.jobs.filter(
      j => !j.is_cancelled && !j.is_home && j.lat != null && j.lng != null,
    )
    if (middleJobs.length < 2) {
      showNotice(t('app.routePlanner.optimizeNeedTwoStops', 'Need at least 2 located stops to optimize.'))
      return
    }

    setDayOptimizing(true)
    setOptimizeNotice(null)

    const startJob = route.jobs.find(j => j.is_home && String(j.id).startsWith('start-'))
    const endJob = route.jobs.find(j => j.is_home && String(j.id).startsWith('end-'))

    try {
      const result = await optimizeMiddleJobsClient(
        middleJobs.map(j => ({ id: j.id, lat: j.lat as number, lng: j.lng as number })),
        {
          start: startJob?.lat != null && startJob?.lng != null
            ? { lat: startJob.lat, lng: startJob.lng }
            : null,
          end: endJob?.lat != null && endJob?.lng != null
            ? { lat: endJob.lat, lng: endJob.lng }
            : null,
        },
      )

      // Re-order the middle jobs by the optimized id sequence; keep every stop.
      const middleById = new Map(middleJobs.map(j => [String(j.id), j] as const))
      const optimizedMiddle = result.orderedIds
        .map(id => middleById.get(String(id)))
        .filter((j): j is RouteJob => !!j)
      // Append any stop missing from the optimized list (safety; shouldn't happen).
      const placed = new Set(optimizedMiddle.map(j => String(j.id)))
      for (const j of middleJobs) {
        if (!placed.has(String(j.id))) optimizedMiddle.push(j)
      }

      const noCoordJobs = route.jobs.filter(
        j => !j.is_cancelled && !j.is_home && (j.lat == null || j.lng == null),
      )
      const cancelledJobs = route.jobs.filter(j => j.is_cancelled)
      const newOrder: RouteJob[] = [
        ...(startJob ? [startJob] : []),
        ...optimizedMiddle,
        ...noCoordJobs,
        ...(endJob ? [endJob] : []),
        ...cancelledJobs,
      ]
      handleDayReorder(userId, newOrder)

      const savedMinutes = (result.beforeSeconds - result.afterSeconds) / 60
      if (Number.isFinite(savedMinutes) && savedMinutes >= 0.5) {
        if (drawRouteComparisonTimerRef.current) clearTimeout(drawRouteComparisonTimerRef.current)
        setDrawRouteComparison({ diffMinutes: savedMinutes })
        drawRouteComparisonTimerRef.current = setTimeout(() => {
          setDrawRouteComparison(null)
          drawRouteComparisonTimerRef.current = null
        }, 8000)
      } else {
        showNotice(t('app.routePlanner.optimizeAlreadyFast', 'This is already the fastest order we found.'))
      }
    } catch (err) {
      console.warn('[optimize-day] failed', err)
      showNotice(t('app.routePlanner.optimizeFailed', 'Could not optimize this route. Try again in a moment.'))
    }
    setDayOptimizing(false)
  }, [dayRoutes, handleDayReorder, t])

  // ââ Bulk / multi-employee route optimisation ââââââââââââââââââââââââââââââ

  const handleBulkOptimize = useCallback(async (
    userIds: number[],
    allowReassign: boolean,
    onProgress: (p: { step: number; total: number; message: string }) => void,
  ) => {
    if (userIds.length === 0) return

    if (!allowReassign) {
      // ââ Simple mode: run existing single-employee optimizer in sequence ââ
      const total = userIds.length
      for (let i = 0; i < userIds.length; i++) {
        const uid = userIds[i]
        const route = dayRoutes.find(r => r.userId === uid)
        const name = route?.userName ?? `Employee ${i + 1}`
        onProgress({ step: i, total, message: `Optimising route for ${name}â¦` })
        await handleDayOptimize(uid)
        await new Promise(r => setTimeout(r, 80))
      }
      onProgress({ step: total, total, message: 'Done!' })
      return
    }

    // ââ Reassign mode: adaptive geo-first territory assignment ââââââââââââââ
    //
    // Goal: each employee owns a tight, contiguous area. We anchor every
    // employee at their home/start location and give each job to the nearest
    // anchor (a Voronoi partition). Employees who share an anchor (e.g. one
    // shared company depot) are split apart with compact k-means so nobody
    // ends up with two disjoint blobs. Workload is NOT balanced â geography
    // decides everything, which is what produces sensible, local routes.

    const routes = dayRoutes.filter(r => userIds.includes(r.userId))
    const k = routes.length
    const totalSteps = k + 2
    let step = 0

    // 1. Pool all locatable, non-cancelled, non-home jobs
    onProgress({ step: step++, total: totalSteps, message: 'Pooling jobsâ¦' })
    await new Promise(r => setTimeout(r, 30))

    type PooledJob = RouteJob & { _origUserId: number }
    const pooled: PooledJob[] = routes.flatMap(route =>
      route.jobs
        .filter(j => !j.is_cancelled && !j.is_home && j.lat != null && j.lng != null)
        .map(j => ({ ...j, _origUserId: route.userId })),
    )

    if (pooled.length === 0) {
      onProgress({ step: totalSteps, total: totalSteps, message: 'No jobs to reassign.' })
      return
    }

    // Longitude shrinks toward the poles â scale it by cos(latitude) so that
    // squared distances reflect real ground distance (critical this far north).
    const refLat = pooled.reduce((s, j) => s + (j.lat as number), 0) / pooled.length
    const LNG_SCALE = Math.cos((refLat * Math.PI) / 180)
    const dist2 = (a: [number, number], b: [number, number]) => {
      const dLat = a[0] - b[0]
      const dLng = (a[1] - b[1]) * LNG_SCALE
      return dLat * dLat + dLng * dLng
    }

    // Compact geographic clustering used only to split a shared anchor.
    const kMeans = (points: [number, number][], numK: number, maxIter = 60): number[] => {
      if (numK <= 1 || points.length === 0) return points.map(() => 0)
      if (numK >= points.length) return points.map((_, i) => i % numK)
      const centroids: [number, number][] = [points[Math.floor(Math.random() * points.length)]]
      while (centroids.length < numK) {
        const dists = points.map(p => Math.min(...centroids.map(c => dist2(p, c))))
        const total = dists.reduce((s, d) => s + d, 0)
        let rand = Math.random() * total
        let chosen = points[points.length - 1]
        for (let i = 0; i < points.length; i++) {
          rand -= dists[i]
          if (rand <= 0) { chosen = points[i]; break }
        }
        centroids.push([...chosen] as [number, number])
      }
      let assignments = new Array(points.length).fill(0)
      for (let iter = 0; iter < maxIter; iter++) {
        const next = points.map(p => {
          let best = 0, bestD = Infinity
          centroids.forEach((c, ci) => { const d = dist2(p, c); if (d < bestD) { bestD = d; best = ci } })
          return best
        })
        if (next.every((a, i) => a === assignments[i])) break
        assignments = next
        for (let ci = 0; ci < numK; ci++) {
          const clPts = points.filter((_, i) => assignments[i] === ci)
          if (clPts.length === 0) {
            centroids[ci] = points[Math.floor(Math.random() * points.length)]
          } else {
            centroids[ci] = [
              clPts.reduce((s, p) => s + p[0], 0) / clPts.length,
              clPts.reduce((s, p) => s + p[1], 0) / clPts.length,
            ]
          }
        }
      }
      return assignments
    }

    // 2. Anchor each employee. Prefer their geocoded home/start, else the
    //    centroid of their current jobs, else the global centroid.
    onProgress({ step: step++, total: totalSteps, message: 'Mapping territoriesâ¦' })
    await new Promise(r => setTimeout(r, 30))

    const globalCentroid: [number, number] = [
      refLat,
      pooled.reduce((s, j) => s + (j.lng as number), 0) / pooled.length,
    ]
    const anchorOf = (route: UserRoute): [number, number] => {
      const home = route.jobs.find(
        j => j.is_home && String(j.id).startsWith('start-') && j.lat != null && j.lng != null,
      )
      if (home) return [home.lat as number, home.lng as number]
      const own = route.jobs.filter(j => !j.is_cancelled && !j.is_home && j.lat != null && j.lng != null)
      if (own.length > 0) {
        return [
          own.reduce((s, j) => s + (j.lat as number), 0) / own.length,
          own.reduce((s, j) => s + (j.lng as number), 0) / own.length,
        ]
      }
      return globalCentroid
    }
    const anchors: [number, number][] = routes.map(anchorOf)

    // Group employees that share (almost) the same anchor. 3-decimal rounding
    // â 100 m, so everyone on a single shared depot lands in one group.
    const keyOf = (a: [number, number]) => `${a[0].toFixed(3)},${a[1].toFixed(3)}`
    const groupByKey = new Map<string, number[]>()
    anchors.forEach((a, ei) => {
      const key = keyOf(a)
      const existing = groupByKey.get(key)
      if (existing) existing.push(ei)
      else groupByKey.set(key, [ei])
    })
    const groups = [...groupByKey.values()].map(members => ({
      members,
      anchor: [
        members.reduce((s, ei) => s + anchors[ei][0], 0) / members.length,
        members.reduce((s, ei) => s + anchors[ei][1], 0) / members.length,
      ] as [number, number],
    }))

    // 3. Assign every job to the nearest anchor group.
    const groupJobs: PooledJob[][] = groups.map(() => [])
    pooled.forEach(job => {
      let best = 0, bestD = Infinity
      groups.forEach((g, gi) => {
        const d = dist2([job.lat as number, job.lng as number], g.anchor)
        if (d < bestD) { bestD = d; best = gi }
      })
      groupJobs[best].push(job)
    })

    // 4. Within each group, hand jobs to members. A solo member takes the
    //    whole territory; shared anchors are split into compact sub-blobs.
    const employeeJobs: PooledJob[][] = Array.from({ length: k }, () => [])
    groups.forEach((g, gi) => {
      const jobs = groupJobs[gi]
      if (g.members.length === 1) {
        employeeJobs[g.members[0]] = jobs
        return
      }
      const sub = kMeans(jobs.map(j => [j.lat as number, j.lng as number]), g.members.length)
      g.members.forEach((ei, ci) => {
        employeeJobs[ei] = jobs.filter((_, ji) => sub[ji] === ci)
      })
    })

    // 5. For each employee, run TSP on their assigned territory.
    for (let ei = 0; ei < k; ei++) {
      const route = routes[ei]
      const uid = route.userId

      const middleJobs: PooledJob[] = employeeJobs[ei]
      onProgress({
        step: step++,
        total: totalSteps,
        message: `Optimising ${route.userName} (${middleJobs.length} stop${middleJobs.length !== 1 ? 's' : ''})â¦`,
      })

      const startJob = route.jobs.find(j => j.is_home && String(j.id).startsWith('start-'))
      const endJob   = route.jobs.find(j => j.is_home && String(j.id).startsWith('end-'))
      const noCoords = route.jobs.filter(j => !j.is_cancelled && !j.is_home && (j.lat == null || j.lng == null))
      const cancelled = route.jobs.filter(j => j.is_cancelled)

      let orderedMiddle: RouteJob[] = middleJobs

      if (middleJobs.length >= 2) {
        try {
          const result = await optimizeMiddleJobsClient(
            middleJobs.map(j => ({ id: j.id, lat: j.lat as number, lng: j.lng as number })),
            {
              start: startJob?.lat != null ? { lat: startJob.lat, lng: startJob.lng } : null,
              end:   endJob?.lat   != null ? { lat: endJob.lat,   lng: endJob.lng   } : null,
            },
          )
          const byId = new Map(middleJobs.map(j => [String(j.id), j as RouteJob] as const))
          const sorted = result.orderedIds.map(id => byId.get(String(id))).filter((j): j is RouteJob => !!j)
          const placed = new Set(sorted.map(j => String(j.id)))
          for (const j of middleJobs) { if (!placed.has(String(j.id))) sorted.push(j) }
          orderedMiddle = sorted
        } catch {
          // fall back to unoptimised order
        }
      }

      handleDayReorder(uid, [
        ...(startJob  ? [startJob]  : []),
        ...orderedMiddle,
        ...noCoords,
        ...(endJob    ? [endJob]    : []),
        ...cancelled,
      ])
      await new Promise(r => setTimeout(r, 80))
    }

    onProgress({ step: totalSteps, total: totalSteps, message: 'All routes updated!' })
  }, [dayRoutes, handleDayOptimize, handleDayReorder])

  const formatLeaveBadge = (leaveType: string, hoursOff: number | null) => {
    switch (leaveType) {
      case 'full_day':
        return t('app.jobsPage.leaveFullDay')
      case 'half_day_morning':
        return t('app.jobsPage.leaveHalfAm')
      case 'half_day_afternoon':
        return t('app.jobsPage.leaveHalfPm')
      case 'custom_hours':
        return t('app.jobsPage.leaveHoursOff').replace('{{hours}}', String(hoursOff ?? '?'))
      default:
        return t('app.jobsPage.leave')
    }
  }

    if (userLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-page">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent"></div>
                    <p className="mt-2 text-primary-500">{t('app.jobsPage.loading')}</p>
                </div>
            </div>
        )
    }

    return (
        <AppLayout>
            <div className="space-y-4 overflow-x-hidden max-w-full flex-1 flex flex-col min-h-0">
                {apiError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <div className="text-sm text-red-800 font-medium">{t('app.jobsPage.errorTitle')}</div>
                    <div className="text-xs text-red-700 mt-1">{apiError}</div>
                    <div className="text-xs text-red-700 mt-2">{t('app.jobsPage.errorHint')}</div>
                  </div>
                )}
                {/* Top Bar â hidden in day view (calendar nav lives on the map overlay).
                    Mobile-first: arrows + label form the first row; the user pill and
                    view switcher are full-width on a second row so they breathe. */}
                {viewMode !== 'day' && <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
                    {/* Row 1: nav arrows + Today + month/year + pending pill */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <button
                            onClick={viewMode === 'month' ? goToPreviousMonth : goToPreviousWeek}
                            className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors flex-shrink-0"
                            aria-label={viewMode === 'month' ? t('app.jobsPage.prevMonth') : t('app.jobsPage.prevWeek')}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button
                            onClick={viewMode === 'month' ? goToNextMonth : goToNextWeek}
                            className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors flex-shrink-0"
                            aria-label={viewMode === 'month' ? t('app.jobsPage.nextMonth') : t('app.jobsPage.nextWeek')}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                        <button
                            onClick={viewMode === 'month' ? goToCurrentMonth : goToCurrentWeek}
                            className="text-sm font-medium text-gray-700 hover:text-primary-600 underline flex-shrink-0"
                        >
                            {t('app.jobsPage.today')}
                        </button>
                        <span className="text-sm font-medium text-primary-500 truncate">
                            {viewMode === 'month'
                                ? currentWeek.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })
                                : weekDays[0].toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })
                            }
                        </span>
                        {isAdmin && pendingRequestCount > 0 && (
                            <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0"
                                title={t(
                                    'app.appointments.pendingRequestsHint',
                                    'Employee requests waiting for your review'
                                )}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                {t(
                                    'app.appointments.pendingRequestsPill',
                                    '{{count}} pending'
                                ).replace('{{count}}', String(pendingRequestCount))}
                            </span>
                        )}
                    </div>

                    {/* Row 2: user pill + view switcher. Stacks below the nav on
                        mobile and shrinks the segmented control so all 4 modes fit
                        on a 360px viewport. */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1 md:flex-initial md:max-w-[200px] border border-accent-500/70 rounded-full px-3 py-1.5 bg-white">
                            <UserCircleIcon className="w-5 h-5 text-accent-500 flex-shrink-0" />
                            <div className="relative flex-1 min-w-0">
                                {users.length === 1 ? (
                                    <span className="block truncate text-sm font-medium text-accent-500 py-1 pr-1">
                                        {users[0].first_name} {users[0].last_name}
                                    </span>
                                ) : (
                                    <>
                                        <select
                                            value={selectedUserId === 'all' ? 'all' : String(selectedUserId || '')}
                                            onChange={(e) => {
                                                isUserActionRef.current = true
                                                const raw = e.target.value
                                                if (raw === 'all') { setSelectedUserId('all'); return }
                                                const id = parseInt(raw)
                                                if (!isNaN(id)) setSelectedUserId(id)
                                            }}
                                            className="w-full bg-transparent border-none text-sm font-medium text-accent-500 focus:ring-0 focus:outline-none cursor-pointer appearance-none pr-6 py-1"
                                        >
                                            <option value="all">{t('app.jobsPage.allTeam')}</option>
                                            {users.map((u) => (
                                                <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                                            ))}
                                        </select>
                                        <ChevronDownIcon className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex rounded-lg bg-gray-100 p-0.5 flex-shrink-0">
                            {(['day','week','month','year'] as const).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => {
                                      if (m === 'day') {
                                        const date = toLocalDateString(currentWeek)
                                        const uid = selectedUserId !== 'all' ? Number(selectedUserId) : null
                                        openMapPlanner(date, Number.isFinite(uid as number) ? uid : null)
                                        return
                                      }
                                      setViewMode(m)
                                    }}
                                    className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${viewMode === m ? 'bg-accent-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                >
                                    {m === 'day' ? t('app.jobsPage.viewDay') : m === 'week' ? t('app.jobsPage.viewWeek') : m === 'month' ? t('app.jobsPage.viewMonth') : t('app.jobsPage.viewYear')}
                                </button>
                            ))}
                        </div>
                        {viewMode === 'week' && (
                          <button
                            type="button"
                            onClick={() => setWeekPlanOpen(true)}
                            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-accent-500/40 bg-accent-50 text-accent-700 text-xs font-semibold hover:bg-accent-100 flex-shrink-0"
                          >
                            <CalendarDaysIcon className="w-4 h-4" />
                            {t('app.weekPlanner.title', 'Plan week')}
                          </button>
                        )}
                    </div>
                </div>}

                {/* ââ Day view: full-screen overlay.
                    Desktop (lg+):  fixed, offset by the 200px sidebar, side-by-side.
                    Mobile/tablet:  takes over below the sticky top bar; we stack
                    the route panel on top of the map so both are reachable.
                    The hardcoded `left: 200` is gone â we use Tailwind so it can
                    flex with the new responsive shell. */}
                {viewMode === 'day' && (() => {
                  const handleBackToWeek = () => {
                    setViewMode('week')
                    setDayFocusUserId(null)
                    clearJobHover()
                    drawCompareBaselineRef.current = null
                    if (drawRouteComparisonTimerRef.current) {
                      clearTimeout(drawRouteComparisonTimerRef.current)
                      drawRouteComparisonTimerRef.current = null
                    }
                    setDrawRouteComparison(null)
                    setDrawMode(false)
                    setDrawOrder([])
                  }
                  const handleClearEmployee = () => {
                    setDayFocusUserId(null)
                    setDrawMode(false)
                    setDrawOrder([])
                    clearJobHover()
                    // Cancel any pending debounced clear so the immediate null wins.
                    if (isolateClearTimerRef.current) {
                      clearTimeout(isolateClearTimerRef.current)
                      isolateClearTimerRef.current = null
                    }
                    setIsolatedLeg(null)
                  }
                  const handleMobileSheetBack = () => {
                    if (dayFocusUserId != null && dayRoutes.length > 1) handleClearEmployee()
                    else handleBackToWeek()
                  }

                  const weekDayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                  const selectRouteDay = (day: Date) => {
                    setCurrentWeek(new Date(day))
                    setMobileRouteDayPickerOpen(false)
                  }
                  const dayBubbleWeekday = currentWeek
                    .toLocaleDateString(dateLocale, { weekday: 'short' })
                    .replace(/\./g, '')
                    .slice(0, 3)

                  const dayWeekPicker = (variant: 'desktop' | 'mobile-expanded') => {
                    const isMobileExpanded = variant === 'mobile-expanded'
                    return (
                    <>
                      <div
                        className={`flex items-center rounded-2xl w-full ${ROUTE_MAP_GLASS_PANEL} ${
                          isMobileExpanded
                            ? 'gap-0.5 px-1 py-2'
                            : 'gap-1 px-1.5 py-1.5 sm:px-3.5 sm:py-3 sm:gap-2'
                        }`}
                        style={ROUTE_MAP_GLASS_STYLE}
                      >
                        <button
                          type="button"
                          onClick={goToPreviousWeek}
                          className={`flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-white/50 transition-all flex-shrink-0 ${
                            isMobileExpanded ? 'w-9 h-9' : 'w-8 h-8'
                          }`}
                          title={t('app.jobsPage.prevWeek')}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <div
                          className={`flex items-center flex-1 min-w-0 ${
                            isMobileExpanded
                              ? 'justify-center gap-0.5'
                              : 'justify-between gap-0.5 sm:gap-1'
                          }`}
                        >
                          {weekDays.map((day, i) => {
                            const isSelected = toLocalDateString(day) === toLocalDateString(currentWeek)
                            const isTodayDay = isToday(day)
                            const isWeekend = i >= 5
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => (
                                  isMobileExpanded
                                    ? selectRouteDay(day)
                                    : setCurrentWeek(new Date(day))
                                )}
                                className={`flex flex-col items-center justify-center rounded-full transition-all duration-150 flex-shrink-0 ${
                                  isMobileExpanded ? 'w-11 h-11' : 'w-8 h-8 sm:w-10 sm:h-10'
                                } ${
                                  isSelected
                                    ? 'bg-accent-500 text-white shadow-md shadow-accent-500/30 scale-105'
                                    : isTodayDay
                                    ? 'bg-accent-50/90 text-accent-700 ring-2 ring-accent-400/50'
                                    : isWeekend
                                    ? 'bg-white/50 text-gray-400 hover:bg-white/70'
                                    : 'bg-white/55 text-gray-600 hover:bg-white/75'
                                }`}
                              >
                                <span className={`font-bold leading-none uppercase tracking-wide ${
                                  isMobileExpanded ? 'text-[9px]' : 'text-[8px] sm:text-[9px]'
                                } ${isSelected ? 'text-white/70' : 'text-current opacity-60'}`}>
                                  {weekDayLetters[i]}
                                </span>
                                <span className={`font-bold leading-none mt-0.5 ${
                                  isMobileExpanded ? 'text-[14px]' : 'text-[12px] sm:text-[13px]'
                                }`}>{day.getDate()}</span>
                              </button>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={goToNextWeek}
                          className={`flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-white/50 transition-all flex-shrink-0 ${
                            isMobileExpanded ? 'w-9 h-9' : 'w-8 h-8'
                          }`}
                          title={t('app.jobsPage.nextWeek')}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                      {variant === 'desktop' && (
                        <p className="text-[11px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] mt-1.5 text-center tracking-wide">
                          {weekDays[0].toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </>
                  )}

                  const routePanel = (
                      <DayRoutePanel
                        companySlug={companySlug}
                        routes={dayRoutes}
                        focusUserId={dayFocusUserId}
                        onSelectUser={setDayFocusUserId}
                        onClearUser={handleClearEmployee}
                        onReorder={handleDayReorder}
                        onJobOpen={id => {
                          if (drawMode) return
                          // Look up from the full dataset so we always have assigned_user_id, even when
                          // the main jobs list is filtered to a single employee.
                          const job = allJobs.find(j => j.id === id)
                          if (job) { setViewingJob(job); setIsViewModalOpen(true) }
                        }}
                        onOptimize={handleDayOptimize}
                        optimizing={dayOptimizing}
                        geocodingCount={dayGeocodingCount}
                        onSave={handleSaveRoute}
                        onSaveAll={hasUnsavedRouteChanges ? () => handleSaveRoute() : undefined}
                        onDiscardUser={handleDiscardUser}
                        onDiscardAll={hasUnsavedRouteChanges ? handleDiscardAll : undefined}
                        unsavedUserIds={unsavedUserIds}
                        onBulkOptimize={handleBulkOptimize}
                        onHoverUser={setAllPanelHoveredUserId}
                        onAllPanelSelectionChange={setAllPanelSelectedIds}
                        onBackToWeek={handleBackToWeek}
                        dateLabel={currentWeek.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'short' })}
                        highlightedJobId={hoveredJobId}
                        onJobCardHover={handleJobHover}
                        onIsolateRoute={handleIsolateRoute}
                        baselineMinutesByUser={dayBaselineMinutes}
                        availableMinutesByUser={Object.fromEntries(
                          dayRoutes.map(r => [
                            r.userId,
                            Math.round(getWorkHoursForUserDay(r.userId, (currentWeek.getDay() + 6) % 7) * 60),
                          ])
                        )}
                        drawMode={drawMode}
                        drawOrder={drawOrder}
                        onDrawStart={handleDrawStart}
                        onDrawAssign={handleDrawAssign}
                        onDrawReset={handleDrawReset}
                        onDrawExit={handleDrawExit}
                        drawRouteComparison={drawRouteComparison}
                        optimizeNotice={optimizeNotice}
                        onAddJob={() => openCreateJobForDate(toLocalDateString(currentWeek))}
                        isWizardMode={inRouteWizard}
                        onCompleteSetup={handleCompleteSetupFromWizard}
                        mobileSheet={!isDesktopRoute}
                        hasUnsavedChanges={hasUnsavedRouteChanges}
                        date={toLocalDateString(currentWeek)}
                        plannedMetaByUser={Object.fromEntries(
                          (dailyRoutesByDate[toLocalDateString(currentWeek)] || [])
                            .filter((m) => m.status === 'planned')
                            .map((m) => [
                              m.user_id,
                              {
                                id: m.id,
                                name: m.name,
                                status: m.status,
                                round_template_id: m.round_template_id,
                                is_occurrence_override: m.is_occurrence_override,
                              },
                            ])
                        )}
                        onRoundSaved={() => {
                          setDailyRoutesTick((tick) => tick + 1)
                          fetchJobsForWeek()
                        }}

                        wrapMobileSheet={
                          !isDesktopRoute
                            ? ({ body, toolbar }) => (
                                <MobileRouteSheet
                                  snapPoints={[...MOBILE_ROUTE_SHEET_SNAPS]}
                                  initialSnap={MOBILE_ROUTE_SHEET_INITIAL_SNAP}
                                  toolbar={toolbar}
                                >
                                  {body}
                                </MobileRouteSheet>
                              )
                            : undefined
                        }
                      />
                  )
                  return (
                  <div className="fixed inset-0 z-[45] lg:z-10 flex flex-col lg:flex-row top-0 left-0 lg:left-[200px]">
                    {/* Desktop: static left column beside the map */}
                    {isDesktopRoute && (
                      <div className="w-[380px] flex-shrink-0 flex flex-col overflow-hidden h-full">
                        {routePanel}
                      </div>
                    )}

                    {/* Map: full-bleed on mobile, fills remaining space on desktop */}
                    <div className="flex-1 relative overflow-hidden">
                      <RouteMap
                        routes={dayRoutes}
                        focusUserId={dayFocusUserId}
                        onJobClick={id => {
                          if (drawMode) { handleDrawAssign(id); return }
                          const job = allJobs.find(j => j.id === id)
                          if (job) { setViewingJob(job); setIsViewModalOpen(true) }
                        }}
                        className="w-full h-full"
                        highlightedJobId={hoveredJobId}
                        onPinHover={handleJobHover}
                        isolatedLeg={isolatedLeg}
                        isDirectionsLoading={dayRoutes.some(r =>
                          !r.routeGeometry && r.jobs.filter(j => j.lat && j.lng && !j.is_cancelled).length >= 2
                        )}
                        drawMode={drawMode}
                        drawUserId={dayDrawUserId}
                        drawOrder={drawOrder}
                        onDrawAssign={handleDrawAssign}
                        onReassignJob={handleReassignJob}
                        visibleUserIds={mapIsolatedUserIds}
                        fitInsets={!isDesktopRoute ? MOBILE_ROUTE_MAP_FIT_INSETS : undefined}
                        showZoomControl={isDesktopRoute}
                      />

                      {/* Desktop: calendar floats on the map */}
                      {isDesktopRoute && (
                      <div className="absolute top-3 left-3 right-3 sm:right-auto z-20 pointer-events-auto select-none">
                        {dayWeekPicker('desktop')}
                      </div>
                      )}

                      {/* Mobile: back + create job search + day bubble */}
                      {!isDesktopRoute && (
                      <div
                        ref={mobileRouteHeaderRef}
                        className="absolute left-3 right-3 z-40 pointer-events-auto select-none"
                        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleMobileSheetBack}
                            className={`flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full text-gray-800 active:scale-95 transition-all duration-200 ${ROUTE_MAP_GLASS_PILL}`}
                            style={ROUTE_MAP_GLASS_STYLE}
                            title={
                              dayFocusUserId != null && dayRoutes.length > 1
                                ? t('app.routePlanner.allEmployees', 'All employees')
                                : t('app.routePlanner.backToWeek', 'Back to week view')
                            }
                            aria-label={t('app.routePlanner.backToWeek', 'Back to week view')}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <div className="flex-1 min-w-0">
                            <RouteAddSearch
                              clients={routeClients}
                              countryCode={companyCountryCode}
                              appearance="glass"
                              placeholder={t('app.routePlanner.createJob', 'Create a job')}
                              onFocus={() => setMobileRouteDayPickerOpen(false)}
                              onPickClient={openCreateJobForClient}
                              onPickLocation={openCreateJobForLocation}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setMobileRouteDayPickerOpen(open => !open)}
                            className={`flex-shrink-0 h-12 min-w-[3.25rem] px-2 flex flex-col items-center justify-center rounded-full active:scale-95 transition-all duration-200 ${
                              mobileRouteDayPickerOpen
                                ? 'bg-accent-500/95 backdrop-blur-md backdrop-saturate-150 border border-white/60 text-white shadow-xl shadow-accent-500/25'
                                : `${ROUTE_MAP_GLASS_PILL} text-gray-800`
                            }`}
                            style={
                              mobileRouteDayPickerOpen
                                ? {
                                    WebkitBackdropFilter: 'blur(12px) saturate(1.5)',
                                    backdropFilter: 'blur(12px) saturate(1.5)',
                                  }
                                : ROUTE_MAP_GLASS_STYLE
                            }
                            aria-label={t('app.jobsPage.pickDay', 'Pick a day')}
                            aria-expanded={mobileRouteDayPickerOpen}
                          >
                            <span className={`text-[10px] font-bold leading-none uppercase tracking-wide ${mobileRouteDayPickerOpen ? 'text-white/85' : 'text-gray-500'}`}>
                              {dayBubbleWeekday}
                            </span>
                            <span className="text-[15px] font-bold leading-none mt-0.5 tabular-nums">{currentWeek.getDate()}</span>
                          </button>
                        </div>
                        {mobileRouteDayPickerOpen && (
                          <div className="mt-2.5 w-full animate-in fade-in slide-in-from-top-1 duration-200">
                            {dayWeekPicker('mobile-expanded')}
                          </div>
                        )}
                      </div>
                      )}

                      {/* Mobile: bottom sheet (save bar pinned above day picker) */}
                      {!isDesktopRoute && routePanel}
                    </div>
                  </div>
                  )
                })()}

                {/* ÔöÇÔöÇ Month / Week views ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ */}
                {viewMode !== 'day' && (
                <div className="bg-[#fff] rounded-xl p-2 sm:p-[10px] flex flex-col overflow-hidden max-w-full flex-1 min-h-0">
                {viewMode === 'month' ? (
                    /* Month Calendar View. Header row shows only the first
                       letter of each weekday on mobile so the columns don't
                       force a horizontal overflow on narrow phones. */
                    <div className="space-y-1.5 sm:space-y-2">
                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1 sm:mb-2">
                            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                                const d = new Date(2024, 0, 1 + i)
                                const longLabel = d.toLocaleDateString(dateLocale, { weekday: 'short' })
                                const shortLabel = d.toLocaleDateString(dateLocale, { weekday: 'narrow' })
                                return (
                                <div key={i} className="text-center text-[10px] sm:text-xs font-semibold text-gray-600 py-1 sm:py-2">
                                    <span className="sm:hidden">{shortLabel}</span>
                                    <span className="hidden sm:inline">{longLabel}</span>
                                </div>
                                )
                            })}
                        </div>
                        {/* Calendar grid */}
                        <div className="grid grid-cols-7 gap-1 sm:gap-2">
                            {getMonthDays().map((day, index) => {
                                const dayJobs = getJobsForDay(day)
                                const dateString = toLocalDateString(day)
                                const isDragOver = dragOverDate === dateString
                                const isTodayBanner = isToday(day)
                                const isCurrentMonth = day.getMonth() === currentWeek.getMonth()
                                
                                // Calculate capacity bar for this day
                                const jsDayOfWeek = day.getDay()
                                const dayOfWeekIndex = jsDayOfWeek === 0 ? 6 : jsDayOfWeek - 1
                                const workHoursForDay = getWorkHoursForDay(dayOfWeekIndex)
                                const occupiedHours = getOccupiedTime(day)
                                const baseHoursM = typeof workHoursForDay === 'number' ? workHoursForDay : parseFloat(workHoursForDay) || 0
                                const leaveHoursOffM = getLeaveHoursOff(dateString, baseHoursM)
                                const apptHoursOffM = getApprovedAppointmentHoursForDate(dateString, baseHoursM)
                                const workHoursNum = Math.max(0, baseHoursM - leaveHoursOffM - apptHoursOffM)

                                // "Blocked day" = 0 hours available (weekend, full-day leave,
                                // all-day appointment, etc.). Drives the diagonal-stripe overlay
                                // and the muted styling on any jobs still scheduled here.
                                const isDayBlocked = isCalendarDayBlocked(workHoursNum, dateString)

                                // If there are jobs but 0 available hours (day off or no hours set), show red
                                const hasJobsButNoHours = dailyCapacityEnabled && dayJobs.length > 0 && workHoursNum === 0
                                
                                const monthJobMins = getJobMinutesForDay(day)
                                const monthDriveMins = (() => {
                                    if (typeof selectedUserId === 'number') {
                                        return travelMinutes[`${dateString}:${selectedUserId}`] ?? 0
                                    }
                                    const userIds = [...new Set(dayJobs.map((j: { assigned_user_id?: number }) => Number(j.assigned_user_id)).filter(Boolean))]
                                    return userIds.reduce((sum, uid) => sum + (travelMinutes[`${dateString}:${uid}`] ?? 0), 0)
                                })()
                                // Calculate utilization - if jobs exist but no hours, treat as 100%+ (red)
                                const utilizationPercent = hasJobsButNoHours 
                                    ? 100 
                                    : (workHoursNum > 0 ? (occupiedHours / workHoursNum) * 100 : 0)
                                
                                // Cap at 100% - if over 100%, show all red (don't extend beyond container).
                                // Color tiers: green Ôëñ80%, amber 80-100%, red >100% or jobs with 0 hours.
                                const barPercent = Math.min(100, utilizationPercent)
                                const barColor = hasJobsButNoHours || utilizationPercent > 100
                                    ? '#EF4444'
                                    : utilizationPercent >= 80
                                        ? '#F59E0B'
                                        : utilizationPercent > 0
                                            ? '#3DD57A'
                                            : 'transparent'
                                // Build a compact breakdown tooltip: jobs -À appointments -À capacity -À over.
                                const apptCountToday = (appointmentsByDate[dateString] || [])
                                    .filter((a) => a.status === 'approved' && (selectedUserId === 'all' || Number(a.user_id) === Number(selectedUserId)))
                                    .length
                                const overHours = Math.max(0, occupiedHours - workHoursNum)
                                const barTooltip =
                                    `${dayJobs.length} ${t('app.jobsPage.jobs', 'jobs')} -À ` +
                                    `${apptCountToday} ${t('app.appointments.label', 'appointments')} -À ` +
                                    `${workHoursNum.toFixed(1)}h ${t('app.jobsPage.capacity', 'capacity')}` +
                                    (overHours > 0 ? ` -À ${overHours.toFixed(1)}h ${t('app.jobsPage.over', 'over')}` : '')
                                
                                return (
                                    <div
                                        key={index}
                                        className={`flex flex-col rounded-lg sm:rounded-xl overflow-hidden bg-[#FCFCFC] p-1.5 sm:p-[10px] relative min-h-[70px] sm:min-h-[120px] ${
                                            !isCurrentMonth ? 'opacity-50' : ''
                                        } ${isDragOver ? 'ring-2 ring-accent-500/50' : ''} ${
                                            isTodayBanner ? 'ring-2 ring-accent-500' : ''
                                        }`}
                                        onDragOver={(e) => handleDragOver(e, dateString)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, dateString)}
                                    >
                                        {/* Blocked-day stripes sit at z-0; content wrapper is z-[1] so the
                                            pattern is NOT hidden behind bg-[#FCFCFC] (negative z-index was
                                            painting under the column background in browsers). */}
                                        {isCurrentMonth && isDayBlocked && (
                                            <div
                                                aria-hidden
                                                className="pointer-events-none absolute inset-x-0 z-0"
                                                style={{
                                                    top: 44,
                                                    bottom: 0,
                                                    backgroundImage:
                                                        'repeating-linear-gradient(135deg, rgba(71,85,105,0.13) 0, rgba(71,85,105,0.13) 4px, transparent 4px, transparent 11px)',
                                                    WebkitMaskImage:
                                                        'linear-gradient(to bottom, transparent 0, rgba(0,0,0,1) 28px, rgba(0,0,0,1) 100%)',
                                                    maskImage:
                                                        'linear-gradient(to bottom, transparent 0, rgba(0,0,0,1) 28px, rgba(0,0,0,1) 100%)',
                                                }}
                                            />
                                        )}
                                        <div className="relative z-[1] flex flex-col flex-1 min-h-0">
                                        {/* Date header */}
                                        <div className={`text-xs font-medium mb-2 ${isTodayBanner ? 'text-accent-600 font-bold' : 'text-gray-700'}`}>
                                            {day.getDate()}
                                        </div>
                                        
                                        {/* Capacity bar - always show if current month */}
                                        {isCurrentMonth && (
                                            <div className="mb-2" title={barTooltip}>
                                                {dailyCapacityEnabled ? (
                                                <div className="w-full h-1 bg-primary-500/30 rounded-full overflow-hidden relative">
                                                    {barPercent > 0 && (
                                                        <div
                                                            className="h-full rounded-full transition-all absolute left-0 top-0 z-10"
                                                            style={{ 
                                                                width: `${barPercent}%`, 
                                                                backgroundColor: barColor
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                                ) : (
                                                <WorkDriveDayBar jobMinutes={monthJobMins} driveMinutes={monthDriveMins} className="h-1" />
                                                )}
                                            </div>
                                        )}
                                        
                                        {/* Appointments + Job cards. Appointments render first so they
                                            remain visible when there are many jobs on the day. */}
                                        <div className="flex-1 overflow-y-auto space-y-1.5" style={{ maxHeight: '200px' }}>
                                            {(() => {
                                                const dayAppts = appointmentsByDate[dateString] || []
                                                // In single-user view, scope to just that user. In all-team view, show everyone's.
                                                const visible = selectedUserId === 'all'
                                                    ? dayAppts
                                                    : dayAppts.filter((a) => Number(a.user_id) === Number(selectedUserId))
                                                if (!visible.length) return null
                                                return (
                                                    <div className="space-y-1">
                                                        {visible.slice(0, 2).map((a) => renderAppointmentPill(a, true, dateString))}
                                                        {visible.length > 2 && (
                                                            <div className="text-[10px] text-gray-500 text-center">
                                                                {t('app.appointments.moreN', '+{{n}} more').replace('{{n}}', String(visible.length - 2))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })()}
                                            {loading ? (
                                                <div className="flex items-center justify-center h-16">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-accent-500 border-t-transparent" />
                                                </div>
                                            ) : dayJobs.length > 0 ? (
                                                dayJobs.slice(0, 3).map((job) => {
                                                    const isJobCompleted = job.status === 'completed' || job.status === 'sub_completed'
                                                    const isJobCancelled = job.status === 'cancelled'
                                                    const isJobDeleted = job.status === 'deleted'
                                                    const isJobInactive = isJobCancelled || isJobDeleted
                                                    const isExiting = exitingJobIds.has(String(job.id))
                                                    
                                                    return (
                                                        <div
                                                            key={job.id}
                                                            className={`overflow-hidden transition-all duration-300 ease-out ${
                                                              isExiting
                                                                ? '-translate-x-[120%] opacity-0 max-h-0'
                                                                : 'translate-x-0 max-h-40'
                                                            }`}
                                                        >
                                                        <div
                                                            draggable={!isJobInactive}
                                                            onDragStart={(e) => !isJobInactive && handleDragStart(e, job)}
                                                            onDragEnd={handleDragEnd}
                                                            onClick={() => handleJobClick(job)}
                                                            className={`rounded-lg p-2 text-xs transition-all border ${
                                                                isJobDeleted
                                                                    ? 'bg-gray-50 border-gray-200 opacity-35 cursor-pointer'
                                                                    : isJobCancelled
                                                                    ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed'
                                                                    : isDayBlocked
                                                                        ? 'bg-gray-50 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer'
                                                                        : 'bg-[#fff] border-[#F1F8F4] hover:border-[#E0EDE4] cursor-pointer'
                                                            } ${draggedJob?.id === job.id ? 'opacity-50' : ''}`}
                                                        >
                                                            <div className="font-semibold text-gray-800 truncate flex items-center gap-1">
                                                                {job.invoice_id != null && (
                                                                    <span
                                                                      className="inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded bg-primary-500/10 text-primary-700"
                                                                      title={t('app.jobsPage.invoiced', 'Invoiced')}
                                                                    >
                                                                      <DocumentTextIcon className="h-2.5 w-2.5" strokeWidth={2.5} />
                                                                    </span>
                                                                )}
                                                                {isJobCompleted && !isJobInactive && (
                                                                    <CheckIcon className="w-3 h-3 text-accent-500 flex-shrink-0" strokeWidth={3} />
                                                                )}
                                                                <span className="truncate">
                                                                    {[job.name || job.first_name, job.last_name].filter(Boolean).join(' ') || t('app.jobsPage.client')}
                                                                </span>
                                                            </div>
                                                            {(isJobDeleted || isJobCancelled) && (
                                                                <div className="flex items-center gap-1 mt-0.5">
                                                                  <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                      e.stopPropagation()
                                                                      dismissInactiveJobs([job.id])
                                                                    }}
                                                                    className="p-0.5 rounded text-gray-400 hover:text-gray-700"
                                                                    title={t('app.jobsPage.archiveFromPlanner', 'Hide from planner')}
                                                                    aria-label={t('app.jobsPage.archiveFromPlanner', 'Hide from planner')}
                                                                  >
                                                                    <ArchiveBoxArrowDownIcon className="w-3 h-3" />
                                                                  </button>
                                                                  {isJobDeleted && (
                                                                      <span className="text-[9px] font-medium text-gray-600">{t('app.jobsPage.deleted', 'Deleted')}</span>
                                                                  )}
                                                                  {isJobCancelled && (
                                                                      <span className="text-[9px] font-medium text-red-600">{t('app.jobsPage.cancelled')}</span>
                                                                  )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        </div>
                                                    )
                                                })
                                            ) : null}
                                            {dayJobs.length > 3 && (
                                                <div className="text-[10px] text-gray-500 text-center pt-1">
                                                    {t('app.jobsPage.moreJobs').replace('{{n}}', String(dayJobs.length - 3))}
                                                </div>
                                            )}
                                        </div>
                                        </div>
                                        
                                        {/* Add job / appointment button: opens a small popover that lets
                                            the user pick between creating a job and an appointment. We
                                            position the popover at the click coordinates so it works
                                            without per-cell refs. */}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                                setCellAddMenu({
                                                    date: dateString,
                                                    x: Math.min(rect.right - 180, window.innerWidth - 200),
                                                    y: rect.bottom + 4,
                                                })
                                            }}
                                            className="absolute bottom-1 right-1 z-[2] inline-flex items-center justify-center w-5 h-5 text-accent-600 hover:text-accent-700 hover:bg-accent-50 rounded"
                                            title={t('app.jobsPage.addJob')}
                                        >
                                            <PlusIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    /* Weekly Calendar ÔÇö horizontal slider showing 5 days by default, scrollable to show all 7 days */
                    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
                        {/* Scrollable columns container */}
                        <div 
                            ref={weekScrollContainerRef}
                            className="flex gap-2 overflow-x-auto week-scrollbar flex-1 min-h-0 w-full"
                            style={{ 
                                scrollbarWidth: 'thin',
                                scrollbarColor: '#9CA3AF #F3F4F6',
                                scrollSnapType: 'x mandatory',
                                WebkitOverflowScrolling: 'touch',
                                overflowY: 'hidden'
                            }}
                            onScroll={(e) => {
                                const target = e.target as HTMLDivElement
                                setWeekScrollPosition(target.scrollLeft)
                            }}
                        >
                            {weekDays.map((day, originalIndex) => {
                                    const dayJobs = getJobsForDay(day)
                                    const jsDayOfWeek = day.getDay()
                                    const dayOfWeekIndex = jsDayOfWeek === 0 ? 6 : jsDayOfWeek - 1
                                    const workHoursForDay = getWorkHoursForDay(dayOfWeekIndex)
                                    const occupiedHours = getOccupiedTime(day)
                                    const baseHours = typeof workHoursForDay === 'number' ? workHoursForDay : parseFloat(workHoursForDay) || 0

                                    const dateString = toLocalDateString(day)
                                    const isDragOver = dragOverDate === dateString
                                    const isTodayBanner = isToday(day)

                                    // Leave deduction ÔÇö only applies when a single employee is selected
                                    const dayLeaveEntry = selectedUserId !== 'all' ? employeeLeaveByDate[dateString] ?? null : null
                                    const leaveHoursOff = getLeaveHoursOff(dateString, baseHours)
                                    const apptHoursOff = getApprovedAppointmentHoursForDate(dateString, baseHours)
                                    const workHoursNum = Math.max(0, baseHours - leaveHoursOff - apptHoursOff)

                                    // "Blocked day" = 0 hours available (weekend, full-day leave,
                                    // all-day appointment, etc.). Drives the diagonal-stripe overlay
                                    // on the column and the muted styling on any jobs still here.
                                    const isDayBlocked = isCalendarDayBlocked(workHoursNum, dateString)

                                    // Planned round packages for this day (server is source of truth).
                                    // Fallback: if daily_routes is missing but jobs carry library_round_id
                                    // (round-owned subscriptions), synthesize one package so stops stay a unit.
                                    const dayPlannedMetas = (() => {
                                      const fromServer = (dailyRoutesByDate[dateString] || []).filter(
                                        (m) => m.status === 'planned' && (
                                          selectedUserId === 'all' || Number(m.user_id) === Number(selectedUserId)
                                        )
                                      )
                                      if (fromServer.length > 0) return fromServer

                                      const groups = new Map<string, {
                                        user_id: number
                                        round_id: number
                                        name: string | null
                                        job_ids: number[]
                                      }>()
                                      for (const j of dayJobs as any[]) {
                                        if (j?.is_projected || j?.status === 'cancelled' || j?.status === 'deleted') continue
                                        const rid = j?.library_round_id != null ? Number(j.library_round_id) : null
                                        const uid = j?.assigned_user_id != null ? Number(j.assigned_user_id) : null
                                        const jid = Number(j?.id)
                                        if (rid == null || !Number.isInteger(rid) || rid <= 0) continue
                                        if (uid == null || !Number.isInteger(uid) || uid <= 0) continue
                                        if (!Number.isInteger(jid) || jid <= 0) continue
                                        if (selectedUserId !== 'all' && uid !== Number(selectedUserId)) continue
                                        const key = `${uid}:${rid}`
                                        const g = groups.get(key) || {
                                          user_id: uid,
                                          round_id: rid,
                                          name: (j.library_round_name && String(j.library_round_name).trim()) || null,
                                          job_ids: [] as number[],
                                        }
                                        if (!g.job_ids.includes(jid)) g.job_ids.push(jid)
                                        groups.set(key, g)
                                      }
                                      return [...groups.values()].map((g) => ({
                                        id: 0,
                                        user_id: g.user_id,
                                        scheduled_date: dateString,
                                        status: 'planned',
                                        name: g.name,
                                        round_template_id: null,
                                        round_id: g.round_id,
                                        is_occurrence_override: null,
                                        job_ids: g.job_ids,
                                      }))
                                    })()
                                    const dayRouteIds = (() => {
                                        const fromServer = new Set<string>()
                                        for (const m of dayPlannedMetas) {
                                          for (const id of m.job_ids) fromServer.add(String(id))
                                        }
                                        if (fromServer.size > 0) return fromServer
                                        // Fallback: warm localStorage cache until the first server fetch lands.
                                        try {
                                            const co = window.location.pathname.split('/')[1]
                                            const stored = localStorage.getItem(`route-order-${co}-${dateString}`)
                                            if (!stored) return new Set<string>()
                                            const orderMap: Record<string, (number | string)[]> = JSON.parse(stored)
                                            const ids = new Set<string>()
                                            Object.values(orderMap).flat().forEach(id => ids.add(String(id)))
                                            return ids
                                        } catch { return new Set<string>() }
                                    })()

                                    // Green = route exists and every real job on this day is in it.
                                    // Amber = route exists but at least one job is missing from it.
                                    const routeIsIntact = dayRouteIds.size > 0 &&
                                        dayJobs.every((j: any) => j.is_projected || !Number.isInteger(Number(j.id)) || dayRouteIds.has(String(j.id)))

                                    // Visit merge: same client + day + employee → one card.
                                    const dayVisits = groupJobsIntoVisits(dayJobs as any)

                                    const visitInPlanned = (v: ReturnType<typeof groupJobsIntoVisits>[number]) =>
                                      v.jobs.some((j: any) =>
                                        !j.is_projected && Number.isInteger(Number(j.id)) && dayRouteIds.has(String(j.id))
                                      )
                                    const plannedVisits = dayRouteIds.size > 0 ? dayVisits.filter(visitInPlanned) : []
                                    const unplannedVisits = dayRouteIds.size > 0
                                      ? dayVisits.filter(v => !visitInPlanned(v))
                                      : dayVisits
                                    const primaryPlannedMeta = dayPlannedMetas[0] || null

                                    // Travel time for this day from saved routes
                                    const dayTravelMins = (() => {
                                        if (typeof selectedUserId === 'number') {
                                            return travelMinutes[`${dateString}:${selectedUserId}`] ?? 0
                                        }
                                        // 'all' view: sum across all users that have jobs on this day
                                        const userIds = [...new Set(dayJobs.map((j: { assigned_user_id?: number }) => Number(j.assigned_user_id)).filter(Boolean))]
                                        return userIds.reduce((sum, uid) => sum + (travelMinutes[`${dateString}:${uid}`] ?? 0), 0)
                                    })()
                                    const totalHoursWithTravel = occupiedHours + dayTravelMins / 60
                                    // workHoursNum=0 with jobs means employee is off but still scheduled → force red
                                    const utilizationWithTravel = workHoursNum > 0
                                        ? (totalHoursWithTravel / workHoursNum) * 100
                                        : (totalHoursWithTravel > 0 ? 200 : 0)
                                    const greenWithTravel = Math.min(100, utilizationWithTravel)
                                    const amberWithTravel = Math.max(0, utilizationWithTravel - 100)
                                    const overflowColorTravel = amberWithTravel > 50 ? '#EF4444' : '#F59E0B'

                                    const dayStart = selectedUserId !== 'all' ? getStartTimeForDay(dayOfWeekIndex) : null
                                    const showClocks = dayStart != null && workHoursNum > 0
                                    const usedMinutes = Math.round(totalHoursWithTravel * 60)
                                    const capacityMinutes = Math.round(workHoursNum * 60)
                                    const freeMinutes = Math.max(0, capacityMinutes - usedMinutes)
                                    const currentEnd = showClocks && dayStart
                                        ? addMinutesToClock(dayStart, usedMinutes)
                                        : null
                                    const capacityEnd = showClocks && dayStart
                                        ? addMinutesToClock(dayStart, capacityMinutes)
                                        : null
                                    const freeHint = freeMinutes > 0
                                        ? `${freeMinutes >= 60
                                            ? `${(freeMinutes / 60).toFixed(freeMinutes % 60 === 0 ? 0 : 1)}h free`
                                            : `${freeMinutes}m free`}`
                                        : freeMinutes === 0 && usedMinutes > 0
                                            ? 'full'
                                            : null
                                    const dayValue = dayJobs.reduce(
                                        (sum: number, j: any) => sum + getJobDisplayPrice(j),
                                        0,
                                    )
                                    const driveSharePct = totalHoursWithTravel > 0.05
                                        ? Math.round(((dayTravelMins / 60) / totalHoursWithTravel) * 100)
                                        : 0

                                    return (
                                        <div
                                            key={originalIndex}
                                            data-day-index={originalIndex}
                                            data-is-today={isTodayBanner ? 'true' : undefined}
                                            className={`flex flex-col rounded-xl overflow-hidden bg-[#FCFCFC] p-[10px] relative flex-shrink-0 h-full ${isDragOver ? 'ring-2 ring-accent-500/50' : ''}`}
                                            style={{
                                                width: 'calc((100% - 32px) / 5)', // 5 columns visible, accounting for gap (8px * 4 gaps = 32px)
                                                minWidth: '200px',
                                                scrollSnapAlign: 'start',
                                                scrollSnapStop: 'always',
                                            }}
                                            onDragOver={(e) => handleDragOver(e, dateString)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, dateString)}
                                        >
                                            {/* Stripes at z-0; content at z-[1] ÔÇö negative z-index was painting
                                                the pattern UNDER the column bg-[#FCFCFC], so it never showed. */}
                                            {isDayBlocked && (
                                                <div
                                                    aria-hidden
                                                    className="pointer-events-none absolute inset-x-0 z-0"
                                                    style={{
                                                        top: 152,
                                                        bottom: 0,
                                                        backgroundImage:
                                                            'repeating-linear-gradient(135deg, rgba(71,85,105,0.13) 0, rgba(71,85,105,0.13) 4px, transparent 4px, transparent 11px)',
                                                        WebkitMaskImage:
                                                            'linear-gradient(to bottom, transparent 0, rgba(0,0,0,1) 40px, rgba(0,0,0,1) 100%)',
                                                        maskImage:
                                                            'linear-gradient(to bottom, transparent 0, rgba(0,0,0,1) 40px, rgba(0,0,0,1) 100%)',
                                                    }}
                                                />
                                            )}
                                            <div className="relative z-[1] flex flex-col flex-1 min-h-0 min-w-0">
                                            {/* BANNER: month image from app + overlay. Today=#3DD57A, others=#193434. Date top-left, day name large bold white. */}
                                            {(() => {
                                                const MONTH_IMGS = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'] as const
                                                const monthSlug = MONTH_IMGS[day.getMonth()]
                                                return (
                                                    <div
                                                        className="relative h-16 overflow-hidden rounded-xl bg-center"
                                                        style={{
                                                            backgroundImage: `url(/images/${monthSlug}.jpg)`,
                                                            backgroundColor: isTodayBanner ? '#3DD57A' : '#193434',
                                                            backgroundSize: 'cover',
                                                            backgroundRepeat: 'no-repeat',
                                                        }}
                                                    >
                                                        {/* Overlay: today=green tint, others=dark tint so text is readable */}
                                                        <div
                                                            className="absolute inset-0"
                                                            style={{ backgroundColor: isTodayBanner ? 'rgba(61,213,122,0.72)' : 'rgba(25,52,52,0.78)' }}
                                                        />
                                                        {/* Subtle landscape + blossoms on non-today (lighter silhouette, pink/purple blossoms) */}
                                                        {!isTodayBanner && (
                                                            <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 320 96" preserveAspectRatio="xMidYMax slice" aria-hidden>
                                                                <ellipse cx="80" cy="130" rx="180" ry="60" fill="rgba(255,255,255,0.12)" />
                                                                <ellipse cx="200" cy="125" rx="200" ry="65" fill="rgba(255,255,255,0.08)" />
                                                                <path d="M 45 96 L 52 48 Q 59 30 66 48 L 73 96 Z" fill="rgba(255,255,255,0.14)" />
                                                                <path d="M 125 96 L 134 42 Q 143 22 152 42 L 161 96 Z" fill="rgba(255,255,255,0.1)" />
                                                                <circle cx="54" cy="44" r="2.5" fill="rgba(240,210,230,0.5)" />
                                                                <circle cx="136" cy="38" r="2" fill="rgba(230,200,220,0.45)" />
                                                            </svg>
                                                        )}
                                                        {isTodayBanner && (
                                                            <svg className="absolute inset-0 w-full h-full opacity-35" viewBox="0 0 320 96" preserveAspectRatio="xMidYMax slice" aria-hidden>
                                                                <ellipse cx="80" cy="130" rx="180" ry="60" fill="rgba(0,50,40,0.5)" />
                                                                <ellipse cx="200" cy="125" rx="200" ry="65" fill="rgba(0,55,45,0.45)" />
                                                                <path d="M 45 96 L 52 48 Q 59 30 66 48 L 73 96 Z" fill="rgba(0,55,45,0.55)" />
                                                                <path d="M 125 96 L 134 42 Q 143 22 152 42 L 161 96 Z" fill="rgba(0,50,40,0.5)" />
                                                            </svg>
                                                        )}
                                                        <div className="relative z-10 px-3 py-3 h-full flex flex-col justify-between">
                                                            <div className={`text-[11px] ${isTodayBanner ? 'text-white/90' : 'text-white/80'}`}>
                                                                {day.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                            </div>
                                                            <div className="flex items-end justify-between">
                                                                <div className="text-lg font-bold text-white">
                                                                    {formatWeekday(day)}
                                                                </div>
                                                                {dayLeaveEntry && (
                                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/20 text-white backdrop-blur-sm">
                                                                            {formatLeaveBadge(dayLeaveEntry.leave_type, dayLeaveEntry.hours_off)}
                                                                        </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })()}

                                            {/* Day summary bar + quick actions */}
                                            <div className="pt-2.5 pb-1.5">
                                                {dailyCapacityEnabled && (
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-[11px] font-medium text-gray-700">
                                                        {t('app.jobsPage.totalHours')}
                                                    </span>
                                                    <span className="text-[11px] font-medium text-gray-700 tabular-nums">
                                                        {dayTravelMins > 0 && (
                                                            <span className="text-gray-400 mr-1">{t('app.jobsPage.driveMins').replace('{{mins}}', String(dayTravelMins))}</span>
                                                        )}
                                                        {totalHoursWithTravel.toFixed(1)} / {workHoursNum.toFixed(1)}
                                                    </span>
                                                </div>
                                                )}
                                                {dailyCapacityEnabled ? (() => {
                                                    const apptCountToday = (appointmentsByDate[dateString] || [])
                                                        .filter((a) => a.status === 'approved' && (selectedUserId === 'all' || Number(a.user_id) === Number(selectedUserId)))
                                                        .length
                                                    const overHoursW = Math.max(0, totalHoursWithTravel - workHoursNum)
                                                    const weekBarTooltip =
                                                        `${dayJobs.length} ${t('app.jobsPage.jobs', 'jobs')} -À ` +
                                                        `${apptCountToday} ${t('app.appointments.label', 'appointments')} -À ` +
                                                        `${workHoursNum.toFixed(1)}h ${t('app.jobsPage.capacity', 'capacity')}` +
                                                        (overHoursW > 0 ? ` -À ${overHoursW.toFixed(1)}h ${t('app.jobsPage.over', 'over')}` : '')
                                                    return (
                                                        <div className="w-full h-2 bg-primary-500/30 rounded-full relative" title={weekBarTooltip} style={{ overflow: 'visible' }}>
                                                    {greenWithTravel > 0 && (
                                                        <div
                                                            className="h-full rounded-full transition-all absolute left-0 top-0 z-10"
                                                            style={{ width: `${greenWithTravel}%`, backgroundColor: '#3DD57A' }}
                                                        />
                                                    )}
                                                    {amberWithTravel > 0 && (
                                                        <div
                                                            className="h-full rounded-full transition-all absolute left-0 top-0 z-20"
                                                            style={{ 
                                                                width: `${amberWithTravel}%`, 
                                                                backgroundColor: overflowColorTravel
                                                            }}
                                                        />
                                                    )}
                                                        </div>
                                                    )
                                                })() : (
                                                    <WorkDriveDayBar jobMinutes={getJobMinutesForDay(day)} driveMinutes={dayTravelMins} />
                                                )}
                                                {/* Plan route (compact, left) + day value / drive share */}
                                                <div className="mt-2 flex items-center gap-2 min-w-0">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            const uid = selectedUserId !== 'all'
                                                              ? (typeof selectedUserId === 'string'
                                                                ? parseInt(selectedUserId, 10)
                                                                : selectedUserId)
                                                              : null
                                                            openMapPlanner(dateString, Number.isFinite(uid as number) ? uid : null)
                                                        }}
                                                        className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold bg-white text-[#193434] hover:bg-black/[0.03] transition-colors"
                                                        title={routeIsIntact ? t('app.jobsPage.planRouteTitlePlanned') : t('app.jobsPage.planRouteTitle')}
                                                    >
                                                        <svg className="w-3 h-3 opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                                        </svg>
                                                        {t('app.jobsPage.planRoute', 'Plan route')}
                                                    </button>
                                                    <div className="min-w-0 flex-1 flex items-center justify-end gap-2 text-[10px] tabular-nums text-gray-500">
                                                        {dayValue > 0 && (
                                                            <span className="font-semibold text-gray-700 truncate">
                                                                {formatMoney(dayValue, companyCountryCode)}
                                                            </span>
                                                        )}
                                                        {dayTravelMins > 0 && (
                                                            <span className="flex-shrink-0 text-gray-400">
                                                                {driveSharePct}% {t('app.jobsPage.driveShort', 'drive')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {showClocks && dayStart && (
                                                    <div className="mt-1.5">
                                                        <DayClockDivider
                                                            label={dayStart}
                                                            hint={t('app.jobsPage.dayStart', 'start')}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Job cards — scrollable middle */}
                                            <div className="flex-1 overflow-y-auto min-h-0">
                                                {loading ? (
                                                    <div className="flex items-center justify-center h-32">
                                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent-500 border-t-transparent" />
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {/* Appointments for this day. Rendered above jobs so they're
                                                            always visible, and scoped to the selected user when a
                                                            specific user is active. */}
                                                        {(() => {
                                                            const dayAppts = appointmentsByDate[dateString] || []
                                                            const visible = selectedUserId === 'all'
                                                                ? dayAppts
                                                                : dayAppts.filter((a) => Number(a.user_id) === Number(selectedUserId))
                                                            if (!visible.length) return null
                                                            return (
                                                                <div className="space-y-1.5">
                                                                    {visible.map((a) => renderAppointmentPill(a, false, dateString))}
                                                                </div>
                                                            )
                                                        })()}
                                                        {dayJobs.length > 0 ? (
                                                        <>
                                                        {selectedUserId === 'all'
                                                          ? (
                                                            // All team view: show one card per employee with jobs on this day
                                                            <>
                                                              {users
                                                                .filter((u) => dayJobs.some((job: any) => Number(job.assigned_user_id) === Number(u.id)))
                                                                .map((u) => {
                                                                  const userJobsForDay = dayJobs.filter((job: any) => Number(job.assigned_user_id) === Number(u.id))
                                                                  const totalMinutes = userJobsForDay.reduce((total: number, job: any) => {
                                                                    const raw = job.estimated_duration ?? job.total_duration
                                                                    const minutes = raw != null && raw !== '' ? parseFloat(String(raw)) : 0
                                                                    return total + (isNaN(minutes) ? 0 : minutes)
                                                                  }, 0)
                                                                  const totalHours = totalMinutes / 60
                                                                  const maxHours = 8 // simple reference for bar
                                                                  const percent = Math.min(100, maxHours > 0 ? (totalHours / maxHours) * 100 : 0)
                                                                  // Per-employee "off" check: this user's scheduled hours
                                                                  // for this weekday are 0 (weekend, day off, part-time).
                                                                  // Independent of the column-level `isDayBlocked`, which
                                                                  // only fires when the whole team is off.
                                                                  const userScheduledHours = getWorkHoursForUserDay(Number(u.id), dayOfWeekIndex)
                                                                  const isUserDayBlocked = dailyCapacityEnabled && (isDayBlocked || userScheduledHours === 0)
                                                                  const userPackage = dayPlannedMetas.find((m) => Number(m.user_id) === Number(u.id))
                                                                  return (
                                                                    <button
                                                                      key={u.id}
                                                                      type="button"
                                                                      onClick={() => {
                                                                        isUserActionRef.current = true
                                                                        setSelectedUserId(u.id)
                                                                      }}
                                                                      className={`w-full text-left rounded-xl p-3 transition-all border cursor-pointer ${
                                                                        isUserDayBlocked
                                                                            ? 'bg-gray-50 border-dashed border-gray-300 hover:border-gray-400'
                                                                            : userPackage
                                                                              ? 'bg-accent-50/50 border-accent-200 hover:border-accent-300'
                                                                              : 'bg-white border-[#F1F8F4] hover:border-[#E0EDE4]'
                                                                      }`}
                                                                    >
                                                                      <div className="flex items-center justify-between mb-1.5">
                                                                        <span className="font-semibold text-sm text-gray-800 truncate">
                                                                          {u.first_name} {u.last_name}
                                                                        </span>
                                                                        <span className="text-[11px] font-medium text-gray-700 tabular-nums">
                                                                          {totalHours.toFixed(1)} h
                                                                        </span>
                                                                      </div>
                                                                      {userPackage && (
                                                                        <div className="mb-1.5 min-w-0">
                                                                          <span className="text-[11px] text-gray-600 truncate block">
                                                                            {userPackage.name?.trim()
                                                                              || t('app.jobsPage.plannedRound', 'Planned route')}
                                                                            {' · '}
                                                                            {t('app.rounds.stopCount', '{{n}} stops').replace(
                                                                              '{{n}}',
                                                                              String(userPackage.job_ids?.length || userJobsForDay.length),
                                                                            )}
                                                                          </span>
                                                                        </div>
                                                                      )}
                                                                      <div className="w-full h-1.5 bg-primary-500/10 rounded-full overflow-hidden">
                                                                        {percent > 0 && (
                                                                          <div
                                                                            className="h-full rounded-full bg-accent-500 transition-all"
                                                                            style={{ width: `${percent}%` }}
                                                                          />
                                                                        )}
                                                                      </div>
                                                                    </button>
                                                                  )
                                                                })}
                                                            </>
                                                          )
                                                          : (() => {
                                                            const renderVisitCard = (visit: ReturnType<typeof groupJobsIntoVisits>[number], opts?: { stopIndex?: number; inRound?: boolean }) => {
                                                            const job = visit.primary as any
                                                            const hasTime = job.scheduled_time_from || job.scheduled_time_to
                                                            const addressDisplay = getAddressDisplay(job)
                                                            const isJobCompleted = job.status === 'completed' || job.status === 'sub_completed'
                                                            const isJobCancelled = job.status === 'cancelled'
                                                            const isJobDeleted = job.status === 'deleted'
                                                            const isJobInactive = isJobCancelled || isJobDeleted
                                                            const taskCount = visit.totalTaskCount || getJobTaskCount(job)
                                                            const jobDisplayPrice = visit.jobs.reduce((sum, j) => sum + getJobDisplayPrice(j as any), 0)
                                                            const noteCount = visit.jobs.reduce((sum, j) => sum + Number((j as any).note_count ?? 0), 0)
                                                            const mins = visit.totalDurationMinutes
                                                            const isExiting = exitingJobIds.has(String(job.id))
                                                            const stopIndex = opts?.stopIndex
                                                            const inRound = !!opts?.inRound

                                                            return (
                                                                <div
                                                                  key={visit.key}
                                                                  className={`overflow-hidden transition-all duration-300 ease-out ${
                                                                    inRound ? 'relative' : ''
                                                                  } ${
                                                                    isExiting
                                                                      ? '-translate-x-[120%] opacity-0 max-h-0 mb-0'
                                                                      : 'translate-x-0 max-h-[480px]'
                                                                  }`}
                                                                >
                                                                    <div
                                                                        draggable={!isJobInactive}
                                                                        onDragStart={(e) => !isJobInactive && handleDragStart(e, job)}
                                                                        onDragEnd={handleDragEnd}
                                                                        onClick={() => handleJobClick(job)}
                                                                        className={`rounded-xl p-3 transition-all border ${
                                                                            isJobDeleted
                                                                                ? 'bg-gray-50 border-gray-200 opacity-35 cursor-pointer'
                                                                                : isJobCancelled
                                                                                ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed'
                                                                                : isDayBlocked
                                                                                    ? 'bg-gray-50 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer'
                                                                                    : inRound
                                                                                      ? 'bg-white border-accent-100 hover:border-accent-200 cursor-pointer shadow-sm'
                                                                                      : 'bg-[#fff] border-[#F1F8F4] hover:border-[#E0EDE4] cursor-pointer'
                                                                        } ${draggedJob?.id === job.id ? 'opacity-50' : ''}`}
                                                                    >
                                                                    <div className="flex items-start justify-between gap-2 mb-1">
                                                                        <div className="flex items-center min-w-0 flex-1 gap-1.5">
                                                                            {inRound && stopIndex != null && (
                                                                              <span className="w-5 h-5 rounded-full bg-[#193434] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                                                                {stopIndex + 1}
                                                                              </span>
                                                                            )}
                                                                            <span className="font-semibold text-sm text-gray-800 truncate min-w-0 flex-1">
                                                                                {[job.name || job.first_name, job.last_name].filter(Boolean).join(' ') || t('app.jobsPage.client')}
                                                                            </span>
                                                                            {visit.visitSize > 1 && (
                                                                                <span className="flex-shrink-0 inline-flex items-center rounded-full bg-accent-50 text-accent-700 border border-accent-200 px-1.5 py-0.5 text-[10px] font-semibold">
                                                                                    {t('app.jobsPage.mergedVisit', '{{n}} jobs').replace('{{n}}', String(visit.visitSize))}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {noteCount > 0 && (
                                                                            <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-bold text-white bg-orange-500 gap-0.5">
                                                                                <DocumentTextIcon className="w-3 h-3" />
                                                                                {noteCount}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {addressDisplay && (
                                                                        <div className="text-xs text-gray-600 truncate mb-1">
                                                                            {addressDisplay}
                                                                        </div>
                                                                    )}

                                                                    {hasTime && (
                                                                        <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                                                                            <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                                                            {job.scheduled_time_from && job.scheduled_time_to
                                                                                ? `${(job.scheduled_time_from+'').substring(0,5)} - ${(job.scheduled_time_to+'').substring(0,5)}`
                                                                                : (job.scheduled_time_from+'').substring(0,5) || ''}
                                                                        </div>
                                                                    )}

                                                                    <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center justify-between gap-2">
                                                                        <div className="flex items-center gap-3 text-[11px] text-gray-500 min-w-0">
                                                                            <span className="flex items-center gap-1 flex-shrink-0">
                                                                                <DocumentTextIcon className="w-3.5 h-3.5" />
                                                                                {taskCount} task{taskCount !== 1 ? 's' : ''}
                                                                            </span>
                                                                            {mins > 0 ? (
                                                                                    <span className="flex items-center gap-1 flex-shrink-0">
                                                                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/></svg>
                                                                                        {formatDuration(mins)}
                                                                                    </span>
                                                                            ) : null}
                                                                            {jobDisplayPrice > 0 && (
                                                                                <span className="text-[11px] text-gray-500 flex-shrink-0">{formatPrice(jobDisplayPrice)}</span>
                                                                            )}
                                                                        </div>
                                                                        {isJobDeleted || isJobCancelled ? (
                                                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation()
                                                                                        dismissInactiveJobs(visit.jobs.map((j) => j.id))
                                                                                    }}
                                                                                    className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200/80 transition-colors"
                                                                                    title={t('app.jobsPage.archiveFromPlanner', 'Hide from planner')}
                                                                                    aria-label={t('app.jobsPage.archiveFromPlanner', 'Hide from planner')}
                                                                                >
                                                                                    <ArchiveBoxArrowDownIcon className="w-3.5 h-3.5" />
                                                                                </button>
                                                                                {isJobDeleted ? (
                                                                                    <span className="text-[10px] font-medium text-gray-600 px-1.5 py-0.5 rounded bg-gray-200">
                                                                                        {t('app.jobsPage.deleted', 'Deleted')}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-[10px] font-medium text-red-600 px-1.5 py-0.5 rounded bg-red-100">
                                                                                        {t('app.jobsPage.cancelled')}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ) : typeof job.status !== 'undefined' && (
                                                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                                {job.invoice_id != null && (
                                                                                    <span
                                                                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-600"
                                                                                        title={t('app.jobsPage.invoiced', 'Invoiced')}
                                                                                    >
                                                                                        <DocumentTextIcon className="h-3 w-3" strokeWidth={2} />
                                                                                    </span>
                                                                                )}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); handleToggleJobCompletion(job) }}
                                                                                    className={`w-5 h-5 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${
                                                                                        isJobCompleted ? 'border-accent-500 bg-accent-50 text-accent-600' : 'border-gray-300 bg-white'
                                                                                    }`}
                                                                                    title={isJobCompleted ? t('app.jobsPage.markNotCompleted') : t('app.jobsPage.markCompleted')}
                                                                                >
                                                                                    <CheckIcon className={`w-3 h-3 ${isJobCompleted ? 'text-accent-600' : 'text-gray-400'}`} />
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    </div>
                                                                </div>
                                                            )
                                                            }

                                                            return (
                                                              <>
                                                                {plannedVisits.length > 0 && (
                                                                  <div className="rounded-2xl border-2 border-accent-200/80 bg-accent-50/40 overflow-hidden mb-2">
                                                                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-accent-100 bg-white/70">
                                                                      <div className="min-w-0">
                                                                        <p className="text-[12.5px] font-semibold text-gray-900 truncate">
                                                                          {primaryPlannedMeta?.name?.trim()
                                                                            || t('app.jobsPage.plannedRound', 'Planned route')}
                                                                          {' · '}
                                                                          {t('app.rounds.stopCount', '{{n}} stops').replace('{{n}}', String(plannedVisits.length))}
                                                                        </p>
                                                                      </div>
                                                                      {primaryPlannedMeta && primaryPlannedMeta.id > 0 && (
                                                                        <button
                                                                          type="button"
                                                                          onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                                                            setMovePackageDate(dateString)
                                                                            setMovePackageUserId('')
                                                                            setMovePackageError(null)
                                                                            setMovePackageMenu({
                                                                              routeIds: dayPlannedMetas.map(m => m.id).filter(id => id > 0),
                                                                              date: dateString,
                                                                              userId: primaryPlannedMeta.user_id,
                                                                              x: rect.left,
                                                                              y: rect.bottom + 4,
                                                                            })
                                                                          }}
                                                                          className="flex-shrink-0 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700"
                                                                        >
                                                                          {t('app.jobsPage.movePackage', 'Move')}
                                                                        </button>
                                                                      )}
                                                                    </div>
                                                                    <div className="p-2 space-y-2">
                                                                      {plannedVisits.map((visit, i) => renderVisitCard(visit, { stopIndex: i, inRound: true }))}
                                                                    </div>
                                                                  </div>
                                                                )}
                                                                {unplannedVisits.length > 0 && (
                                                                  <>
                                                                    {plannedVisits.length > 0 && (
                                                                      <div className="flex items-center gap-2 my-2">
                                                                        <div className="flex-1 border-t border-dashed border-gray-200" />
                                                                        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('app.jobsPage.notPlanned')}</span>
                                                                        <div className="flex-1 border-t border-dashed border-gray-200" />
                                                                      </div>
                                                                    )}
                                                                    <div className="space-y-2">
                                                                      {unplannedVisits.map((visit) => renderVisitCard(visit))}
                                                                    </div>
                                                                  </>
                                                                )}
                                                              </>
                                                            )
                                                          })()}
                                                        </>
                                                        ) : null}
                                                        {showClocks && currentEnd && usedMinutes > 0 && (
                                                            <DayClockDivider
                                                                label={currentEnd}
                                                                hint={freeHint ? `· ${freeHint}` : t('app.jobsPage.currentEnd', 'now')}
                                                            />
                                                        )}
                                                        <div className="relative mt-2">
                                                            {inJobsWizard && (
                                                                <span
                                                                    aria-hidden
                                                                    className="absolute inset-0 rounded-xl animate-ping bg-accent-400/40 pointer-events-none"
                                                                />
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => openCreateJobForDate(dateString)}
                                                                className={`relative w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium transition-colors ${
                                                                    inJobsWizard
                                                                        ? 'border border-accent-500 bg-accent-50 text-accent-600 font-semibold hover:bg-accent-100 hover:border-accent-600'
                                                                        : 'border border-dashed border-gray-300 text-gray-500 hover:text-accent-600 hover:border-accent-400 hover:bg-accent-50/50'
                                                                }`}
                                                            >
                                                                <PlusIcon className="w-3.5 h-3.5" />
                                                                Add a job
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {showClocks && capacityEnd && (
                                                <div className="flex-shrink-0 pt-1.5">
                                                    <DayClockDivider
                                                        label={capacityEnd}
                                                        hint={t('app.jobsPage.dayEnd', 'day end')}
                                                    />
                                                </div>
                                            )}

                                            </div>
                                        </div>
                                    )
                                })}
                        </div>
                    </div>
                )}
                </div>
                )} {/* end viewMode !== 'day' */}

            </div>


            {/* Create Job Modal */}
            <CreateJob
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false)
                    setCreateJobPrefillDate(null)
                    setCreateJobPrefillUserId(null)
                    setCreateJobClientId(undefined)
                    setCreateJobLockClient(false)
                    setCreateJobNewClient(null)
                }}
                onJobCreated={(info) => {
                    setIsCreateModalOpen(false)
                    setCreateJobPrefillDate(null)
                    setCreateJobPrefillUserId(null)
                    setCreateJobClientId(undefined)
                    setCreateJobLockClient(false)
                    setCreateJobNewClient(null)
                    fetchJobsForWeek()
                    void handleWizardAfterJobCreated(info)
                }}
                initialDate={createJobPrefillDate || undefined}
                initialAssignedUserId={createJobPrefillUserId}
                initialClientId={createJobClientId}
                lockClient={createJobLockClient}
                initialNewClient={createJobNewClient}
                mode="job"
            />

            {/* Create Subscription Modal */}
            <CreateSubscription
                isOpen={isSubscriptionModalOpen}
                onClose={() => {
                    setIsSubscriptionModalOpen(false)
                    setCreateJobPrefillDate(null)
                    setCreateJobPrefillUserId(null)
                }}
                onSubscriptionCreated={() => {
                    setIsSubscriptionModalOpen(false)
                    setCreateJobPrefillDate(null)
                    setCreateJobPrefillUserId(null)
                    fetchJobsForWeek()
                }}
            />

            {/* Create Client Modal */}
            <AddClientModal
                isOpen={isCreateClientModalOpen}
                onClose={() => {
                    setIsCreateClientModalOpen(false)
                }}
                onClientAdded={() => {
                    setIsCreateClientModalOpen(false)
                    // Optionally refresh any client-related data
                }}
            />

            {/* Create / Edit Appointment Modal */}
            <CreateAppointment
                isOpen={isCreateAppointmentOpen}
                onClose={() => {
                    setIsCreateAppointmentOpen(false)
                    setEditingAppointment(null)
                    setAppointmentPrefillDate(null)
                    setAppointmentPrefillUserId(null)
                }}
                onCreated={() => {
                    setIsCreateAppointmentOpen(false)
                    setEditingAppointment(null)
                    setAppointmentPrefillDate(null)
                    setAppointmentPrefillUserId(null)
                    fetchJobsForWeek()
                }}
                users={users}
                currentUserId={user?.id || 0}
                isAdmin={isAdmin}
                defaultDate={appointmentPrefillDate}
                defaultUserId={appointmentPrefillUserId === 'all' ? null : (appointmentPrefillUserId as number | null)}
                existing={editingAppointment}
                t={t}
            />

            {/* Per-cell + popover: pick between Job and Appointment. Positioned
                absolutely at the click point so it works for both week/month
                views and doesn't need per-cell refs. */}
            {cellAddMenu && (
                <>
                    <div
                        className="fixed inset-0 z-[90]"
                        onClick={() => setCellAddMenu(null)}
                    />
                    <div
                        className="fixed z-[95] bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 min-w-[180px]"
                        style={{ top: cellAddMenu.y, left: cellAddMenu.x }}
                    >
                        <button
                            onClick={() => {
                                const d = cellAddMenu.date
                                setCellAddMenu(null)
                                openCreateJobForDate(d)
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                            <DocumentTextIcon className="w-4 h-4 text-gray-400" />
                            {t('app.jobsPage.createJob', 'Create job')}
                        </button>
                        <button
                            onClick={() => {
                                const d = cellAddMenu.date
                                setCellAddMenu(null)
                                openCreateAppointmentForDate(d)
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                            <CalendarDaysIcon className="w-4 h-4 text-gray-400" />
                            {isAdmin
                                ? t('app.appointments.createMenuItem', 'Create appointment')
                                : t('app.appointments.requestMenuItem', 'Request appointment')}
                        </button>
                    </div>
                </>
            )}

            {/* 3-dot actions menu anchored to an appointment pill. Closes on
                outside click via the transparent overlay. */}
            {apptActionsMenu && (() => {
                const appt = Object.values(appointmentsByDate)
                    .flat()
                    .find((a) => a.id === apptActionsMenu.id)
                if (!appt) return null
                return (
                    <>
                        <div
                            className="fixed inset-0 z-[90]"
                            onClick={() => setApptActionsMenu(null)}
                        />
                        <div
                            className="fixed z-[95] bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 min-w-[180px]"
                            style={{ top: apptActionsMenu.y, left: apptActionsMenu.x }}
                        >
                            {appt.status === 'requested' && isAdmin && (
                                <>
                                    <button
                                        onClick={() => handleApproveAppointment(appt.id)}
                                        className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                                    >
                                        {t('app.appointments.approve', 'Approve')}
                                    </button>
                                    <button
                                        onClick={() => handleDeclineAppointment(appt.id)}
                                        className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                                    >
                                        {t('app.appointments.decline', 'Decline')}
                                    </button>
                                    <div className="h-px bg-gray-100 my-1 mx-2" />
                                </>
                            )}
                            <button
                                onClick={() => openEditAppointment(appt)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                                {t('app.appointments.edit', 'Edit')}
                            </button>
                            <button
                                onClick={() => handleDeleteAppointment(appt.id)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                                {t('app.appointments.delete', 'Delete')}
                            </button>
                        </div>
                    </>
                )
            })()}

            {/* View Job Slideout */}
            <JobViewSlideout
                isOpen={isViewModalOpen}
                onClose={() => {
                    setIsViewModalOpen(false)
                    setViewingJob(null)
                }}
                job={
                  viewingJob
                    ? {
                        ...viewingJob,
                        assigned_user_id: viewMode === 'day' && pendingAssigneeChanges[viewingJob.id] != null
                          ? pendingAssigneeChanges[viewingJob.id]
                          : viewingJob.assigned_user_id
                      }
                    : null
                }
                onJobUpdated={() => {
                    // Ensure the calendar updates immediately after edits/materialization (no manual refresh)
                    fetchJobsForWeek()
                }}
                deferAssigneeToParent={viewMode === 'day'}
                onAssigneeChange={handlePlannerAssigneeChange}
                visitSiblings={visitSiblingsFor(viewingJob, allJobs as any)}
                onOpenSibling={(sib) => setViewingJob(sib)}
            />
            
            {/* Move Job Confirmation Modal */}
            <ConfirmModal
                isOpen={showMoveModal && !!pendingMoveJob && !!pendingMoveDate}
                title={t('app.jobsPage.moveJob')}
                description={t('app.jobsPage.moveJobDescription')}
                confirmLabel={isMovingJob ? t('app.jobsPage.movingJob') : t('app.jobsPage.moveJob')}
                cancelLabel={t('app.common.cancel')}
                enableNotification={true}
                isSubmitting={isMovingJob}
                defaultEmail={pendingMoveJob ? (pendingMoveJob.client_billing_email || pendingMoveJob.client_personal_email || pendingMoveJob.client_email || '') : ''}
                defaultMessage={moveTemplate.message || (() => {
                    if (!pendingMoveJob || !pendingMoveDate) return ''
                    const oldDate = new Date(pendingMoveJob.scheduled_date + 'T00:00:00').toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
                    const newDate = new Date(pendingMoveDate + 'T00:00:00').toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
                    const customerName = `${pendingMoveJob.first_name || ''} ${pendingMoveJob.last_name || ''}`.trim() || 'Customer'
                    const userName = (user as any)?.first_name && (user as any)?.last_name ? `${(user as any).first_name} ${(user as any).last_name}` : 'We'
                    return `Hi ${customerName},\n\nWe need to reschedule your appointment.\n\nOld date: ${oldDate}\nNew date: ${newDate}\n\nIf this new date doesn't work for you, please let us know.\n\nBest regards,\n${userName}`
                })()}
                defaultSubject={moveTemplate.subject || (() => {
                    if (!pendingMoveJob) return 'Appointment Date Changed'
                    const customerName = `${pendingMoveJob.first_name || ''} ${pendingMoveJob.last_name || ''}`.trim() || 'Customer'
                    return `Appointment Rescheduled - ${customerName}`
                })()}
                onClose={() => {
                    setShowMoveModal(false)
                    setPendingMoveDate(null)
                    setPendingMoveJob(null)
                    setDraggedJob(null)
                    setMoveTemplate({ subject: '', message: '' })
                }}
                onConfirm={handleMoveJob}
            >
                {pendingMoveJob && pendingMoveDate && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="text-sm font-medium text-gray-700">{t('app.jobsPage.oldDate')}</p>
                                <p className="text-sm text-gray-500">
                                    {new Date(pendingMoveJob.scheduled_date + 'T00:00:00').toLocaleDateString(dateLocale, { 
                                        weekday: 'long',
                                        day: '2-digit', 
                                        month: '2-digit', 
                                        year: 'numeric' 
                                    })}
                                </p>
                            </div>
                            <div className="text-gray-400 mx-4">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-700">{t('app.jobsPage.newDate')}</p>
                                <p className="text-sm text-gray-500">
                                    {new Date(pendingMoveDate + 'T00:00:00').toLocaleDateString(dateLocale, { 
                                        weekday: 'long',
                                        day: '2-digit', 
                                        month: '2-digit', 
                                        year: 'numeric' 
                                    })}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">
                            {t('app.jobsPage.moveClientPrefix')} <span className="font-medium">{pendingMoveJob.first_name} {pendingMoveJob.last_name}</span>
                        </p>
                    </div>
                )}
            </ConfirmModal>
            <WeekPlanPanel
              open={weekPlanOpen}
              onClose={() => setWeekPlanOpen(false)}
              startDate={toLocalDateString(weekDays[0])}
              endDate={toLocalDateString(weekDays[6])}
              users={users}
              selectedUserId={selectedUserId}
              onApplied={() => { fetchJobsForWeek() }}
            />
            {/* Move planned round package */}
            {movePackageMenu && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/40"
                  onClick={() => !movePackageBusy && setMovePackageMenu(null)}
                  aria-hidden
                />
                <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-1">
                    {t('app.jobsPage.movePackageTitle', 'Move round')}
                  </h2>
                  <p className="text-[12.5px] text-gray-500 mb-4">
                    {t('app.jobsPage.movePackageBody', 'Move this planned route as one unit to another day or employee.')}
                  </p>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                    {t('app.jobsPage.movePackageDate', 'Date')}
                  </label>
                  <input
                    type="date"
                    value={movePackageDate}
                    onChange={(e) => setMovePackageDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-accent-400"
                  />
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                    {t('app.jobsPage.movePackageEmployee', 'Employee')}
                  </label>
                  <select
                    value={movePackageUserId === '' ? '' : String(movePackageUserId)}
                    onChange={(e) => setMovePackageUserId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-accent-400"
                  >
                    <option value="">{t('app.jobsPage.movePackageKeepEmployee', 'Keep current employee')}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {[u.first_name, u.last_name].filter(Boolean).join(' ') || `User #${u.id}`}
                      </option>
                    ))}
                  </select>
                  {movePackageError && (
                    <p className="text-[12px] text-red-600 mb-3">{movePackageError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={movePackageBusy}
                      onClick={() => setMovePackageMenu(null)}
                      className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-gray-500 hover:bg-gray-100"
                    >
                      {t('app.common.cancel', 'Cancel')}
                    </button>
                    <button
                      type="button"
                      disabled={movePackageBusy}
                      onClick={() => void handleMovePackage()}
                      className="rounded-xl bg-accent-500 hover:bg-accent-600 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      {movePackageBusy
                        ? t('app.jobsPage.movingPackage', 'Moving…')
                        : t('app.jobsPage.movePackageConfirm', 'Move round')}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Setup wizard: company-name popup triggered by "Save and complete setup" */}
            {showBusinessPopup && <OnboardingCompletePopup forceShow={showBusinessPopup} />}
        </AppLayout>
    )
}

export default function JobsPage() {
    const { t } = useAppI18n()
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-page flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent"></div>
                    <p className="mt-2 text-primary-500">{t('app.jobsPage.loading')}</p>
                </div>
            </div>
        }>
            <JobsPageContent />
        </Suspense>
    )
}
