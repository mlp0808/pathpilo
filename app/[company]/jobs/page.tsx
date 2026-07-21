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
import { formatMoney } from '@/app/config/countryRules'
import { useCompanyCountryCode } from '@/app/hooks/useCompanyCountryCode'
import { getEmailTemplate } from '@/app/utils/emailTemplates'
import { useParams, useSearchParams } from 'next/navigation'
import { useAppI18n } from '@/app/components/I18nProvider'
import { CheckIcon, PlusIcon, UserCircleIcon, DocumentTextIcon, ClockIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CalendarDaysIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import type { UserRoute, RouteJob, IsolatedRouteSeg } from '@/app/components/RouteMap'
import {
  buildDayJobsFingerprint,
  formatRouteTime,
  routesHaveDirections,
} from '@/app/utils/routeDirections'
import { optimizeMiddleJobsClient } from '@/app/utils/clientRouteOptimize'

// RouteMap uses mapbox-gl which cannot be server-rendered
const RouteMap = dynamic(() => import('@/app/components/RouteMap'), { ssr: false })

// 10 distinct colours for up to 10 users
const USER_COLORS = [
  '#3DD57A', '#FF6B6B', '#4ECDC4', '#45B7D1',
  '#F4A261', '#A8DADC', '#E76F51', '#7B2D8B',
  '#2196F3', '#FF9800',
]

/** Mobile route planner bottom sheet — keep in sync with RouteMap fitInsets. */
const MOBILE_ROUTE_SHEET_SNAPS = [0.3, 0.58, 0.85] as const
const MOBILE_ROUTE_SHEET_INITIAL_SNAP = 1
const MOBILE_ROUTE_MAP_FIT_INSETS = {
  top: 72,
  bottomRatio: MOBILE_ROUTE_SHEET_SNAPS[MOBILE_ROUTE_SHEET_INITIAL_SNAP],
  side: 48,
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

function coordOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Task count for job cards — list API exposes all_service_count, not job_services[]. */
function getJobTaskCount(job: any): number {
  const fromApi = Number(job.all_service_count ?? job.service_count ?? 0)
  if (fromApi > 0) return fromApi
  const fromArrays = (job.job_services || job.services || []).length
  return fromArrays > 0 ? fromArrays : 1
}

/** Planned job value (all tasks); total_price on list API is completed tasks only. */
function getJobDisplayPrice(job: any): number {
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
}

function JobsPageContent() {
  const { t, locale } = useAppI18n()
  const dateLocale = locale === 'da' ? 'da-DK' : 'en-US'
  const params = useParams()
  const searchParams = useSearchParams()
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
  // do NOT restore from localStorage — opening the jobs page should always land
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
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [createJobPrefillDate, setCreateJobPrefillDate] = useState<string | null>(null)
  const [createJobPrefillUserId, setCreateJobPrefillUserId] = useState<number | null>(null)
  // Route planner "add a job" search → prefill the create-job modal
  const [createJobClientId, setCreateJobClientId] = useState<number | undefined>(undefined)
  const [createJobLockClient, setCreateJobLockClient] = useState(false)
  const [createJobNewClient, setCreateJobNewClient] = useState<{ name?: string; address?: string; zip_code?: string; city?: string } | null>(null)
  const [routeClients, setRouteClients] = useState<RouteSearchClient[]>([])
  const [mobileRouteDayPickerOpen, setMobileRouteDayPickerOpen] = useState(false)
  const mobileRouteHeaderRef = useRef<HTMLDivElement>(null)
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | 'all'>('all')
  const [workHours, setWorkHours] = useState<WorkHours | null>(null)
  const [allUsersWorkHours, setAllUsersWorkHours] = useState<WorkHours | null>(null)
  const [workHoursByUser, setWorkHoursByUser] = useState<Record<number, WorkHours>>({})
  // Per-user schedule hours keyed by user id. Populated whenever we fetch the
  // all-team aggregate so the all-team week view can show individual employees
  // as "off" on days where *they* have zero scheduled hours (weekend, day off,
  // part-time schedule) even when other team members are working.
  const [dailyCapacityEnabled, setDailyCapacityEnabled] = useState(false)
  // Initialise viewMode from URL ?view= param
  const [viewMode, setViewMode] = useState<'day'|'week'|'month'|'year'>(() =>
    searchParams.get('view') === 'day' ? 'day' : 'week'
  )
  
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

  // ── Day view / route planner ──────────────────────────────────────────────
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
  // lg breakpoint (1024px) — drives the mobile bottom-sheet vs desktop split layout
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
  // Manual draw-route mode (per focused user — only one drawable at a time)
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

  /** Fingerprint for a single user's job order — used to detect per-user unsaved changes. */
  const buildUserFingerprint = useCallback(
    (route: UserRoute) => JSON.stringify(route.jobs.filter(j => !j.is_home).map(j => j.id)),
    [],
  )

  /** Per-user saved fingerprints — null entry means "not yet initialised for this user". */
  const [savedFingerprintsByUser, setSavedFingerprintsByUser] = useState<Record<number, string>>({})
  /** Per-user discard snapshots — kept fresh whenever a user's route is clean. */
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
  // Leave entries for the currently selected employee: date → { leave_type, hours_off }
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
  // Per-cell "+ Add" popover — two choices (Job / Appointment).
  const [cellAddMenu, setCellAddMenu] = useState<
    | { date: string; x: number; y: number }
    | null
  >(null)
  // 3-dot actions popover anchored to a specific appointment pill.
  const [apptActionsMenu, setApptActionsMenu] = useState<
    | { id: number; x: number; y: number }
    | null
  >(null)


  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(apiUrl('/companies/profile'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.company) {
          setDailyCapacityEnabled(data.company.dailyCapacityEnabled === true)
        }
      })
      .catch(() => {})
  }, [])

  // Fetch saved travel times from daily_routes whenever the visible week changes
  useEffect(() => {
    if (viewMode !== 'week') return
    const startDate = toLocalDateString(weekDays[0])
    const endDate = toLocalDateString(weekDays[6])
    const token = localStorage.getItem('token')
    fetch(apiUrl(`/daily-routes?start_date=${startDate}&end_date=${endDate}`), {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.routes?.length) return
        setTravelMinutes(prev => {
          const next = { ...prev }
          for (const row of data.routes) {
            if (row.total_minutes == null) continue
            // scheduled_date may be a plain "YYYY-MM-DD" string (from to_char on server)
            // or a JS Date serialized as "YYYY-MM-DDT23:00:00.000Z" (UTC, server in UTC+1).
            // Plain string → use directly.
            // ISO timestamp → convert to LOCAL date so the day matches the browser timezone.
            const raw = String(row.scheduled_date)
            const dateStr = raw.includes('T')
              ? toLocalDateString(new Date(raw))
              : raw
            next[`${dateStr}:${row.user_id}`] = row.total_minutes
          }
          return next
        })
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, currentWeek])


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
  
  // (We intentionally don't persist currentWeek anywhere — see the initializer
  //  comment above. The URL `?date=` is only set in day view by the effect below.)

  // Clean up any legacy persisted week so old installs also reset to "today".
  useEffect(() => {
    try { localStorage.removeItem('vevago_jobs_week') } catch (e) {}
  }, [])

  // Keep the browser URL in sync with the current view so that:
  //  • Refreshing the page returns you to the same day view
  //  • The URL can be copied and shared
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

  // Fetch users for employee selector
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/users'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
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

    // Fetch work hours for selected user
    const fetchWorkHours = async () => {
        const token = localStorage.getItem('token')
        
        if (selectedUserId === 'all') {
            // Fetch work hours for all users, sum them into the aggregate, AND
            // keep a per-user map so per-employee day-off styling works in the
            // all-team week view.
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

                const aggregatedWorkHours: WorkHours = {
                    monday_hours: 0,
                    tuesday_hours: 0,
                    wednesday_hours: 0,
                    thursday_hours: 0,
                    friday_hours: 0,
                    saturday_hours: 0,
                    sunday_hours: 0
                }

                const perUser: Record<number, WorkHours> = {}

                allWorkHoursData.forEach(({ userId, data }) => {
                    const rawWorkHours = data.workHours || {
                        monday_hours: 7.5,
                        tuesday_hours: 7.5,
                        wednesday_hours: 7.5,
                        thursday_hours: 7.5,
                        friday_hours: 7.0,
                        saturday_hours: 0,
                        sunday_hours: 0
                    }

                    const parsed: WorkHours = {
                        monday_hours: parseFloat(rawWorkHours.monday_hours) || 0,
                        tuesday_hours: parseFloat(rawWorkHours.tuesday_hours) || 0,
                        wednesday_hours: parseFloat(rawWorkHours.wednesday_hours) || 0,
                        thursday_hours: parseFloat(rawWorkHours.thursday_hours) || 0,
                        friday_hours: parseFloat(rawWorkHours.friday_hours) || 0,
                        saturday_hours: parseFloat(rawWorkHours.saturday_hours) || 0,
                        sunday_hours: parseFloat(rawWorkHours.sunday_hours) || 0,
                    }

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
                setWorkHours(null) // Clear individual work hours
            } catch (error) {
                console.error('Error fetching work hours for all users:', error)
            }
            return
        }

        try {
            const response = await fetch(apiUrl(`/work-hours/${selectedUserId}`), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            const data = await response.json()

            if (response.ok) {
                const rawWorkHours = data.workHours || {
                    monday_hours: 7.5,
                    tuesday_hours: 7.5,
                    wednesday_hours: 7.5,
                    thursday_hours: 7.5,
                    friday_hours: 7.0,
                    saturday_hours: 0,
                    sunday_hours: 0
                }

                // Ensure all values are numbers (parse strings if needed)
                const parsedWorkHours: WorkHours = {
                    monday_hours: parseFloat(rawWorkHours.monday_hours) || 0,
                    tuesday_hours: parseFloat(rawWorkHours.tuesday_hours) || 0,
                    wednesday_hours: parseFloat(rawWorkHours.wednesday_hours) || 0,
                    thursday_hours: parseFloat(rawWorkHours.thursday_hours) || 0,
                    friday_hours: parseFloat(rawWorkHours.friday_hours) || 0,
                    saturday_hours: parseFloat(rawWorkHours.saturday_hours) || 0,
                    sunday_hours: parseFloat(rawWorkHours.sunday_hours) || 0
                }

                setWorkHours(parsedWorkHours)
                setAllUsersWorkHours(null) // Clear aggregated work hours
                // Also remember this user's hours in the per-user map so any
                // per-employee UI can read it even while in single-user view.
                setWorkHoursByUser(prev => ({ ...prev, [Number(selectedUserId)]: parsedWorkHours }))
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
            
            console.log(`📅 Fetching jobs for date range: ${startDate} to ${endDate}`)

            const response = await fetch(apiUrl(`/jobs?start_date=${startDate}&end_date=${endDate}`), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            const data = await response.json().catch((err) => {
                console.error('❌ JSON parse error:', err)
                return {}
            })

            if (!response.ok) {
                console.error('❌ API Error:', response.status, data)
                setApiError(data?.error || 'Failed to fetch jobs')
                // Don't clear jobs on error - keep existing jobs visible
                // setJobs([])
                return
            }

            if (response.ok) {
                const allJobs = (data.jobs || [])
                console.log(`📋 Frontend received ${allJobs.length} total job(s)`)
                
                // Log projected jobs
                const projectedJobs = allJobs.filter((job: any) => job.is_projected || (typeof job.id === 'string' && job.id.startsWith('subscription-')))
                console.log(`👻 Found ${projectedJobs.length} projected job(s):`, projectedJobs.map(j => ({ 
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
                console.log('📊 Jobs by status:', statusCounts)
                
                const cancelledJobs = allJobs.filter((job: any) => job.status === 'cancelled')
                if (cancelledJobs.length > 0) {
                  console.log(`📋 Found ${cancelledJobs.length} cancelled job(s):`, cancelledJobs.map(j => ({ id: j.id, status: j.status, assigned_user_id: j.assigned_user_id, scheduled_date: j.scheduled_date })))
                }
                
                console.log(`🔍 Current selectedUserId: ${selectedUserId} (type: ${typeof selectedUserId})`)
                
                // Always keep the full dataset for the route planner
                setAllJobs(allJobs)

                if (selectedUserId === 'all') {
                  setJobs(allJobs)
                  console.log(`✅ Set ${allJobs.length} jobs (all users)`)
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
                  console.log(`🔍 Filtered to ${filteredJobs.length} jobs for user ${selectedUserId} (${projectedCount} projected)`)
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
        // capacity. Failures here are logged but do not block the jobs
        // fetch — they just leave the appointments map empty.
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
            const userParam = selectedUserId === 'all' ? 'all' : String(selectedUserId)
            const apptRes = await fetch(
                apiUrl(`/appointments?from=${startDate}&to=${endDate}&user_id=${userParam}&status=all`),
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (apptRes.ok) {
                const apptData = await apptRes.json()
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

    // Solo company: only one user → always pin to that user, ignore "all"/URL/localStorage.
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
      const normalized = u.toLowerCase()
      const byName = users.find(x => `${x.first_name} ${x.last_name}`.trim().toLowerCase() === normalized)
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
            console.log(`🔄 useEffect triggered: fetching jobs for ${viewMode} ${currentWeek}, user ${selectedUserId}`)
            fetchJobsForWeek()
        } else {
            console.log(`⏸️ useEffect skipped: user=${!!user}, userLoading=${userLoading}, selectedUserId=${selectedUserId}`)
        }
    }, [currentWeek, selectedUserId, user, userLoading, viewMode])

    // Mobile week row: align today as the leftmost visible column.
    // Sunday is the exception — scroll as far right as possible.
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


    // Fetch leave for the selected employee (whole year so week navigation needs no re-fetch)
    useEffect(() => {
        if (selectedUserId === 'all' || !user) { setEmployeeLeaveByDate({}); return }
        const token = localStorage.getItem('token')
        const year = currentWeek.getFullYear()
        fetch(apiUrl(`/employee-leave/${selectedUserId}?from=${year}-01-01&to=${year + 1}-12-31`), {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : { leave: [] })
            .then(d => {
                const byDate: Record<string, { leave_type: string; hours_off: number | null }> = {}
                for (const e of (d.leave || [])) byDate[e.leave_date] = { leave_type: e.leave_type, hours_off: e.hours_off }
                setEmployeeLeaveByDate(byDate)
            })
            .catch(() => {})
    }, [selectedUserId, currentWeek, user])

    // "HH:MM" (or "HH:MM:SS") → minutes since midnight. Missing/invalid → Infinity
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
    //   2) DB route_order (set only when an admin has arranged the day — route
    //      planner run, or a drag-drop on the calendar)
    //   3) Default: scheduled_time_from ascending (earliest first). Time-less
    //      jobs sink to the bottom where creation order decides.
    //
    // Note: we intentionally do NOT use sort_order as a day-level order signal
    // anymore — it's set at creation for every job, so it doesn't distinguish
    // "admin arranged this day" from "nothing has been done here yet".
    const getJobsForDay = (date: Date) => {
        const dateString = toLocalDateString(date)
        const dayJobs = jobs.filter(job => toDateOnlyString(job.scheduled_date) === dateString)

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

            // 2) DB route_order — only set after admin has arranged the day.
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
        setShowCreateMenu(false)
        setIsCreateModalOpen(true)
    }

    // Route planner search → start a job for an existing client
    const openCreateJobForClient = (clientId: number) => {
        setCreateJobNewClient(null)
        setCreateJobClientId(clientId)
        setCreateJobLockClient(true)
        setCreateJobPrefillDate(toLocalDateString(currentWeek))
        setCreateJobPrefillUserId(
            dayFocusUserId ?? (selectedUserId === 'all' ? null : selectedUserId),
        )
        setShowCreateMenu(false)
        setIsCreateModalOpen(true)
    }

    // Route planner search → start a job at a picked map location (new client)
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
        setShowCreateMenu(false)
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
            setDayFocusUserId(uid)
        }
        setViewMode('day')
    }

    // Get a specific user's scheduled work hours for a day-of-week.
    // Returns 0 when the user has no schedule on file yet (safe default –
    // callers treat 0 as "off").
    const getWorkHoursForUserDay = (userId: number, dayIndex: number): number => {
        const hours = workHoursByUser[userId]
        if (!hours) return 0
        const dayMap: (keyof WorkHours)[] = [
            'monday_hours',
            'tuesday_hours',
            'wednesday_hours',
            'thursday_hours',
            'friday_hours',
            'saturday_hours',
            'sunday_hours',
        ]
        const raw = hours[dayMap[dayIndex]]
        const n = typeof raw === 'string' ? parseFloat(raw) : (raw || 0)
        return isNaN(n) ? 0 : n
    }

    // Get work hours for a specific day (dayIndex: 0=Monday, 1=Tuesday, etc.)
    const getWorkHoursForDay = (dayIndex: number) => {
        // Use aggregated work hours if "all teams" is selected, otherwise use individual work hours
        const hoursToUse = selectedUserId === 'all' ? allUsersWorkHours : workHours
        if (!hoursToUse) return 0
        
        // Convert day index (0=Monday) to work hours day mapping (1=Monday)
        // workHours uses: monday_hours, tuesday_hours, etc. (1=Monday, 0=Sunday)
        const dayMap: (keyof WorkHours)[] = [
            'monday_hours',    // 0 = Monday
            'tuesday_hours',   // 1 = Tuesday
            'wednesday_hours', // 2 = Wednesday
            'thursday_hours',  // 3 = Thursday
            'friday_hours',    // 4 = Friday
            'saturday_hours',  // 5 = Saturday
            'sunday_hours'     // 6 = Sunday
        ]
        const hours = hoursToUse[dayMap[dayIndex]]
        // Ensure we return a number, parse if it's a string
        const numHours = typeof hours === 'string' ? parseFloat(hours) : (hours || 0)
        return isNaN(numHours) ? 0 : numHours
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
    // - all_day  → full base-hours for the day
    // - hours    → the declared hours_off (capped to the day's capacity)
    // - span     → end - start (in hours, capped to the day's capacity)
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
    const getApprovedAppointmentHoursForDate = (dateStr: string, baseHoursForDay: number): number => {
        const list = appointmentsByDate[dateStr]
        if (!list || list.length === 0) return 0
        const approved = list.filter((a) => a.status === 'approved')
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

    // Role check — admins can approve/decline requests and edit anyone's
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
        // Optional reason — shown verbatim on the employee's mobile status
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
        setShowCreateMenu(false)
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
                    {/* 3-dot actions menu — only meaningful when the user has some action
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
                        {timeLabel && selectedUserId === 'all' && assignedName && <span>·</span>}
                        {selectedUserId === 'all' && assignedName && <span className="truncate">{assignedName}</span>}
                    </div>
                )}
            </div>
        )
    }

    // Calculate occupied time for a day (in hours) — use estimated_duration (all services)
    const getOccupiedTime = (date: Date) => {
        const dayJobs = getJobsForDay(date)
        const totalMinutes = dayJobs.reduce((total, job) => {
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
        
        // Same-day drops do nothing — job order is set exclusively via the route planner
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

            // Auto-update the source column's saved route — remove the moved job from it
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

    // Format price (compact) — company currency
    const formatPrice = (price: number) => {
        if (!price) return ''
        return formatMoney(price, companyCountryCode)
    }

    // Get address string for display (address • zip city) to match design e.g. "Tyttebærvej 2 • 2400 København"
    const getAddressDisplay = (job: any) => {
        const parts: string[] = []
        if (job.address) parts.push(job.address)
        const zipCity = [job.zip_code, job.city].filter(Boolean).join(' ')
        if (zipCity) parts.push(zipCity)
        return parts.join(' • ')
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

    // Close create menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement
            // Check if click is outside the create button and menu
            const createButtonArea = target.closest('[data-create-menu]')
            if (showCreateMenu && !createButtonArea) {
                setShowCreateMenu(false)
            }
        }

        if (showCreateMenu) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => {
                document.removeEventListener('mousedown', handleClickOutside)
            }
        }
    }, [showCreateMenu])

  // ── Day view helpers ────────────────────────────────────────────────────────

  // Build routes from loaded jobs every time viewMode=day, jobs, or users change
  const buildDayRoutes = useCallback((dayJobs: any[]): UserRoute[] => {
    const byUser: Record<number, any[]> = {}
    dayJobs.forEach(job => {
      const uid = Number(job.assigned_user_id)
      if (!byUser[uid]) byUser[uid] = []
      byUser[uid].push(job)
    })
    return Object.entries(byUser).map(([uid, userJobs], idx) => {
      const user = users.find(u => u.id === Number(uid))
      const sorted = [...userJobs].sort((a, b) => {
        // Explicit route_order (admin arranged) always wins.
        if (a.route_order != null && b.route_order != null) return a.route_order - b.route_order
        if (a.route_order != null) return -1
        if (b.route_order != null) return 1
        // Default: earliest scheduled time first, time-less jobs at the bottom.
        const aMin = parseTimeToMinutes(a.scheduled_time_from)
        const bMin = parseTimeToMinutes(b.scheduled_time_from)
        if (aMin !== bMin) return aMin - bMin
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
      return {
        userId: Number(uid),
        userName: user ? `${user.first_name} ${user.last_name}` : `User ${uid}`,
        color: USER_COLORS[idx % USER_COLORS.length],
        jobs: sorted.map(job => ({
          id: job.id,
          lat: coordOrNull(job.lat ?? job.client_lat),
          lng: coordOrNull(job.lng ?? job.client_lng),
          label: job.name
            ? (job.last_name ? `${job.name} ${job.last_name}` : job.name)
            : (job.title || 'Untitled'),
          address: [job.address, job.zip_code, job.city].filter(Boolean).join(', '),
          time: job.scheduled_time_from
            ? job.scheduled_time_to
              ? `${formatRouteTime(job.scheduled_time_from)} – ${formatRouteTime(job.scheduled_time_to)}`
              : formatRouteTime(job.scheduled_time_from)
            : undefined,
          is_projected: !!(job.is_projected || (typeof job.id === 'string' && job.id.startsWith('subscription-'))),
          is_cancelled: job.status === 'cancelled',
          // True only when the job row itself has coords — NOT the client fallback.
          // Used to decide whether geocoding should run to get a more accurate pin position.
          has_own_coords: coordOrNull(job.lat) != null && coordOrNull(job.lng) != null,
          estimated_duration_minutes: typeof job.estimated_duration === 'number'
            ? job.estimated_duration
            : parseFloat(String(job.estimated_duration)) || 0,
        } as RouteJob)),
      }
    })
  }, [users])

  // Geocode addresses that don't have lat/lng yet (Mapbox Geocoding API).
  // Includes home (start/end) pins — they are not written to DB (isReal false).
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
          // types=address,place — broader than just "address" so partial/unnumbered addresses also match
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

  // Fetch driving times + road geometry from Mapbox Directions API
  const fetchDirections = useCallback(async (route: UserRoute): Promise<Partial<UserRoute>> => {
    if (!MAPBOX_TOKEN) return {}
    // Exclude cancelled jobs — they appear as grey unconnected pins and must not affect
    // the road geometry or leg-minute calculations for active stops.
    const pts = route.jobs.filter(j => j.lat != null && j.lng != null && !j.is_cancelled)
    if (pts.length < 2) return {}
    // Mapbox Directions supports up to 25 waypoints
    const waypointPts = pts.slice(0, 25)
    const coords = waypointPts.map(j => `${j.lng},${j.lat}`).join(';')
    try {
      const res = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`
      )
      const data = await res.json()
      if (!data.routes?.[0]) return {}
      const r = data.routes[0]
      const totalMinutes = r.duration / 60
      const totalKm = r.distance / 1000
      const routeGeometry = r.geometry as { type: string; coordinates: [number, number][] }
      let cumulative = 0
      const updatedJobs = route.jobs.map((job) => {
        if (job.lat == null || job.lng == null || job.is_cancelled) return job
        const ptIdx = waypointPts.findIndex(p => p.id === job.id)
        if (ptIdx <= 0) return { ...job, legMinutes: 0, etaMinutes: 0 }
        const legSec = r.legs[ptIdx - 1]?.duration ?? 0
        const legMin = legSec / 60
        cumulative += legMin
        return { ...job, legMinutes: legMin, etaMinutes: cumulative }
      })
      return { totalMinutes, totalKm, jobs: updatedJobs, routeGeometry }
    } catch { return {} }
  }, [])

  // Debounced directions refresh — runs when job order OR coordinates change
  useEffect(() => {
    if (viewMode !== 'day') return
    if (directionsFetchTimeoutRef.current) clearTimeout(directionsFetchTimeoutRef.current)
    directionsFetchTimeoutRef.current = setTimeout(async () => {
      const routeSnapshot = dayRoutes
      if (routesHaveDirections(routeSnapshot)) return

      const patches = new Map<number, Partial<UserRoute>>()
      // Only re-fetch routes whose geometry was cleared (e.g. the 2 affected by a reassign).
      // Routes that still have geometry keep their existing lines — no wasted API calls.
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
      // Apply patches onto the CURRENT state (prev) — not the stale snapshot —
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
  // pendingAssigneeChanges intentionally omitted — changes are read via ref to avoid
  // rebuilding routes from scratch every time a job is drag-reassigned.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, currentWeek, allJobs, users, buildDayRoutes, geocodeMissingAddresses])

  // Reorder handler — updates local state only (save via Save & apply button)
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

  // ── Manual "Draw route" mode ─────────────────────────────────────────────────
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
    const routesToSave = userId != null
      ? dayRoutes.filter(r => r.userId === userId)
      : dayRoutes.filter(r => unsavedUserIds.includes(r.userId))
    if (routesToSave.length === 0) return

    // Only include real (non-projected) jobs with integer IDs.
    // Projected/subscription jobs have string IDs like 'subscription-42' which cause
    // a PostgreSQL type error in the UPDATE query and silently kill the whole save.
    const allJobIds = routesToSave.flatMap(r =>
      r.jobs.filter(j => !j.is_projected && Number.isInteger(Number(j.id))).map(j => Number(j.id))
    )
    console.log('[Save & Apply] allJobIds:', allJobIds.length, allJobIds)
    if (allJobIds.length === 0) {
      console.warn('[Save & Apply] No real job IDs found — all jobs may be subscription/projected. Route order not saved.')
      return
    }

    const token = localStorage.getItem('token')
    let res: Response
    try {
      res = await fetch(apiUrl('/jobs/route-order'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orderedIds: allJobIds }),
      })
    } catch (err) {
      console.error('[route-order] Network error — is the API server running?', err)
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

    // Baseline becomes the saved route — deltas only count from the next edit
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

    // Fetch fresh Mapbox directions for each saved route (including start/end home if present).
    await Promise.all(routesToSave.map(async route => {
      const realJobs = route.jobs.filter(j => !j.is_projected && !j.is_cancelled && Number.isInteger(Number(j.id)))
      // All stops with coords for directions (include home start/end so drive time is correct)
      const waypointJobs = route.jobs.filter(j => j.lat && j.lng && !j.is_cancelled)
      if (waypointJobs.length < 2) return

      const totalJobMins = realJobs.reduce((sum, j) => sum + (j.estimated_duration_minutes ?? 0), 0)

      try {
        let totalDriveMins: number
        let totalKm: number | null = route.totalKm != null ? Math.round(route.totalKm * 10) / 10 : null
        let legMins: (number | null)[] = []

        if (route.totalMinutes != null && waypointJobs.length >= 2) {
          totalDriveMins = Math.round(route.totalMinutes)
          const dirRoute = { ...route, jobs: waypointJobs }
          const legDirections = await fetchDirections(dirRoute)
          if (legDirections.jobs) {
            if (totalKm == null && legDirections.totalKm != null) totalKm = Math.round(legDirections.totalKm * 10) / 10
            // Save leg minutes only for real jobs (same order as realJobs)
            legMins = realJobs.map(real => {
              const idx = legDirections.jobs!.findIndex(j => j.id === real.id)
              const j = idx >= 0 ? legDirections.jobs![idx] : null
              return j?.legMinutes != null ? Math.round(j.legMinutes * 10) / 10 : null
            })
          }
        } else {
          const dirRoute = { ...route, jobs: waypointJobs }
          const directions = await fetchDirections(dirRoute)
          if (directions.totalMinutes == null) return
          totalDriveMins = Math.round(directions.totalMinutes)
          totalKm = directions.totalKm != null ? Math.round(directions.totalKm * 10) / 10 : null
          legMins = realJobs.map(real => {
            const idx = (directions.jobs ?? []).findIndex(j => j.id === real.id)
            const j = idx >= 0 ? (directions.jobs ?? [])[idx] : null
            return j?.legMinutes != null ? Math.round(j.legMinutes * 10) / 10 : null
          })
        }

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
            leg_minutes: legMins,
            total_minutes: totalDriveMins,
            total_job_minutes: Math.round(totalJobMins),
            total_km: totalKm,
            // Road-following GeoJSON coordinates from Directions API — used by the
            // mobile app to draw the actual route on the overview map image.
            route_geometry: route.routeGeometry?.coordinates
              ? JSON.stringify(route.routeGeometry.coordinates)
              : null,
          }),
        })
        if (!saveRes.ok) {
          console.error('[Save & Apply] daily-routes save failed:', saveRes.status, await saveRes.text())
        } else {
          console.log('[Save & Apply] ✅ saved to DB')
        }
        setTravelMinutes(prev => ({ ...prev, [`${dateStr}:${route.userId}`]: totalDriveMins }))
      } catch { /* best-effort */ }
    }))

    // Mark saved users as clean
    setSavedFingerprintsByUser(prev => {
      const next = { ...prev }
      routesToSave.forEach(r => { next[r.userId] = buildUserFingerprint(r) })
      return next
    })
    dayRouteCacheRef.current.set(toLocalDateString(currentWeek), dayRoutes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRoutes, unsavedUserIds, currentWeek, fetchDirections, pendingAssigneeChanges, buildUserFingerprint])

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

  // ── Bulk / multi-employee route optimisation ──────────────────────────────

  const handleBulkOptimize = useCallback(async (
    userIds: number[],
    allowReassign: boolean,
    onProgress: (p: { step: number; total: number; message: string }) => void,
  ) => {
    if (userIds.length === 0) return

    if (!allowReassign) {
      // ── Simple mode: run existing single-employee optimizer in sequence ──
      const total = userIds.length
      for (let i = 0; i < userIds.length; i++) {
        const uid = userIds[i]
        const route = dayRoutes.find(r => r.userId === uid)
        const name = route?.userName ?? `Employee ${i + 1}`
        onProgress({ step: i, total, message: `Optimising route for ${name}…` })
        await handleDayOptimize(uid)
        await new Promise(r => setTimeout(r, 80))
      }
      onProgress({ step: total, total, message: 'Done!' })
      return
    }

    // ── Reassign mode: adaptive geo-first territory assignment ──────────────
    //
    // Goal: each employee owns a tight, contiguous area. We anchor every
    // employee at their home/start location and give each job to the nearest
    // anchor (a Voronoi partition). Employees who share an anchor (e.g. one
    // shared company depot) are split apart with compact k-means so nobody
    // ends up with two disjoint blobs. Workload is NOT balanced — geography
    // decides everything, which is what produces sensible, local routes.

    const routes = dayRoutes.filter(r => userIds.includes(r.userId))
    const k = routes.length
    const totalSteps = k + 2
    let step = 0

    // 1. Pool all locatable, non-cancelled, non-home jobs
    onProgress({ step: step++, total: totalSteps, message: 'Pooling jobs…' })
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

    // Longitude shrinks toward the poles — scale it by cos(latitude) so that
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
    onProgress({ step: step++, total: totalSteps, message: 'Mapping territories…' })
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
    // ≈ 100 m, so everyone on a single shared depot lands in one group.
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
        message: `Optimising ${route.userName} (${middleJobs.length} stop${middleJobs.length !== 1 ? 's' : ''})…`,
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
                {/* Top Bar — hidden in day view (calendar nav lives on the map overlay).
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
                                    onClick={() => setViewMode(m)}
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

                {/* ── Day view: full-screen overlay.
                    Desktop (lg+):  fixed, offset by the 200px sidebar, side-by-side.
                    Mobile/tablet:  takes over below the sticky top bar; we stack
                    the route panel on top of the map so both are reachable.
                    The hardcoded `left: 200` is gone — we use Tailwind so it can
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

                {/* ── Month / Week views ────────────────────────────────── */}
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
                                // Color tiers: green ≤80%, amber 80-100%, red >100% or jobs with 0 hours.
                                const barPercent = Math.min(100, utilizationPercent)
                                const barColor = hasJobsButNoHours || utilizationPercent > 100
                                    ? '#EF4444'
                                    : utilizationPercent >= 80
                                        ? '#F59E0B'
                                        : utilizationPercent > 0
                                            ? '#3DD57A'
                                            : 'transparent'
                                // Build a compact breakdown tooltip: jobs · appointments · capacity · over.
                                const apptCountToday = (appointmentsByDate[dateString] || [])
                                    .filter((a) => a.status === 'approved' && (selectedUserId === 'all' || Number(a.user_id) === Number(selectedUserId)))
                                    .length
                                const overHours = Math.max(0, occupiedHours - workHoursNum)
                                const barTooltip =
                                    `${dayJobs.length} ${t('app.jobsPage.jobs', 'jobs')} · ` +
                                    `${apptCountToday} ${t('app.appointments.label', 'appointments')} · ` +
                                    `${workHoursNum.toFixed(1)}h ${t('app.jobsPage.capacity', 'capacity')}` +
                                    (overHours > 0 ? ` · ${overHours.toFixed(1)}h ${t('app.jobsPage.over', 'over')}` : '')
                                
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
                                                    
                                                    return (
                                                        <div
                                                            key={job.id}
                                                            draggable={!isJobCancelled}
                                                            onDragStart={(e) => !isJobCancelled && handleDragStart(e, job)}
                                                            onDragEnd={handleDragEnd}
                                                            onClick={() => handleJobClick(job)}
                                                            className={`rounded-lg p-2 text-xs transition-all border ${
                                                                isJobCancelled
                                                                    ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed'
                                                                    : isDayBlocked
                                                                        ? 'bg-gray-50 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer'
                                                                        : 'bg-[#fff] border-[#F1F8F4] hover:border-[#E0EDE4] cursor-pointer'
                                                            } ${draggedJob?.id === job.id ? 'opacity-50' : ''}`}
                                                        >
                                                            <div className="font-semibold text-gray-800 truncate flex items-center gap-1">
                                                                {isJobCompleted && !isJobCancelled && (
                                                                    <CheckIcon className="w-3 h-3 text-accent-500 flex-shrink-0" strokeWidth={3} />
                                                                )}
                                                                <span className="truncate">
                                                                    {[job.name || job.first_name, job.last_name].filter(Boolean).join(' ') || t('app.jobsPage.client')}
                                                                </span>
                                                            </div>
                                                            {isJobCancelled && (
                                                                <span className="text-[9px] font-medium text-red-600">{t('app.jobsPage.cancelled')}</span>
                                                            )}
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
                    /* Weekly Calendar — horizontal slider showing 5 days by default, scrollable to show all 7 days */
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

                                    // Leave deduction — only applies when a single employee is selected
                                    const dayLeaveEntry = selectedUserId !== 'all' ? employeeLeaveByDate[dateString] ?? null : null
                                    const leaveHoursOff = getLeaveHoursOff(dateString, baseHours)
                                    const apptHoursOff = getApprovedAppointmentHoursForDate(dateString, baseHours)
                                    const workHoursNum = Math.max(0, baseHours - leaveHoursOff - apptHoursOff)

                                    // "Blocked day" = 0 hours available (weekend, full-day leave,
                                    // all-day appointment, etc.). Drives the diagonal-stripe overlay
                                    // on the column and the muted styling on any jobs still here.
                                    const isDayBlocked = isCalendarDayBlocked(workHoursNum, dateString)

                                    // Parse saved route for this day once — drives both the button colour
                                    // and the planned/unplanned divider in the job list.
                                    const dayRouteIds = (() => {
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
                                    const routeIsIntact = plannedDays.has(dateString) && dayRouteIds.size > 0 &&
                                        dayJobs.every((j: any) => j.is_projected || !Number.isInteger(Number(j.id)) || dayRouteIds.has(String(j.id)))

                                    // Index of the first job not in the saved route — divider goes here.
                                    const firstUnplannedIndex = dayRouteIds.size === 0 ? -1 :
                                        dayJobs.findIndex((j: any) => !j.is_projected && Number.isInteger(Number(j.id)) && !dayRouteIds.has(String(j.id)))

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
                                            {/* Stripes at z-0; content at z-[1] — negative z-index was painting
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
                                                        `${dayJobs.length} ${t('app.jobsPage.jobs', 'jobs')} · ` +
                                                        `${apptCountToday} ${t('app.appointments.label', 'appointments')} · ` +
                                                        `${workHoursNum.toFixed(1)}h ${t('app.jobsPage.capacity', 'capacity')}` +
                                                        (overHoursW > 0 ? ` · ${overHoursW.toFixed(1)}h ${t('app.jobsPage.over', 'over')}` : '')
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
                                                {/* Action buttons: Add job (left) + Plan route (right) */}
                                                <div className="flex items-center justify-between mt-2 gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                                            setCellAddMenu({
                                                                date: dateString,
                                                                x: rect.left,
                                                                y: rect.bottom + 4,
                                                            })
                                                        }}
                                                        className="flex items-center gap-1 text-[11px] font-medium text-accent-600 hover:text-accent-700 hover:bg-accent-50 px-1.5 py-0.5 rounded-md transition-colors"
                                                        title="Add a job"
                                                    >
                                                        <PlusIcon className="w-3 h-3" />
                                                        Add a job
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            // If a single employee is selected in the jobs list, open the route planner
                                                            // directly on that employee's route. Otherwise show all employees overview.
                                                            if (selectedUserId !== 'all') {
                                                              const userIdNum = typeof selectedUserId === 'string'
                                                                ? parseInt(selectedUserId, 10)
                                                                : selectedUserId
                                                              setDayFocusUserId(userIdNum)
                                                            } else {
                                                              setDayFocusUserId(null)
                                                            }
                                                            setCurrentWeek(new Date(day))
                                                            setViewMode('day')
                                                        }}
                                                        className={`flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md transition-colors ${
                                                            routeIsIntact
                                                                ? 'text-accent-600 hover:text-accent-700 hover:bg-accent-50'
                                                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                                        }`}
                                                        title={routeIsIntact ? t('app.jobsPage.planRouteTitlePlanned') : t('app.jobsPage.planRouteTitle')}
                                                    >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                                        </svg>
                                                        {t('app.jobsPage.planRoute')}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Job cards — items bg #fff, border #F1F8F4; column has p-[10px] so no extra padding here */}
                                            <div className="flex-1 overflow-y-auto">
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
                                                        <div className="min-h-[4px]" />
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
                                                          : dayJobs.map((job, jobIndex) => {
                                                            const hasTime = job.scheduled_time_from || job.scheduled_time_to
                                                            const addressDisplay = getAddressDisplay(job)
                                                            const isJobCompleted = job.status === 'completed' || job.status === 'sub_completed'
                                                            const isJobCancelled = job.status === 'cancelled'
                                                            const taskCount = getJobTaskCount(job)
                                                            const jobDisplayPrice = getJobDisplayPrice(job)
                                                            const noteCount = (job as any).note_count ?? 0

                                                            return (
                                                                <div key={job.id}>
                                                                    {/* Divider before the first job that isn't part of the saved route */}
                                                                    {jobIndex === firstUnplannedIndex && firstUnplannedIndex > 0 && (
                                                                        <div className="flex items-center gap-2 my-2">
                                                                            <div className="flex-1 border-t border-dashed border-gray-200" />
                                                                            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('app.jobsPage.notPlanned')}</span>
                                                                            <div className="flex-1 border-t border-dashed border-gray-200" />
                                                                        </div>
                                                                    )}
                                                                    <div
                                                                        draggable={!isJobCancelled}
                                                                        onDragStart={(e) => !isJobCancelled && handleDragStart(e, job)}
                                                                        onDragEnd={handleDragEnd}
                                                                        onClick={() => handleJobClick(job)}
                                                                        className={`rounded-xl p-3 transition-all border ${
                                                                            isJobCancelled
                                                                                ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed'
                                                                                : isDayBlocked
                                                                                    ? 'bg-gray-50 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer'
                                                                                    : 'bg-[#fff] border-[#F1F8F4] hover:border-[#E0EDE4] cursor-pointer'
                                                                        } ${draggedJob?.id === job.id ? 'opacity-50' : ''}`}
                                                                    >
                                                                    {/* Row 1: Client (left) + notes badge (right) */}
                                                                    <div className="flex items-start justify-between gap-2 mb-1">
                                                                        <div className="flex items-center min-w-0 flex-1">
                                                                            <span className="font-semibold text-sm text-gray-800 truncate min-w-0 flex-1">
                                                                                {[job.name || job.first_name, job.last_name].filter(Boolean).join(' ') || t('app.jobsPage.client')}
                                                                            </span>
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

                                                                    {/* Clock icon + time (e.g. 12:00 - 14:00) */}
                                                                    {hasTime && (
                                                                        <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                                                                            <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                                                            {job.scheduled_time_from && job.scheduled_time_to
                                                                                ? `${(job.scheduled_time_from+'').substring(0,5)} - ${(job.scheduled_time_to+'').substring(0,5)}`
                                                                                : (job.scheduled_time_from+'').substring(0,5) || ''}
                                                                        </div>
                                                                    )}

                                                                    {/* Under border: tasks, time, price (left, same style) | completed button (right) */}
                                                                    <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center justify-between gap-2">
                                                                        <div className="flex items-center gap-3 text-[11px] text-gray-500 min-w-0">
                                                                            <span className="flex items-center gap-1 flex-shrink-0">
                                                                                <DocumentTextIcon className="w-3.5 h-3.5" />
                                                                                {taskCount} task{taskCount !== 1 ? 's' : ''}
                                                                            </span>
                                                                            {(() => {
                                                                                const mins = parseFloat(String(job.estimated_duration ?? job.total_duration ?? 0))
                                                                                return mins > 0 ? (
                                                                                    <span className="flex items-center gap-1 flex-shrink-0">
                                                                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/></svg>
                                                                                        {formatDuration(mins)}
                                                                                    </span>
                                                                                ) : null
                                                                            })()}
                                                                            {jobDisplayPrice > 0 && (
                                                                                <span className="text-[11px] text-gray-500 flex-shrink-0">{formatPrice(jobDisplayPrice)}</span>
                                                                            )}
                                                                        </div>
                                                                        {isJobCancelled ? (
                                                                            <span className="text-[10px] font-medium text-red-600 px-1.5 py-0.5 rounded bg-red-100 flex-shrink-0">{t('app.jobsPage.cancelled')}</span>
                                                                        ) : typeof job.status !== 'undefined' && (
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
                                                                        )}
                                                                    </div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                        </>
                                                        ) : null}
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


            <div className="fixed bottom-6 right-6 z-40" data-create-menu>
                {/* Dropdown Menu */}
                {showCreateMenu && (
                    <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 min-w-[200px]">
                        <button onClick={() => { setShowCreateMenu(false); setIsCreateModalOpen(true) }} className="w-full text-left px-4 py-2.5 text-sm text-primary-500 hover:bg-gray-50 transition-colors rounded-lg mx-1">
                            {t('app.jobsPage.createJob', 'Create job')}
                        </button>
                        <button onClick={() => { setShowCreateMenu(false); openCreateAppointmentForDate(null) }} className="w-full text-left px-4 py-2.5 text-sm text-primary-500 hover:bg-gray-50 transition-colors rounded-lg mx-1">
                            {isAdmin
                                ? t('app.appointments.createMenuItem', 'Create appointment')
                                : t('app.appointments.requestMenuItem', 'Request appointment')}
                        </button>
                        <button onClick={() => { setShowCreateMenu(false); setIsSubscriptionModalOpen(true) }} className="w-full text-left px-4 py-2.5 text-sm text-primary-500 hover:bg-gray-50 transition-colors rounded-lg mx-1">
                            {t('app.jobsPage.createSubscription', 'Create subscription')}
                        </button>
                        <button onClick={() => { setShowCreateMenu(false); setIsCreateClientModalOpen(true) }} className="w-full text-left px-4 py-2.5 text-sm text-primary-500 hover:bg-gray-50 transition-colors rounded-lg mx-1">
                            {t('app.jobsPage.createClient', 'Create client')}
                        </button>
                    </div>
                )}

                {/* Create Button */}
                <div className="relative">
                    {inJobsWizard && (
                        <span
                            aria-hidden
                            className="absolute inset-0 rounded-xl animate-ping bg-accent-400/50 pointer-events-none"
                        />
                    )}
                    <button
                        onClick={() => setShowCreateMenu(!showCreateMenu)}
                        className="relative bg-accent-500 text-white px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg hover:bg-accent-600 transition-all flex items-center space-x-2 font-medium"
                        title={t('app.jobsPage.createFab')}
                    >
                        <span>create +</span>
                    </button>
                </div>
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
                    setShowCreateMenu(false)
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
                    setShowCreateMenu(false)
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
                    setShowCreateMenu(false)
                }}
                onClientAdded={() => {
                    setIsCreateClientModalOpen(false)
                    setShowCreateMenu(false)
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