'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '@/app/utils/api'
import {
  GUIDES,
  MISSIONS_REFRESH_EVENT,
  isStepDone,
  type StepCounts,
  type StepVisits,
} from '@/app/config/missions'
import { useAppI18n } from '@/app/components/I18nProvider'
import type { MessageKey } from '@/app/i18n'

export type GuidesProgress = {
  dismissed: boolean
  skipped: string[]
  skippedMissions: string[]
  /** Raw from API: null = never set, '' = paused, else guide id */
  activeMissionId: string | null
  visits: StepVisits
  counts: StepCounts
}

export function useGuidesProgress() {
  const { t } = useAppI18n()
  const [progress, setProgress] = useState<GuidesProgress | null>(null)
  const [toast, setToast] = useState<{ id: number; title: string } | null>(null)
  const prevDoneStepsRef = useRef<Set<string> | null>(null)
  const toastIdRef = useRef(0)

  const pushToast = useCallback((title: string) => {
    toastIdRef.current += 1
    setToast({ id: toastIdRef.current, title })
  }, [])

  const applyProgress = useCallback(
    (data: GuidesProgress) => {
      const skipped = new Set(data.skipped)
      const newlyDone: string[] = []
      for (const step of GUIDES.flatMap((g) => g.steps)) {
        if (skipped.has(step.id)) continue
        if (!isStepDone(step, data.counts, data.visits)) continue
        if (prevDoneStepsRef.current && !prevDoneStepsRef.current.has(step.id)) {
          newlyDone.push(t(step.titleKey as MessageKey, step.title))
        }
      }
      const nextDone = new Set<string>()
      for (const step of GUIDES.flatMap((g) => g.steps)) {
        if (skipped.has(step.id) || isStepDone(step, data.counts, data.visits)) {
          nextDone.add(step.id)
        }
      }
      if (prevDoneStepsRef.current && newlyDone.length > 0) {
        pushToast(newlyDone[newlyDone.length - 1])
      }
      prevDoneStepsRef.current = nextDone
      setProgress(data)
    },
    [pushToast, t],
  )

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(apiUrl('/companies/getting-started'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      applyProgress({
        dismissed: data.dismissed === true,
        skipped: Array.isArray(data.skipped) ? data.skipped : [],
        skippedMissions: Array.isArray(data.skippedMissions) ? data.skippedMissions : [],
        activeMissionId: data.activeMissionId == null ? null : String(data.activeMissionId),
        visits: data.visits || {},
        counts: data.counts || {},
      })
    } catch {
      /* optional */
    }
  }, [applyProgress])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const refresh = () => void load()
    window.addEventListener(MISSIONS_REFRESH_EVENT, refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener(MISSIONS_REFRESH_EVENT, refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [load])

  const patch = useCallback(async (path: string, body: Record<string, unknown>) => {
    try {
      const token = localStorage.getItem('token')
      await fetch(apiUrl(`/companies/getting-started/${path}`), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      /* local state already moved */
    }
  }, [])

  const skippedSteps = useMemo(() => new Set(progress?.skipped || []), [progress])
  const skippedGuides = useMemo(() => new Set(progress?.skippedMissions || []), [progress])

  return {
    progress,
    setProgress,
    toast,
    setToast,
    load,
    patch,
    skippedSteps,
    skippedGuides,
  }
}
