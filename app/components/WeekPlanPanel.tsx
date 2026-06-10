'use client'

import { useCallback, useMemo, useState } from 'react'
import { apiUrl } from '@/app/utils/api'
import { useAppI18n } from '@/app/components/I18nProvider'

export type WeekPlanProposal = {
  jobId: number
  from: { date: string; userId: number }
  to: { date: string; userId: number }
  reason?: string
}

type WeekPlanResult = {
  ok: boolean
  proposals: WeekPlanProposal[]
  summary?: { proposalCount: number; flexibleJobCount: number; totalJobs: number }
  dayPreviews?: { date: string; userId: number; totalDriveMinutes: number; jobCount: number }[]
  error?: string
}

type UserOption = { id: number; first_name: string; last_name: string }

export default function WeekPlanPanel({
  open,
  onClose,
  startDate,
  endDate,
  users,
  selectedUserId,
  onApplied,
}: {
  open: boolean
  onClose: () => void
  startDate: string
  endDate: string
  users: UserOption[]
  selectedUserId: number | 'all'
  onApplied?: () => void
}) {
  const { t } = useAppI18n()
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<WeekPlanResult | null>(null)
  const [accepted, setAccepted] = useState<Record<number, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const userLabel = useCallback(
    (uid: number) => {
      const u = users.find(x => x.id === uid)
      return u ? `${u.first_name} ${u.last_name}`.trim() : `#${uid}`
    },
    [users],
  )

  const fetchPlan = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const token = localStorage.getItem('token')
      const body: Record<string, unknown> = { start_date: startDate, end_date: endDate }
      if (selectedUserId !== 'all') body.user_ids = [selectedUserId]
      const res = await fetch(apiUrl('/route-planner/optimize-week'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as WeekPlanResult
      if (!res.ok || !data.ok) {
        setError(data.error || t('app.weekPlanner.loadFailed', 'Could not generate week plan'))
        return
      }
      setResult(data)
      const next: Record<number, boolean> = {}
      for (const p of data.proposals || []) next[p.jobId] = true
      setAccepted(next)
    } catch {
      setError(t('app.weekPlanner.loadFailed', 'Could not generate week plan'))
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, selectedUserId, t])

  const acceptedProposals = useMemo(
    () => (result?.proposals || []).filter(p => accepted[p.jobId]),
    [result, accepted],
  )

  const applyPlan = useCallback(async () => {
    if (acceptedProposals.length === 0) return
    setApplying(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/route-planner/apply-week'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proposals: acceptedProposals }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || t('app.weekPlanner.applyFailed', 'Could not apply changes'))
        return
      }
      onApplied?.()
      onClose()
    } catch {
      setError(t('app.weekPlanner.applyFailed', 'Could not apply changes'))
    } finally {
      setApplying(false)
    }
  }, [acceptedProposals, onApplied, onClose, t])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {t('app.weekPlanner.title', 'Plan week')}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {startDate} — {endDate}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label={t('app.common.close', 'Close')}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {!result && !loading && (
            <p className="text-sm text-gray-600">
              {t(
                'app.weekPlanner.intro',
                'We suggest moving flexible jobs to balance workload and reduce driving. Review each change before applying.',
              )}
            </p>
          )}

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent-500 border-t-transparent" />
            </div>
          )}

          {result && !loading && (
            <>
              <p className="text-sm text-gray-600">
                {t('app.weekPlanner.summary', '{{count}} suggested moves · {{flex}} flexible jobs')
                  .replace('{{count}}', String(result.summary?.proposalCount ?? 0))
                  .replace('{{flex}}', String(result.summary?.flexibleJobCount ?? 0))}
              </p>

              {result.proposals.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  {t('app.weekPlanner.noChanges', 'No changes suggested — your week looks good.')}
                </p>
              ) : (
                <ul className="space-y-2">
                  {result.proposals.map(p => (
                    <li
                      key={p.jobId}
                      className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/80"
                    >
                      <input
                        type="checkbox"
                        checked={!!accepted[p.jobId]}
                        onChange={e => setAccepted(prev => ({ ...prev, [p.jobId]: e.target.checked }))}
                        className="mt-1 rounded border-gray-300 text-accent-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          {t('app.weekPlanner.jobMove', 'Job #{{id}}').replace('{{id}}', String(p.jobId))}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {p.from.date} · {userLabel(p.from.userId)}
                          {' → '}
                          {p.to.date} · {userLabel(p.to.userId)}
                        </p>
                        {p.reason && <p className="text-[11px] text-gray-400 mt-1">{p.reason}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
          {!result ? (
            <button
              type="button"
              onClick={fetchPlan}
              disabled={loading}
              className="flex-1 h-11 rounded-xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 disabled:opacity-50"
            >
              {t('app.weekPlanner.generate', 'Generate plan')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={fetchPlan}
                disabled={loading || applying}
                className="h-11 px-4 rounded-xl bg-gray-100 text-gray-800 text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
              >
                {t('app.weekPlanner.regenerate', 'Regenerate')}
              </button>
              <button
                type="button"
                onClick={applyPlan}
                disabled={applying || acceptedProposals.length === 0}
                className="flex-1 h-11 rounded-xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 disabled:opacity-50"
              >
                {applying
                  ? t('app.weekPlanner.applying', 'Applying…')
                  : t('app.weekPlanner.apply', 'Apply {{n}} changes').replace(
                      '{{n}}',
                      String(acceptedProposals.length),
                    )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
