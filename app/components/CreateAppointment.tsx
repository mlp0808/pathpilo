'use client'

// Modal for creating (and editing) an appointment — the unified entity that
// covers time off (sick, vacation), personal errands (dentist, doctor),
// meetings, and anything that blocks an employee's capacity for the day.
//
// Admin vs. employee behaviour is driven entirely by the `isAdmin` prop:
//   - Admin: can pick the target employee, created as status='approved'.
//   - Employee: user picker is hidden, created as status='requested'.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  XMarkIcon,
  CalendarDaysIcon,
  UserIcon,
  ClockIcon,
  PencilSquareIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import TimePicker from './TimePicker'
import { useAppI18n } from './I18nProvider'

type TimeMode = 'span' | 'hours' | 'all_day'
type Category = 'personal' | 'meeting' | 'sick' | 'vacation' | 'other'
type Kind = 'work' | 'time_off'

interface TeamUser {
  id: number
  first_name: string
  last_name: string
}

export interface AppointmentPayload {
  id?: number
  user_id: number
  title: string
  category: Category
  notes: string | null
  appointment_date: string
  time_mode: TimeMode
  start_time: string | null
  end_time: string | null
  hours_off: number | null
  kind?: Kind
  status?: 'requested' | 'approved'
}

interface CreateAppointmentProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (appointment: any) => void
  users: TeamUser[]
  currentUserId: number
  isAdmin: boolean
  defaultDate?: string | null
  defaultUserId?: number | null
  existing?: AppointmentPayload | null
  t?: (key: string, fallback?: string) => string
}

const CATEGORY_OPTIONS: Array<{
  value: Category
  label: string
  description: string
  emoji: string
  bg: string
  border: string
  text: string
}> = [
  { value: 'personal', label: 'Personal', description: 'Dentist, bank, errands, etc.', emoji: '👤', bg: '#EEF2FF', border: '#C7D2FE', text: '#4338CA' },
  { value: 'meeting',  label: 'Meeting',  description: 'Internal or external meeting',  emoji: '💼', bg: '#ECFEFF', border: '#A5F3FC', text: '#0E7490' },
  { value: 'sick',     label: 'Sick',     description: 'Out sick',                       emoji: '🤒', bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
  { value: 'vacation', label: 'Vacation', description: 'Holiday / time off',             emoji: '🏖️', bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
  { value: 'other',    label: 'Other',    description: 'Anything else',                  emoji: '📌', bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' },
]

function todayDateString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CreateAppointment({
  isOpen,
  onClose,
  onCreated,
  users,
  currentUserId,
  isAdmin,
  defaultDate = null,
  defaultUserId = null,
  existing = null,
  t,
}: CreateAppointmentProps) {
  // Pull translations from the global i18n context so the modal always speaks
  // the user's language, even when the caller forgets to pass the `t` prop.
  // The explicit `t` prop still wins if provided (lets tests inject).
  const { t: ctxT } = useAppI18n()
  const tr: (key: string, fb?: string) => string =
    t || ((k: string, fb?: string) => ctxT(k as any, fb))

  const [userId, setUserId] = useState<number>(defaultUserId || currentUserId)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('personal')
  const [date, setDate] = useState<string>(defaultDate || todayDateString())
  const [timeMode, setTimeMode] = useState<TimeMode>('span')
  const [startTime, setStartTime] = useState<string>('09:00')
  const [endTime, setEndTime] = useState<string>('10:00')
  const [hoursOff, setHoursOff] = useState<string>('1')
  const [notes, setNotes] = useState<string>('')
  // Admin-only classification: is this productive work time (meeting, errand)
  // or actual time off (sick, vacation)? Default 'work' so admin-created
  // appointments behave like occupied work hours unless explicitly flipped.
  // Employees never see this — their request persists as 'work' by default
  // and an admin can reclassify on approval.
  const [kind, setKind] = useState<Kind>('work')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!existing?.id
  const isSolo = users.length <= 1

  // Reset form whenever the modal opens. Existing (edit mode) prefills; create
  // mode uses the defaults from props.
  useEffect(() => {
    if (!isOpen) return
    if (existing) {
      setUserId(existing.user_id)
      setTitle(existing.title || '')
      setCategory(existing.category)
      setDate(existing.appointment_date)
      setTimeMode(existing.time_mode)
      setStartTime(existing.start_time || '09:00')
      setEndTime(existing.end_time || '10:00')
      setHoursOff(existing.hours_off != null ? String(existing.hours_off) : '1')
      setNotes(existing.notes || '')
      setKind(existing.kind === 'time_off' ? 'time_off' : 'work')
    } else {
      setUserId(defaultUserId || currentUserId)
      setTitle('')
      setCategory('personal')
      setDate(defaultDate || todayDateString())
      setTimeMode('span')
      setStartTime('09:00')
      setEndTime('10:00')
      setHoursOff('1')
      setNotes('')
      setKind('work')
    }
    setError(null)
    setSubmitting(false)
  }, [isOpen, existing, defaultDate, defaultUserId, currentUserId])

  const selectedUser = useMemo(
    () => users.find((u) => u.id === userId) || null,
    [users, userId],
  )

  const durationLabel = useMemo(() => {
    if (timeMode === 'all_day') return tr('app.appointments.allDay', 'All day')
    if (timeMode === 'hours') {
      const n = Number(hoursOff)
      return Number.isFinite(n) && n > 0
        ? `${n} ${tr('app.appointments.hoursShort', 'h')}`
        : ''
    }
    if (timeMode === 'span' && startTime && endTime) {
      const [sh, sm] = startTime.split(':').map((x) => parseInt(x, 10))
      const [eh, em] = endTime.split(':').map((x) => parseInt(x, 10))
      const mins = eh * 60 + em - (sh * 60 + sm)
      if (mins > 0) {
        const h = Math.floor(mins / 60)
        const m = mins % 60
        return m === 0 ? `${h}h` : `${h}h ${m}m`
      }
    }
    return ''
  }, [timeMode, startTime, endTime, hoursOff, tr])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError(tr('app.appointments.errors.titleRequired', 'Please give the appointment a title.'))
      return
    }

    if (timeMode === 'span') {
      if (!startTime || !endTime) {
        setError(tr('app.appointments.errors.spanMissing', 'Start and end time are required.'))
        return
      }
      if (startTime >= endTime) {
        setError(tr('app.appointments.errors.endBeforeStart', 'End time must be after start time.'))
        return
      }
    }
    if (timeMode === 'hours') {
      const n = Number(hoursOff)
      if (!Number.isFinite(n) || n <= 0 || n > 24) {
        setError(tr('app.appointments.errors.hoursInvalid', 'Hours must be between 0 and 24.'))
        return
      }
    }

    setSubmitting(true)
    setError(null)

    const payload: any = {
      user_id: userId,
      title: trimmedTitle,
      category,
      notes: notes.trim() || null,
      appointment_date: date,
      time_mode: timeMode,
      start_time: timeMode === 'span' ? startTime : null,
      end_time: timeMode === 'span' ? endTime : null,
      hours_off: timeMode === 'hours' ? Number(hoursOff) : null,
    }
    // The backend ignores `kind` from non-admins (employees always persist as
    // 'work') but there's no harm in omitting it entirely on that path.
    if (isAdmin) payload.kind = kind

    try {
      const token = localStorage.getItem('token')
      const url = isEditing
        ? apiUrl(`/appointments/${existing!.id}`)
        : apiUrl('/appointments')
      const method = isEditing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || tr('app.appointments.errors.generic', 'Failed to save appointment.'))
        setSubmitting(false)
        return
      }
      onCreated(data.appointment)
      onClose()
    } catch (err) {
      console.error('Appointment save failed:', err)
      setError(tr('app.appointments.errors.network', 'Network error. Please try again.'))
      setSubmitting(false)
    }
  }

  const backdropRef = useRef<HTMLDivElement | null>(null)
  if (!isOpen) return null

  const submitLabel = isEditing
    ? tr('app.appointments.save', 'Save changes')
    : isAdmin
      ? tr('app.appointments.create', 'Create appointment')
      : tr('app.appointments.submitRequest', 'Submit request')

  const modal = (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 overflow-y-auto py-6 px-4"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-xl my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-50 flex items-center justify-center">
              <CalendarDaysIcon className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isEditing
                  ? tr('app.appointments.editTitle', 'Edit appointment')
                  : isAdmin
                    ? tr('app.appointments.newTitle', 'New appointment')
                    : tr('app.appointments.requestTitle', 'Request appointment')}
              </h2>
              <p className="text-xs text-gray-500">
                {isAdmin
                  ? tr(
                      'app.appointments.adminSubtitle',
                      'Blocks capacity for the selected employee on the chosen day.',
                    )
                  : tr(
                      'app.appointments.employeeSubtitle',
                      'Your request will be sent to an admin for approval.',
                    )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label={tr('app.close', 'Close')}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Employee picker (hidden for solo or non-admin) */}
          {isAdmin && !isSolo && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <UserIcon className="w-4 h-4 text-gray-400" />
                {tr('app.appointments.employee', 'Employee')}
              </label>
              <select
                value={userId}
                onChange={(e) => setUserId(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
                disabled={isEditing}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isAdmin && isSolo && selectedUser && (
            <div className="text-sm text-gray-500 flex items-center gap-1.5">
              <UserIcon className="w-4 h-4" />
              {selectedUser.first_name} {selectedUser.last_name}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <PencilSquareIcon className="w-4 h-4 text-gray-400" />
              {tr('app.appointments.title', 'Title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr('app.appointments.titlePlaceholder', 'e.g. Dentist appointment')}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              maxLength={200}
              autoFocus
            />
          </div>

          {/* Category + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {tr('app.appointments.category', 'Category')}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORY_OPTIONS.map((opt) => {
                  const selected = category === opt.value
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setCategory(opt.value)}
                      className={`text-left rounded-lg border px-2.5 py-2 text-xs transition ${
                        selected
                          ? 'border-accent-500 bg-accent-50 text-accent-800'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <span className="mr-1">{opt.emoji}</span>
                      <span className="font-medium">
                        {tr(`app.appointments.cat.${opt.value}`, opt.label)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {tr('app.appointments.date', 'Date')}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              />
              {durationLabel && (
                <p className="mt-2 text-xs text-gray-500 flex items-center gap-1.5">
                  <ClockIcon className="w-3.5 h-3.5" />
                  {tr('app.appointments.totalDuration', 'Duration')}: {durationLabel}
                </p>
              )}
            </div>
          </div>

          {/* Time mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {tr('app.appointments.timeMode', 'Time')}
            </label>
            <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
              {(
                [
                  { v: 'span', lKey: 'app.appointments.timeModeSpan', label: 'Time span' },
                  { v: 'hours', lKey: 'app.appointments.timeModeHours', label: 'Hours' },
                  { v: 'all_day', lKey: 'app.appointments.timeModeAllDay', label: 'All day' },
                ] as const
              ).map((opt) => {
                const selected = timeMode === opt.v
                return (
                  <button
                    type="button"
                    key={opt.v}
                    onClick={() => setTimeMode(opt.v)}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      selected ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    {tr(opt.lKey, opt.label)}
                  </button>
                )
              })}
            </div>

            <div className="mt-3">
              {timeMode === 'span' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      {tr('app.appointments.start', 'Start')}
                    </label>
                    <TimePicker value={startTime} onChange={setStartTime} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      {tr('app.appointments.end', 'End')}
                    </label>
                    <TimePicker value={endTime} onChange={setEndTime} />
                  </div>
                </div>
              )}
              {timeMode === 'hours' && (
                <div className="max-w-xs">
                  <label className="block text-xs text-gray-500 mb-1">
                    {tr('app.appointments.hoursOff', 'Hours off')}
                  </label>
                  <input
                    type="number"
                    min={0.25}
                    max={24}
                    step={0.25}
                    value={hoursOff}
                    onChange={(e) => setHoursOff(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {tr(
                      'app.appointments.hoursHelp',
                      'Use when you don\'t need a specific clock time — just a count that\'s deducted from the day.',
                    )}
                  </p>
                </div>
              )}
              {timeMode === 'all_day' && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                  <InformationCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {tr(
                    'app.appointments.allDayHelp',
                    'Blocks the full work day — no jobs can be scheduled against that day\'s capacity.',
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {tr('app.appointments.notes', 'Notes')}{' '}
              <span className="font-normal text-gray-400">
                ({tr('app.optional', 'optional')})
              </span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              placeholder={tr('app.appointments.notesPlaceholder', 'Anything useful for context (optional)')}
            />
          </div>

          {/* Kind (admin only). Doesn't change capacity today; used for future
              reporting so admins can separate "occupied work time" from
              "actual time off" in analytics and timesheets. */}
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {tr('app.appointments.kind', 'Counts as')}
              </label>
              <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                {(
                  [
                    { v: 'work', lKey: 'app.appointments.kindWork', label: 'Work time' },
                    { v: 'time_off', lKey: 'app.appointments.kindTimeOff', label: 'Time off' },
                  ] as const
                ).map((opt) => {
                  const selected = kind === opt.v
                  return (
                    <button
                      type="button"
                      key={opt.v}
                      onClick={() => setKind(opt.v)}
                      className={`px-3 py-1.5 text-xs rounded-md transition ${
                        selected ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {tr(opt.lKey, opt.label)}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                {kind === 'work'
                  ? tr(
                      'app.appointments.kindWorkHelp',
                      'Counted as productive work time (meeting, errand, training). Blocks capacity the same way.',
                    )
                  : tr(
                      'app.appointments.kindTimeOffHelp',
                      'Counted as time off (sick, vacation). Blocks capacity, and separated in reports.',
                    )}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!isAdmin && !isEditing && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
              <InformationCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {tr(
                'app.appointments.employeeRequestHelp',
                'This appointment will be sent as a request. An admin must approve it before it blocks capacity.',
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100"
          >
            {tr('app.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-sm font-semibold rounded-xl bg-accent-500 text-white hover:bg-accent-600 shadow-lg shadow-accent-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
          >
            {submitting
              ? tr('app.appointments.saving', 'Saving...')
              : submitLabel}
          </button>
        </div>
      </form>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}

export { CATEGORY_OPTIONS }
