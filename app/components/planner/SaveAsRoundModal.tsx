'use client'

/**
 * "Save as Round" — turn a planned day route into a package.
 *
 * Two flavours, same modal:
 *  - This day only: the route stays a one-off planned package; we just give it
 *    a name (status stays/becomes 'planned').
 *  - Repeat: creates a `round_templates` row + ordered stop snapshots.
 *    Recurring library rounds create round-owned subscriptions per stop
 *    (hidden from the Subscriptions list).
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiUrl } from '@/app/utils/api'
import { useAppI18n } from '@/app/components/I18nProvider'
import type { RouteJob, UserRoute } from '@/app/components/RouteMap'

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function SaveAsRoundModal({
  isOpen,
  onClose,
  route,
  date,
  /** Parent should run its normal Save & apply first so job order + totals are persisted. */
  onEnsureSaved,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  route: UserRoute
  date: string
  onEnsureSaved?: () => Promise<void>
  onSaved?: () => void
}) {
  const { t } = useAppI18n() as unknown as { t: (key: string, fallback: string) => string }

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [repeat, setRepeat] = useState(true)
  const [intervalWeeks, setIntervalWeeks] = useState(1)
  const [saveToLibrary, setSaveToLibrary] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekday = useMemo(() => new Date(`${date}T12:00:00`).getDay(), [date])

  // Real, orderable stops: skip home anchors, cancelled and projected ghosts.
  const stops = useMemo(
    () => route.jobs.filter(
      (j: RouteJob) => !j.is_home && !j.is_cancelled && !j.is_projected && Number.isInteger(Number(j.id)),
    ),
    [route.jobs],
  )

  useEffect(() => {
    if (isOpen) {
      setName('')
      setDescription('')
      setRepeat(true)
      setIntervalWeeks(1)
      setSaveToLibrary(true)
      setError(null)
    }
  }, [isOpen])

  if (!isOpen || typeof document === 'undefined') return null

  const confirm = async () => {
    if ((repeat || saveToLibrary) && name.trim() === '') {
      setError(t('app.rounds.nameRequired', 'Give the round a name so you can find it later.'))
      return
    }
    if (stops.length === 0) {
      setError(t('app.rounds.noStops', 'This route has no savable stops yet.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onEnsureSaved?.()

      if (repeat) {
        const res = await fetch(apiUrl('/round-templates'), {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            date,
            assigned_user_id: route.userId,
            interval_value: intervalWeeks,
            day_of_week: weekday,
            stops: stops.map(j => ({ job_id: Number(j.id) })),
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || t('app.rounds.createFailed', 'Could not create the round.'))
        }
      } else {
        const res = await fetch(apiUrl('/daily-routes/meta'), {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({
            user_id: route.userId,
            scheduled_date: date,
            status: 'planned',
            ...(name.trim() !== '' ? { name: name.trim() } : {}),
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || t('app.rounds.createFailed', 'Could not save the planned day.'))
        }
      }

      // Optional: snapshot into the Rounds library (package). Day jobs stay as-is.
      if (saveToLibrary) {
        const libRes = await fetch(apiUrl('/rounds/from-day'), {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            user_id: route.userId,
            date,
            name: name.trim() || null,
          }),
        })
        if (!libRes.ok) {
          const body = await libRes.json().catch(() => null)
          throw new Error(body?.error || t('app.rounds.createFailed', 'Could not save to the rounds library.'))
        }
        const libData = await libRes.json().catch(() => ({}))
        const libId = libData?.round?.id
        if (libId != null && repeat) {
          await fetch(apiUrl(`/rounds/${libId}`), {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({
              schedule_kind: 'recurring',
              day_of_week: weekday,
              interval_value: intervalWeeks,
              assigned_user_id: route.userId,
              in_library: true,
            }),
          })
        }
      }

      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('app.rounds.createFailed', 'Could not create the round.'))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => !busy && onClose()} aria-hidden />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {t('app.rounds.saveAsRound', 'Save as round')}
            </h2>
            <p className="text-[12.5px] text-gray-500 mt-0.5">
              {t('app.rounds.saveAsRoundSub', 'Plan this day, and optionally keep a reusable copy in Rounds.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={t('app.common.close', 'Close')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* This day only ↔ Repeat */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-gray-100 mb-4">
          <button
            type="button"
            onClick={() => {
              setRepeat(false)
              setSaveToLibrary(false)
            }}
            className={`rounded-xl py-2 text-[13px] font-semibold transition-all ${
              !repeat ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('app.rounds.thisDayOnly', 'This day only')}
          </button>
          <button
            type="button"
            onClick={() => {
              setRepeat(true)
              setSaveToLibrary(true)
            }}
            className={`rounded-xl py-2 text-[13px] font-semibold transition-all ${
              repeat ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('app.rounds.repeat', 'Repeat')}
          </button>
        </div>

        <label className="block text-[12px] font-semibold text-gray-700 mb-1">
          {t('app.rounds.roundName', 'Round name')}
          {!repeat && !saveToLibrary && (
            <span className="text-gray-400 font-normal"> · {t('app.rounds.optional', 'optional')}</span>
          )}
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('app.rounds.namePlaceholder', 'e.g. North side Tuesdays')}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 mb-3 focus:outline-none focus:ring-2 focus:ring-accent-400"
        />

        {repeat && (
          <>
            <label className="block text-[12px] font-semibold text-gray-700 mb-1">
              {t('app.rounds.description', 'Description')}
              <span className="text-gray-400 font-normal"> · {t('app.rounds.optional', 'optional')}</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder={t('app.rounds.descriptionPlaceholder', 'Notes for the rounds page')}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 mb-3 focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none"
            />

            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
              {t('app.rounds.cadence', 'Repeats')}
            </label>
            <div className="flex items-center gap-1.5 mb-4 flex-wrap">
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setIntervalWeeks(n)}
                  className={`rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-all border ${
                    intervalWeeks === n
                      ? 'bg-accent-500 border-accent-500 text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {n === 1
                    ? t('app.rounds.everyWeek', 'Every week')
                    : t('app.rounds.everyNWeeks', 'Every {{n}} weeks').replace('{{n}}', String(n))}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-gray-500 -mt-2 mb-4">
              {t('app.rounds.cadenceOn', 'On')}{' '}
              <span className="font-semibold text-gray-700">
                {t(`app.weekday.${weekday}`, WEEKDAY_LABELS[weekday])}
              </span>
              {' · '}
              <span className="font-semibold text-gray-700">{route.userName}</span>
            </p>
          </>
        )}

        <label className="flex items-start gap-2.5 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={saveToLibrary}
            onChange={e => setSaveToLibrary(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent-500 focus:ring-accent-400"
          />
          <span>
            <span className="block text-[13px] font-semibold text-gray-800">
              {t('app.rounds.saveToLibrary', 'Save to Rounds library')}
            </span>
            <span className="block text-[11.5px] text-gray-500 mt-0.5">
              {t(
                'app.rounds.saveToLibraryHint',
                'Keeps a reusable package on the Rounds page. Editing this day later won’t change that package.',
              )}
            </span>
          </span>
        </label>

        {/* Stop preview */}
        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3 mb-4">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {t('app.rounds.stopsPreview', '{{n}} stops in order').replace('{{n}}', String(stops.length))}
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {stops.map((j, i) => (
              <div key={String(j.id)} className="flex items-center gap-2 min-w-0">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ background: route.color || '#193434' }}
                >
                  {i + 1}
                </span>
                <span className="text-[12.5px] text-gray-700 truncate">
                  {(j as any).client_name || j.title || (j as any).address || `#${j.id}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-[12px] text-red-600 mb-3">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {t('app.common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="rounded-xl bg-accent-500 hover:bg-accent-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
          >
            {busy
              ? t('app.rounds.saving', 'Saving…')
              : repeat
                ? t('app.rounds.createRound', 'Create round')
                : t('app.rounds.markPlanned', 'Mark as planned')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
