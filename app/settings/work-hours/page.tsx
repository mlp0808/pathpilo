'use client'

// Company-level default work schedule. New employees inherit these values on
// first save of their own work-hours row. Existing employees are unaffected.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiUrl } from '../../utils/api'
import { useAppI18n } from '../../components/I18nProvider'
import { SettingsHeader, SettingsSection, SettingsButton, SettingsHint } from '../../components/settings/SettingsUI'

type WorkHoursMode = 'fixed' | 'flexible'
type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

interface DaySchedule {
  start: string
  end: string
  breakMinutes: number
  hours: number
  off: boolean
}

const WEEKDAYS: Array<{ key: Weekday; labelKey: string }> = [
  { key: 'monday',    labelKey: 'app.day.monday' },
  { key: 'tuesday',   labelKey: 'app.day.tuesday' },
  { key: 'wednesday', labelKey: 'app.day.wednesday' },
  { key: 'thursday',  labelKey: 'app.day.thursday' },
  { key: 'friday',    labelKey: 'app.day.friday' },
  { key: 'saturday',  labelKey: 'app.day.saturday' },
  { key: 'sunday',    labelKey: 'app.day.sunday' },
]

const DEFAULT_SCHEDULE: Record<Weekday, DaySchedule> = {
  monday:    { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  tuesday:   { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  wednesday: { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  thursday:  { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  friday:    { start: '08:00', end: '15:30', breakMinutes: 30, hours: 7.0, off: false },
  saturday:  { start: '08:00', end: '16:00', breakMinutes: 0,  hours: 0,   off: true  },
  sunday:    { start: '08:00', end: '16:00', breakMinutes: 0,  hours: 0,   off: true  },
}

function computeNetHours(start: string, end: string, breakMinutes: number): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map((x) => parseInt(x, 10))
  const [eh, em] = end.split(':').map((x) => parseInt(x, 10))
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return 0
  const mins = (eh * 60 + em) - (sh * 60 + sm) - (breakMinutes || 0)
  return Math.max(0, mins / 60)
}

export default function CompanyWorkHoursSettingsPage() {
  const { t } = useAppI18n()

  const [mode, setMode] = useState<WorkHoursMode>('fixed')
  const [schedule, setSchedule] = useState<Record<Weekday, DaySchedule>>(DEFAULT_SCHEDULE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [dailyCapacityEnabled, setDailyCapacityEnabled] = useState(false)
  const [capacitySaving, setCapacitySaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const [whRes, profileRes] = await Promise.all([
        fetch(apiUrl('/company-defaults/work-hours'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl('/companies/profile'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      if (profileRes.ok) {
        const profile = await profileRes.json()
        setDailyCapacityEnabled(profile.company?.dailyCapacityEnabled === true)
      }
      if (whRes.ok) {
        const d = await whRes.json()
        const row = d.defaults || {}
        setMode(row.work_hours_mode === 'flexible' ? 'flexible' : 'fixed')
        const next: Record<Weekday, DaySchedule> = { ...DEFAULT_SCHEDULE }
        for (const { key } of WEEKDAYS) {
          const rawHours = row[`${key}_hours`]
          const hours = rawHours != null && rawHours !== '' ? parseFloat(String(rawHours)) : DEFAULT_SCHEDULE[key].hours
          const start = (row[`${key}_start`] || DEFAULT_SCHEDULE[key].start || '').slice(0, 5)
          const end   = (row[`${key}_end`]   || DEFAULT_SCHEDULE[key].end   || '').slice(0, 5)
          const brk   = row[`${key}_break_minutes`] != null ? Number(row[`${key}_break_minutes`]) : DEFAULT_SCHEDULE[key].breakMinutes
          next[key] = {
            start: start || '08:00',
            end: end || '16:00',
            breakMinutes: Number.isFinite(brk) ? brk : 0,
            hours: Number.isFinite(hours) ? hours : 0,
            off: (row.work_hours_mode === 'flexible' ? !hours : computeNetHours(start || '08:00', end || '16:00', brk || 0) === 0),
          }
        }
        setSchedule(next)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setDay = (key: Weekday, patch: Partial<DaySchedule>) => {
    setSchedule((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

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

  const totalWeek = useMemo(() => {
    let total = 0
    for (const { key } of WEEKDAYS) {
      const d = schedule[key]
      if (d.off) continue
      total += mode === 'fixed' ? computeNetHours(d.start, d.end, d.breakMinutes) : d.hours
    }
    return total
  }, [schedule, mode])

  const saveDailyCapacity = async (enabled: boolean) => {
    setCapacitySaving(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/companies/profile'), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyCapacityEnabled: enabled }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Failed to save capacity setting')
        return
      }
      setDailyCapacityEnabled(enabled)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setCapacitySaving(false)
    }
  }

  const save = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      const token = localStorage.getItem('token')
      const payload: Record<string, unknown> = { work_hours_mode: mode }
      for (const { key } of WEEKDAYS) {
        const d = schedule[key]
        if (mode === 'fixed') {
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
      const res = await fetch(apiUrl('/company-defaults/work-hours'), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || t('app.teamMember.errSave', 'Failed to save'))
      } else {
        setSaved(true); setTimeout(() => setSaved(false), 2500)
      }
    } catch {
      setError(t('app.teamMember.errNetwork', 'Network error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  const timeInput =
    'text-sm border border-gray-200 rounded-md px-2 py-1 focus:border-gray-400 outline-none'

  return (
    <div className="px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <SettingsHeader
          title={t('settings.workHours.title', 'Default work hours')}
          description={t('settings.workHours.subtitle', 'These hours are applied to new employees when they join. Existing employees keep their own schedule.')}
        />

        <SettingsSection title="Jobs calendar">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Daily capacity bars</p>
              <p className="text-xs text-gray-500 mt-1 max-w-md">
                When off, weekends and days without scheduled hours stay open on the jobs calendar.
                The bar shows work time (green) vs drive time (blue) instead of hours available.
              </p>
            </div>
            <button
              type="button"
              disabled={capacitySaving}
              onClick={() => void saveDailyCapacity(!dailyCapacityEnabled)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
                dailyCapacityEnabled ? 'bg-accent-500' : 'bg-gray-200'
              } ${capacitySaving ? 'opacity-60' : ''}`}
              aria-pressed={dailyCapacityEnabled}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  dailyCapacityEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </SettingsSection>

        <SettingsSection title={t('app.workHours.title', 'Work hours')}>
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setMode('fixed')}
                className={`px-3 py-1 text-[13px] font-medium rounded-md transition-all ${
                  mode === 'fixed' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('app.workHours.modeFixed', 'Fixed hours')}
              </button>
              <button
                type="button"
                onClick={() => setMode('flexible')}
                className={`px-3 py-1 text-[13px] font-medium rounded-md transition-all ${
                  mode === 'flexible' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('app.workHours.modeFlexible', 'Flexible hours')}
              </button>
            </div>
            <button
              type="button"
              onClick={copyMondayToWeekdays}
              className="text-[13px] font-medium text-accent-700 hover:text-accent-800"
            >
              {t('app.workHours.copyMonday', 'Copy Monday to weekdays')}
            </button>
          </div>

          <SettingsHint>
            {mode === 'fixed'
              ? t('app.workHours.fixedHint', 'Fixed schedule: employee starts and ends at the same time each weekday. Good for route planning.')
              : t('app.workHours.flexibleHint', 'Flexible schedule: employee has a daily hour budget without fixed clock times. Good for contractors.')}
          </SettingsHint>

          <div className="mt-4">
            {WEEKDAYS.map(({ key, labelKey }) => {
              const d = schedule[key]
              const netH = mode === 'fixed' ? computeNetHours(d.start, d.end, d.breakMinutes) : d.hours
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-2 border-b border-gray-100 py-2.5 last:border-b-0"
                >
                  <span className={`w-24 text-sm font-medium flex-shrink-0 ${d.off ? 'text-gray-400' : 'text-gray-800'}`}>
                    {t(labelKey, key)}
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

                  {!d.off && mode === 'fixed' && (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-gray-400">{t('app.workHours.start', 'Start')}</span>
                        <input
                          type="time"
                          value={d.start}
                          onChange={(e) => setDay(key, { start: e.target.value })}
                          className={timeInput}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-gray-400">{t('app.workHours.end', 'End')}</span>
                        <input
                          type="time"
                          value={d.end}
                          onChange={(e) => setDay(key, { end: e.target.value })}
                          className={timeInput}
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
                          className={`w-16 text-right ${timeInput}`}
                        />
                        <span className="text-[11px] text-gray-400">{t('app.workHours.minShort', 'min')}</span>
                      </div>
                    </>
                  )}

                  {!d.off && mode === 'flexible' && (
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
                        className={`w-20 text-right ${timeInput}`}
                      />
                      <span className="text-[11px] text-gray-400">h</span>
                    </div>
                  )}

                  <span className="ml-auto text-[12px] font-medium text-gray-500 tabular-nums">
                    {d.off ? '—' : `${netH.toFixed(1)} h`}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {t('app.workHours.total', 'Weekly total:')}{' '}
              <span className="font-semibold text-gray-600">{totalWeek.toFixed(1)} h</span>
            </p>
            <div className="flex items-center gap-3">
              {error && <p className="text-sm text-red-600">{error}</p>}
              {saved && <span className="text-sm text-gray-500">{t('app.teamMember.saved', 'Saved')}</span>}
              <SettingsButton type="button" variant="primary" onClick={save} disabled={saving}>
                {saving ? t('app.common.saving', 'Saving...') : t('settings.business.save', 'Save changes')}
              </SettingsButton>
            </div>
          </div>
        </SettingsSection>
      </div>
    </div>
  )
}
