'use client'

// Company-level default work schedule. New employees inherit these values on
// first save of their own work-hours row. Existing employees are unaffected.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ClockIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import { useAppI18n } from '../../components/I18nProvider'

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/company-defaults/work-hours'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const d = await res.json()
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          {t('settings.workHours.title', 'Default work hours')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('settings.workHours.subtitle', 'These hours are applied to new employees when they join. Existing employees keep their own schedule.')}
        </p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-accent-50 rounded-lg flex items-center justify-center">
              <ClockIcon className="w-4 h-4 text-accent-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {t('app.workHours.title', 'Work hours')}
              </p>
              <p className="text-[11px] text-gray-400">
                {t('settings.workHours.cardSubtitle', 'Company-wide default schedule')}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
            <div className="inline-flex bg-gray-100 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setMode('fixed')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'fixed' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('app.workHours.modeFixed', 'Fixed hours')}
              </button>
              <button
                type="button"
                onClick={() => setMode('flexible')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'flexible' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('app.workHours.modeFlexible', 'Flexible hours')}
              </button>
            </div>
            <button
              type="button"
              onClick={copyMondayToWeekdays}
              className="text-xs font-medium text-accent-600 hover:text-accent-700 hover:bg-accent-50 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {t('app.workHours.copyMonday', 'Copy Monday to weekdays')}
            </button>
          </div>

          <div className="mb-4 text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
            {mode === 'fixed'
              ? t('app.workHours.fixedHint', 'Fixed schedule: employee starts and ends at the same time each weekday. Good for route planning.')
              : t('app.workHours.flexibleHint', 'Flexible schedule: employee has a daily hour budget without fixed clock times. Good for contractors.')}
          </div>

          <div className="space-y-2">
            {WEEKDAYS.map(({ key, labelKey }) => {
              const d = schedule[key]
              const netH = mode === 'fixed' ? computeNetHours(d.start, d.end, d.breakMinutes) : d.hours
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

                  {!d.off && mode === 'fixed' && (
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
                        className="w-20 text-sm text-right border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                      />
                      <span className="text-[11px] text-gray-400">h</span>
                    </div>
                  )}

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
              <span className="font-semibold text-gray-600">{totalWeek.toFixed(1)} h</span>
            </p>
            <div className="flex items-center gap-3">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                style={{
                  background: saved ? '#10b981' : '#3DD57A',
                  color: saved ? '#fff' : '#0A1A0A',
                  boxShadow: saved ? '0 0 16px rgba(16,185,129,0.25)' : '0 2px 12px rgba(61,213,122,0.2)',
                }}
              >
                {saving
                  ? t('app.common.saving', 'Saving...')
                  : saved
                    ? t('app.teamMember.saved', 'Saved')
                    : t('settings.business.save', 'Save changes')}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
