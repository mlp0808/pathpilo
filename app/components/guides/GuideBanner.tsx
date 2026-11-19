'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { BookOpenIcon, ChevronUpDownIcon, ChevronUpIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { TrophyIcon } from '@heroicons/react/24/solid'
import { useGuides, isStepDone } from './useGuides'
import { GuidePicker, StepTrack, useJustCompleted, usePopover } from './GuideProgress'
import type { GuideStartAt } from './GuideViewer'
import { GUIDES_OPEN_EVENT } from '../../config/guideEvents'

const GuideViewer = dynamic(() => import('./GuideViewer'), { ssr: false })

/**
 * One slim row at the top of every page: where you are in the current guide,
 * the next thing worth doing, and a way in. It never covers content, and the
 * user can shrink it to a pill for good.
 */
export default function GuideBanner({
  companySlug,
  className = '',
  showChrome = true,
}: {
  companySlug: string
  className?: string
  /** When false, stay mounted for Get help / auto-open but hide the banner strip. */
  showChrome?: boolean
}) {
  const {
    loading,
    guides,
    activeGuide,
    completedGuides,
    progress,
    state,
    patchProgress,
    markSeen,
    setActiveGuide,
  } = useGuides()
  const [viewing, setViewing] = useState<{ guideId: number; startAt: GuideStartAt } | null>(null)
  const picker = usePopover()
  const open = viewing !== null

  const doneFlags = useMemo(
    () => (activeGuide ? activeGuide.steps.map((s) => isStepDone(s, state)) : []),
    [activeGuide, state]
  )
  const justDone = useJustCompleted(activeGuide?.id, doneFlags)

  // A guide that gets finished while the user is out doing the work pops the
  // guidebook open on its celebration page.
  const completeKey = guides.filter((g) => g.complete).map((g) => g.id).join(',')
  const knownComplete = useRef<Set<number> | null>(null)
  const setActiveRef = useRef(setActiveGuide)
  setActiveRef.current = setActiveGuide
  useEffect(() => {
    if (loading) return
    const now = new Set(completeKey ? completeKey.split(',').map(Number) : [])
    const before = knownComplete.current
    knownComplete.current = now
    if (!before) return
    const fresh = Array.from(now).find((id) => !before.has(id))
    if (fresh == null) return
    setActiveRef.current(fresh)
    setViewing((v) => v ?? { guideId: fresh, startAt: 'finale' })
  }, [loading, completeKey])

  useEffect(() => {
    const onOpen = () => {
      if (!activeGuide) return
      if (progress.bannerMinimized) patchProgress({ bannerMinimized: false })
      if (progress.bannerDismissed) patchProgress({ bannerDismissed: false })
      const started = activeGuide.doneCount > 0
      setViewing({
        guideId: activeGuide.id,
        startAt: started && !activeGuide.complete ? 'step' : 'cover',
      })
    }
    window.addEventListener(GUIDES_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(GUIDES_OPEN_EVENT, onOpen)
  }, [activeGuide, progress.bannerMinimized, progress.bannerDismissed, patchProgress])

  const allComplete = guides.every((g) => g.complete || g.total === 0)
  const nextStep = activeGuide?.steps[activeGuide.nextStepIndex]
  const started = (activeGuide?.doneCount || 0) > 0

  const openGuide = (id: number, startAt: GuideStartAt) => {
    if (activeGuide && id !== activeGuide.id) setActiveGuide(id)
    picker.setOpen(false)
    setViewing({ guideId: id, startAt })
  }

  const viewerGuide = viewing
    ? guides.find((g) => g.id === viewing.guideId) || activeGuide
    : null
  const viewer =
    viewing && viewerGuide ? (
      <GuideViewer
        guides={guides}
        guide={viewerGuide}
        companySlug={companySlug}
        state={state}
        completedGuides={completedGuides}
        startAt={viewing.startAt}
        onClose={() => setViewing(null)}
        onPickGuide={openGuide}
        onSeen={markSeen}
      />
    ) : null

  if (loading || !activeGuide || activeGuide.total === 0) return viewer

  const openActive = () => openGuide(activeGuide.id, started && !activeGuide.complete ? 'step' : 'cover')
  const hideChrome = !showChrome || (allComplete && progress.bannerDismissed && !open)

  if (hideChrome) return viewer

  if (progress.bannerMinimized) {
    return (
      <>
        <div className={`flex-none ${className}`}>
          <button
            type="button"
            onClick={() => patchProgress({ bannerMinimized: false })}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-sm transition-colors hover:border-accent-300 hover:text-accent-700"
          >
            <BookOpenIcon className="h-3.5 w-3.5" />
            Guide
            <span className="tabular-nums text-gray-400">
              {activeGuide.doneCount}/{activeGuide.total}
            </span>
            {activeGuide.complete && <TrophyIcon className="h-3 w-3 text-accent-500" />}
          </button>
        </div>
        {viewer}
      </>
    )
  }

  return (
    <>
      <div
        className={`relative flex-none rounded-2xl border border-gray-200/80 bg-white px-2.5 py-2.5 shadow-sm sm:px-3 ${className}`}
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div ref={picker.ref} className="relative shrink-0">
            <button
              type="button"
              onClick={() => picker.setOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={picker.open}
              aria-label="Switch guide"
              title="Switch guide"
              className={`group flex items-center gap-0.5 rounded-xl border py-1 pl-1 pr-1 transition-colors ${
                picker.open ? 'border-gray-300 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-50 text-base">
                {activeGuide.icon || '📘'}
              </span>
              <ChevronUpDownIcon className="h-4 w-4 text-gray-400 transition-colors group-hover:text-gray-700" />
            </button>
            {picker.open && (
              <GuidePicker
                className="absolute left-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-2rem))]"
                guides={guides}
                activeId={activeGuide.id}
                completed={completedGuides}
                onPick={(id) => openGuide(id, 'cover')}
              />
            )}
          </div>

          <button type="button" onClick={openActive} className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:text-[11px]">
              <span className="truncate">{activeGuide.title}</span>
              <span className="shrink-0 tabular-nums text-accent-600">
                {activeGuide.doneCount}/{activeGuide.total}
              </span>
            </span>
            <span className="block truncate text-[13px] font-semibold text-gray-900 sm:text-sm">
              {allComplete
                ? 'Every guide complete. Nicely done!'
                : activeGuide.complete
                  ? 'Guide complete 🎉'
                  : nextStep?.title}
            </span>
          </button>

          <button
            type="button"
            onClick={openActive}
            className="w-28 shrink-0 sm:w-40"
            aria-label="Open guide"
            title="Open guide"
          >
            <StepTrack
              done={doneFlags}
              current={activeGuide.nextStepIndex}
              complete={activeGuide.complete}
              justDone={justDone}
            />
          </button>

          {allComplete ? (
            <button
              type="button"
              onClick={() => patchProgress({ bannerDismissed: true })}
              className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-gray-50 hover:text-gray-600"
              aria-label="Hide guides"
              title="Hide"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => patchProgress({ bannerMinimized: true })}
              className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-gray-50 hover:text-gray-600"
              aria-label="Minimize guide"
              title="Minimize"
            >
              <ChevronUpIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {viewer}
    </>
  )
}
