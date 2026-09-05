'use client'

/**
 * Work hours settings — company default + per-employee schedules.
 * Model: start time + daily work hours (Mon–Thu 7.5, Fri 7, start 08:00 by default).
 * Capacity bars always follow these hours everywhere (map, jobs calendar, planner).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiUrl } from '../../utils/api'
import { useAppI18n } from '../../components/I18nProvider'
import { SettingsHeader, SettingsSection, SettingsButton, SettingsHint } from '../../components/settings/SettingsUI'
import { invalidateMapCaches, invalidateWorkHoursCache } from '../../components/map/useMapData'

type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

interface DaySchedule {
  start: string
  hours: number
  off: boolean
}

interface TeamUser {
  id: number
  first_name: string
  last_name: string
}

const WEEKDAYS: Array<{ key: Weekday; labelKey: string; fallback: string }> = [
  { key: 'monday', labelKey: 'app.day.monday', fallback: 'Monday' },
  { key: 'tuesday', labelKey: 'app.day.tuesday', fallback: 'Tuesday' },
  { key: 'wednesday', labelKey: 'app.day.wednesday', fallback: 'Wednesday' },
  { key: 'thursday', labelKey: 'app.day.thursday', fallback: 'Thursday' },
  { key: 'friday', labelKey: 'app.day.friday', fallback: 'Friday' },
  { key: 'saturday', labelKey: 'app.day.saturday', fallback: 'Saturday' },
  { key: 'sunday', labelKey: 'app.day.sunday', fallback: 'Sunday' },
]

const DEFAULT_SCHEDULE: Record<Weekday, DaySchedule> = {
  monday: { start: '08:00', hours: 7.5, off: false },
  tuesday: { start: '08:00', hours: 7.5, off: false },
  wednesday: { start: '08:00', hours: 7.5, off: false },
  thursday: { start: '08:00', hours: 7.5, off: false },
  friday: { start: '08:00', hours: 7.0, off: false },
  saturday: { start: '08:00', hours: 0, off: true },
  sunday: { start: '08:00', hours: 0, off: true },
}

const COMPANY_SCOPE = 'company'

function rowToSchedule(row: Record<string, unknown> | null | undefined): Record<Weekday, DaySchedule> {
  const next: Record<Weekday, DaySchedule> = { ...DEFAULT_SCHEDULE }
  if (!row) return next
  for (const { key } of WEEKDAYS) {
    const rawHours = row[`${key}_hours`]
    const hours = rawHours != null && rawHours !== ''
      ? parseFloat(String(rawHours))
      : DEFAULT_SCHEDULE[key].hours
    const start = String(row[`${key}_start`] || DEFAULT_SCHEDULE[key].start || '08:00').slice(0, 5)
    const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0
    next[key] = {
      start: start || '08:00',
      hours: safeHours,
      off: safeHours <= 0,
    }
  }
  return next
}

function scheduleToPayload(schedule: Record<Weekday, DaySchedule>): Record<string, unknown> {
  const payload: Record<string, unknown> = { work_hours_mode: 'flexible' }
  for (const { key } of WEEKDAYS) {
    const d = schedule[key]
    const hours = d.off ? 0 : Math.max(0, Math.min(24, d.hours || 0))
    payload[`${key}_hours`] = hours
    payload[`${key}_start`] = hours > 0 ? (d.start || '08:00') : null
    payload[`${key}_end`] = null
    payload[`${key}_break_minutes`] = 0
  }
  return payload
}

export default function CompanyWorkHoursSettingsPage() {
  const { t } = useAppI18n()

  const [users, setUsers] = useState<TeamUser[]>([])
  const [scope, setScope] = useState<string>(COMPANY_SCOPE)
  const [schedule, setSchedule] = useState<Record<Weekday, DaySchedule>>(DEFAULT_SCHEDULE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const loadUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/users'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const list = (data.users || []) as TeamUser[]
      setUsers(
        list
          .filter(u => u?.id != null)
          .slice()
          .sort((a, b) =>
            `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
          ),
      )
    } catch {
      /* keep empty */
    }
  }, [])

  const loadSchedule = useCallback(async (nextScope: string) => {
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      if (nextScope === COMPANY_SCOPE) {
        const res = await fetch(apiUrl('/company-defaults/work-hours'), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Failed to load defaults')
        const d = await res.json()
        setSchedule(rowToSchedule(d.defaults || {}))
      } else {
        const res = await fetch(apiUrl(`/work-hours/${nextScope}`), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Failed to load employee hours')
        const d = await res.json()
        setSchedule(rowToSchedule(d.workHours || {}))
      }
    } catch {
      setError(t('app.teamMember.errNetwork', 'Network error'))
      setSchedule(DEFAULT_SCHEDULE)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    void loadSchedule(scope)
  }, [scope, loadSchedule])

  const setDay = (key: Weekday, patch: Partial<DaySchedule>) => {
    setSchedule(prev => {
      const cur = prev[key]
      const next = { ...cur, ...patch }
      if (patch.off === true) {
        next.hours = 0
      } else if (patch.off === false && (next.hours == null || next.hours <= 0)) {
        next.hours = key === 'friday' ? 7 : 7.5
        if (!next.start) next.start = '08:00'
      }
      if (typeof patch.hours === 'number') {
        next.off = patch.hours <= 0
      }
      return { ...prev, [key]: next }
    })
  }

  const copyMondayToWeekdays = () => {
    setSchedule(prev => {
      const mon = prev.monday
      const next = { ...prev }
      for (const key of ['tuesday', 'wednesday', 'thursday', 'friday'] as Weekday[]) {
        next[key] = {
          ...mon,
          // Keep Friday at 7h if Monday is a standard weekday — only copy start/off unless Mon is custom
          hours: key === 'friday' && !mon.off && mon.hours === 7.5 ? 7 : mon.hours,
          off: mon.off,
          start: mon.start,
        }
      }
      return next
    })
  }

  const resetToStandard = () => {
    setSchedule({ ...DEFAULT_SCHEDULE })
  }

  const totalWeek = useMemo(() => {
    let total = 0
    for (const { key } of WEEKDAYS) {
      const d = schedule[key]
      if (d.off) continue
      total += Math.max(0, d.hours || 0)
    }
    return total
  }, [schedule])

  const selectedLabel = useMemo(() => {
    if (scope === COMPANY_SCOPE) {
      return t('settings.workHours.companyDefault', 'Company default')
    }
    const u = users.find(x => String(x.id) === String(scope))
    return u ? `${u.first_name} ${u.last_name}`.trim() : t('settings.workHours.employee', 'Employee')
  }, [scope, users, t])

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const token = localStorage.getItem('token')
      const payload = scheduleToPayload(schedule)
      const url = scope === COMPANY_SCOPE
        ? apiUrl('/company-defaults/work-hours')
        : apiUrl(`/work-hours/${scope}`)
      const res = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || t('app.teamMember.errSave', 'Failed to save'))
      } else {
        invalidateMapCaches()
        if (scope !== COMPANY_SCOPE) {
          invalidateWorkHoursCache(Number(scope))
        } else {
          for (const u of users) invalidateWorkHoursCache(u.id)
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch {
      setError(t('app.teamMember.errNetwork', 'Network error'))
    } finally {
      setSaving(false)
    }
  }

  const timeInput =
    'text-sm border border-gray-200 rounded-md px-2 py-1 focus:border-gray-400 outline-none'

  return (
    <div className="px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <SettingsHeader
          title={t('settings.workHours.title', 'Work hours')}
          description={t(
            'settings.workHours.subtitle',
            'Set the company default (37h week starting at 08:00), or pick an employee to customize their start time and daily hours. Capacity on the map and jobs calendar always follows these hours.',
          )}
        />

        <SettingsSection title={t('settings.workHours.whoTitle', 'Who')}>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('settings.workHours.editFor', 'Edit schedule for')}
          </label>
          <select
            value={scope}
            onChange={e => setScope(e.target.value)}
            className="w-full max-w-md rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
          >
            <option value={COMPANY_SCOPE}>
              {t('settings.workHours.companyDefault', 'Company default')}
            </option>
            {users.map(u => (
              <option key={u.id} value={String(u.id)}>
                {`${u.first_name} ${u.last_name}`.trim() || `User #${u.id}`}
              </option>
            ))}
          </select>
          <SettingsHint>
            {scope === COMPANY_SCOPE
              ? t(
                  'settings.workHours.companyHint',
                  'New employees inherit this schedule until you customize theirs. Existing custom schedules are not overwritten.',
                )
              : t(
                  'settings.workHours.employeeHint',
                  'Editing {{name}}. Saving writes their personal schedule.',
                ).replace('{{name}}', selectedLabel)}
          </SettingsHint>
        </SettingsSection>

        <SettingsSection title={t('app.workHours.title', 'Weekly schedule')}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  {t(
                    'settings.workHours.modelHint',
                    'Start time + work hours per day. Standard week is 37 hours (7.5 Mon–Thu, 7 Fri).',
                  )}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={resetToStandard}
                    className="text-[13px] font-medium text-gray-600 hover:text-gray-900"
                  >
                    {t('settings.workHours.resetStandard', 'Reset to 37h standard')}
                  </button>
                  <button
                    type="button"
                    onClick={copyMondayToWeekdays}
                    className="text-[13px] font-medium text-accent-700 hover:text-accent-800"
                  >
                    {t('app.workHours.copyMonday', 'Copy Monday to weekdays')}
                  </button>
                </div>
              </div>

              <div>
                {WEEKDAYS.map(({ key, labelKey, fallback }) => {
                  const d = schedule[key]
                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-center gap-2 border-b border-gray-100 py-2.5 last:border-b-0"
                    >
                      <span className={`w-24 text-sm font-medium flex-shrink-0 ${d.off ? 'text-gray-400' : 'text-gray-800'}`}>
                        {t(labelKey, fallback)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDay(key, { off: !d.off })}
                        className={`text-[12px] font-medium px-2 py-0.5 rounded-md transition-colors ${
                          d.off
                            ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            : 'border border-accent-500/40 text-accent-700 hover:bg-accent-50/60'
                        }`}
                      >
                        {d.off ? t('app.workHours.dayOff', 'Off') : t('app.workHours.dayOn', 'Working')}
                      </button>

                      {!d.off && (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-gray-400">{t('app.workHours.start', 'Start')}</span>
                            <input
                              type="time"
                              value={d.start}
                              onChange={e => setDay(key, { start: e.target.value })}
                              className={timeInput}
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-gray-400">{t('app.workHours.hours', 'Hours')}</span>
                            <input
                              type="number"
                              min={0}
                              max={24}
                              step={0.5}
                              value={d.hours}
                              onChange={e => {
                                const n = Math.max(0, Math.min(24, parseFloat(e.target.value) || 0))
                                setDay(key, { hours: n })
                              }}
                              className={`w-20 text-right ${timeInput}`}
                            />
                            <span className="text-[11px] text-gray-400">h</span>
                          </div>
                        </>
                      )}

                      <span className="ml-auto text-[12px] font-medium text-gray-500 tabular-nums">
                        {d.off ? '—' : `${Number(d.hours).toFixed(1)} h`}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-gray-400">
                  {t('app.workHours.total', 'Weekly total:')}{' '}
                  <span className="font-semibold text-gray-600">{totalWeek.toFixed(1)} h</span>
                  {Math.abs(totalWeek - 37) < 0.05 && (
                    <span className="ml-2 text-accent-700">{t('settings.workHours.standardWeek', '· standard week')}</span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  {saved && <span className="text-sm text-gray-500">{t('app.teamMember.saved', 'Saved')}</span>}
                  <SettingsButton type="button" variant="primary" onClick={save} disabled={saving}>
                    {saving ? t('app.common.saving', 'Saving...') : t('settings.business.save', 'Save changes')}
                  </SettingsButton>
                </div>
              </div>
            </>
          )}
        </SettingsSection>
      </div>
    </div>
  )
}
