'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '@/app/utils/api'
import { GUIDES_REFRESH_EVENT, requestGuidesRefresh } from '@/app/config/guideEvents'

export interface GuideStep {
  id: number
  guideId: number
  sortOrder: number
  title: string
  body: string
  mediaType: 'none' | 'image' | 'video'
  mediaUrl: string | null
  ctaLabel: string | null
  ctaHref: string | null
  doneTrigger: string | null
}

export interface Guide {
  id: number
  slug: string
  title: string
  description: string
  icon: string
  steps: GuideStep[]
}

interface Progress {
  activeGuideId: number | null
  doneStepIds: number[]
  seenStepIds: number[]
  bannerMinimized: boolean
  bannerDismissed: boolean
}

interface GuidesPayload {
  guides: Guide[]
  progress: Progress
  counts: Record<string, number>
  visits: Record<string, boolean>
  events: Record<string, boolean>
}

export interface CompletionState {
  counts: Record<string, number>
  visits: Record<string, boolean>
  events: Record<string, boolean>
  doneStepIds: Set<number>
  seenStepIds: Set<number>
}

const EMPTY_PROGRESS: Progress = {
  activeGuideId: null,
  doneStepIds: [],
  seenStepIds: [],
  bannerMinimized: false,
  bannerDismissed: false,
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${(typeof window !== 'undefined' && localStorage.getItem('token')) || ''}`,
  }
}

/**
 * A step is done when the user did the thing its trigger watches for
 * (`event:job.created`, `clients>=1`, `visit:map`). Steps without a trigger
 * only explain something, so having read them is enough. Ticks stored by the
 * old manual button still count.
 */
export function isStepDone(step: GuideStep, state: CompletionState): boolean {
  if (state.doneStepIds.has(step.id)) return true
  const trigger = step.doneTrigger
  if (!trigger) return state.seenStepIds.has(step.id)
  if (trigger.startsWith('event:')) return state.events[trigger.slice(6)] === true
  if (trigger.startsWith('visit:')) return state.visits[trigger.slice(6)] === true
  const [key, target] = trigger.split('>=')
  return (state.counts[key] || 0) >= (Number(target) || 1)
}

export interface GuideWithProgress extends Guide {
  doneCount: number
  total: number
  complete: boolean
  nextStepIndex: number
}

/**
 * Saving anything anywhere may complete a step, so re-check shortly after any
 * successful write. The delay lets the server's activity buffer flush.
 */
let writeObserverInstalled = false
function observeWrites() {
  if (writeObserverInstalled || typeof window === 'undefined') return
  writeObserverInstalled = true
  const original = window.fetch.bind(window)
  let timer: number | undefined
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init)
    try {
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (
        response.ok &&
        method !== 'GET' &&
        url.includes('/api/') &&
        !/\/api\/(guides|events|insights)(\/|\?|$)/.test(url)
      ) {
        window.clearTimeout(timer)
        timer = window.setTimeout(requestGuidesRefresh, 2500)
      }
    } catch {
      /* observing must never affect the request */
    }
    return response
  }
}

export function useGuides() {
  const [data, setData] = useState<GuidesPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const inFlight = useRef(false)
  const seenSent = useRef(new Set<number>())

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const res = await fetch(apiUrl('/guides'), { headers: authHeaders() })
      if (!res.ok) throw new Error('failed')
      const payload = (await res.json()) as GuidesPayload
      const progress = { ...EMPTY_PROGRESS, ...(payload.progress || {}) }
      progress.seenStepIds.forEach((id) => seenSent.current.add(id))
      setData({
        guides: Array.isArray(payload.guides) ? payload.guides : [],
        progress,
        counts: payload.counts || {},
        visits: payload.visits || {},
        events: payload.events || {},
      })
    } catch {
      // Guides are a nicety — a failure must never block the page.
      setData((prev) => prev ?? { guides: [], progress: EMPTY_PROGRESS, counts: {}, visits: {}, events: {} })
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    observeWrites()
    load()
    const refresh = () => load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener(GUIDES_REFRESH_EVENT, refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(GUIDES_REFRESH_EVENT, refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const state: CompletionState = useMemo(
    () => ({
      counts: data?.counts || {},
      visits: data?.visits || {},
      events: data?.events || {},
      doneStepIds: new Set(data?.progress.doneStepIds || []),
      seenStepIds: new Set(data?.progress.seenStepIds || []),
    }),
    [data]
  )

  const guides: GuideWithProgress[] = useMemo(() => {
    if (!data) return []
    return data.guides.map((guide) => {
      const doneFlags = guide.steps.map((s) => isStepDone(s, state))
      const doneCount = doneFlags.filter(Boolean).length
      const firstOpen = doneFlags.findIndex((d) => !d)
      return {
        ...guide,
        doneCount,
        total: guide.steps.length,
        complete: guide.steps.length > 0 && doneCount === guide.steps.length,
        nextStepIndex: firstOpen === -1 ? Math.max(0, guide.steps.length - 1) : firstOpen,
      }
    })
  }, [data, state])

  /** The guide the banner points at: the user's pick, else the first unfinished one. */
  const activeGuide = useMemo(() => {
    if (guides.length === 0) return null
    const picked = guides.find((g) => g.id === data?.progress.activeGuideId)
    if (picked) return picked
    return guides.find((g) => !g.complete && g.total > 0) || guides[0]
  }, [guides, data?.progress.activeGuideId])

  /** Optimistic local patch + server write, so the banner never feels laggy. */
  const patchProgress = useCallback(async (patch: Partial<Progress>) => {
    setData((prev) => (prev ? { ...prev, progress: { ...prev.progress, ...patch } } : prev))
    try {
      await fetch(apiUrl('/guides/progress'), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(patch),
      })
    } catch {
      /* local state already reflects the intent; next load reconciles */
    }
  }, [])

  /** Opening a step marks it read — which completes steps that only explain. */
  const markSeen = useCallback(async (stepId: number) => {
    if (!stepId || seenSent.current.has(stepId)) return
    seenSent.current.add(stepId)
    setData((prev) => {
      if (!prev || prev.progress.seenStepIds.includes(stepId)) return prev
      return { ...prev, progress: { ...prev.progress, seenStepIds: [...prev.progress.seenStepIds, stepId] } }
    })
    try {
      await fetch(apiUrl(`/guides/steps/${stepId}/seen`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({}),
      })
    } catch {
      /* ignore */
    }
  }, [])

  const completedGuides = guides.filter((g) => g.complete).length

  return {
    loading,
    guides,
    activeGuide,
    completedGuides,
    progress: data?.progress || EMPTY_PROGRESS,
    state,
    reload: load,
    patchProgress,
    markSeen,
    setActiveGuide: (id: number | null) => patchProgress({ activeGuideId: id }),
  }
}
