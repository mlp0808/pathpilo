'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  ArrowsPointingOutIcon,
  BoltIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { TrophyIcon } from '@heroicons/react/24/solid'
import GuideText, { resolveGuideHref } from './GuideText'
import GuideFireworks from './GuideFireworks'
import { isStepDone, type CompletionState, type GuideStep, type GuideWithProgress } from './useGuides'
import { GuidePicker, SlideDots, neighbourGuides, useJustCompleted, usePopover } from './GuideProgress'

type IOSVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

/**
 * Silent product recordings loop inline so the move can be watched again
 * without hunting for a play button. A click opens them full screen, from the
 * start, with controls.
 */
function StepMedia({ step, active }: { step: GuideStep; active: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [full, setFull] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (active) video.play().catch(() => {})
    else video.pause()
  }, [active])

  useEffect(() => {
    const sync = () => {
      const el = document.fullscreenElement
      setFull(Boolean(el) && (el === wrapRef.current || el === videoRef.current))
    }
    const video = videoRef.current
    const endIOS = () => setFull(false)
    document.addEventListener('fullscreenchange', sync)
    video?.addEventListener('webkitendfullscreen', endIOS)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      video?.removeEventListener('webkitendfullscreen', endIOS)
    }
  }, [])

  if (!step.mediaUrl || step.mediaType === 'none') return null

  const openFull = () => {
    const video = videoRef.current as IOSVideo | null
    if (video) {
      video.currentTime = 0
      video.play().catch(() => {})
      if (typeof video.requestFullscreen === 'function') {
        video.requestFullscreen().catch(() => {})
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen()
        setFull(true)
      }
      return
    }
    const wrap = wrapRef.current
    if (wrap && typeof wrap.requestFullscreen === 'function') wrap.requestFullscreen().catch(() => {})
  }

  return (
    <div
      ref={wrapRef}
      className={`group relative overflow-hidden bg-gray-900 ${full ? 'flex items-center justify-center' : 'rounded-2xl'}`}
    >
      {step.mediaType === 'video' ? (
        <video
          ref={videoRef}
          src={step.mediaUrl}
          muted
          loop
          playsInline
          preload="metadata"
          controls={full}
          onClick={full ? undefined : openFull}
          className={full ? 'h-full w-full object-contain' : 'block aspect-video w-full cursor-zoom-in object-contain'}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={step.mediaUrl}
          alt=""
          onClick={full ? undefined : openFull}
          className={full ? 'max-h-full max-w-full object-contain' : 'block max-h-[340px] w-full cursor-zoom-in object-contain'}
        />
      )}
      {!full && (
        <button
          type="button"
          onClick={openFull}
          className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
        >
          <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
          Full screen
        </button>
      )}
    </div>
  )
}

/** The task itself, set apart on its own card so it reads as the thing to do. */
function StepSlide({
  step,
  done,
  active,
  companySlug,
  onGo,
}: {
  step: GuideStep
  done: boolean
  active: boolean
  companySlug: string
  onGo: () => void
}) {
  const waiting = !done && Boolean(step.doneTrigger)
  const hasMedia = Boolean(step.mediaUrl) && step.mediaType !== 'none'
  return (
    <div className="relative">
      {done && (
        <span
          key={step.id}
          className="pointer-events-none absolute right-0 top-0 z-10 inline-flex items-center gap-1 rounded-full bg-accent-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm animate-guide-stamp"
        >
          <CheckIcon className="h-3 w-3" strokeWidth={3} />
          Done
        </span>
      )}
      <StepMedia step={step} active={active} />
      <div className={hasMedia ? 'pt-4' : ''}>
        <h2 className={`text-xl font-bold leading-snug tracking-tight text-gray-900 sm:text-[22px] ${done && !hasMedia ? 'pr-16' : ''}`}>
          {step.title}
        </h2>
        <GuideText text={step.body} companySlug={companySlug} className="mt-2 !text-[15px]" />
        {(step.ctaHref || waiting) && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {step.ctaHref && (
              <button
                type="button"
                onClick={onGo}
                className="inline-flex items-center gap-1 rounded-lg bg-[#e8e7df] px-2.5 py-1.5 text-[13px] font-semibold text-[#14532d] transition-colors hover:bg-[#dddcd2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                {step.ctaLabel || 'Take me there'}
                <ArrowUpRightIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {waiting && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400">
                <BoltIcon className="h-3.5 w-3.5" />
                Ticks off by itself when you do it
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function GuidesBar({ completed, total }: { completed: number; total: number }) {
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-gray-600">This guide</span>
        <span className="tabular-nums text-gray-500">
          {completed} of {total} steps
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-accent-500 transition-[width] duration-700"
          style={{ width: `${total ? (completed / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  )
}

/** The guide's front page: what it covers, how far you are, and where to dive in. */
function CoverSlide({
  guide,
  position,
  done,
  totalGuides,
  onOpenStep,
}: {
  guide: GuideWithProgress
  position: number
  done: boolean[]
  totalGuides: number
  onOpenStep: (i: number) => void
}) {
  const upNext = guide.complete ? -1 : guide.nextStepIndex
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center py-2">
      <div className="text-center">
        <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-50 text-3xl shadow-[inset_0_0_0_1px_rgba(16,185,129,0.15)]">
          {guide.icon || '📘'}
          {guide.complete && (
            <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-accent-50 text-accent-600 ring-4 ring-white">
              <TrophyIcon className="h-4 w-4" />
            </span>
          )}
        </span>
        <p
          className={`mt-4 text-[11px] font-semibold uppercase tracking-wider ${guide.complete ? 'text-accent-700' : 'text-gray-400'}`}
        >
          {guide.complete ? 'Guide complete' : `Guide ${position} of ${totalGuides}`}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{guide.title}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {guide.complete
            ? `All ${guide.total} steps done.`
            : guide.description || `${guide.total} short steps.`}
        </p>
      </div>

      <ol className="mt-6 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
        {guide.steps.map((step, i) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onOpenStep(i)}
              className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                i === upNext ? 'bg-accent-50/50' : ''
              }`}
            >
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
                  done[i] ? 'border-accent-500 bg-accent-500 text-white' : 'border-gray-300 bg-white'
                }`}
              >
                {done[i] && <CheckIcon className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span className={`min-w-0 flex-1 truncate text-sm font-medium ${done[i] ? 'text-gray-500' : 'text-gray-900'}`}>
                {step.title}
              </span>
              {i === upNext && (
                <span className="shrink-0 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent-700">
                  Up next
                </span>
              )}
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300" />
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <GuidesBar completed={guide.doneCount} total={guide.total} />
      </div>
    </div>
  )
}

/** The last page, once every step is done: a small party and a look at what's next. */
function FinaleSlide({
  guides,
  guide,
  completedGuides,
  totalGuides,
  onPickGuide,
}: {
  guides: GuideWithProgress[]
  guide: GuideWithProgress
  completedGuides: number
  totalGuides: number
  onPickGuide: (id: number) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const allDone = totalGuides > 0 && completedGuides >= totalGuides

  if (showAll) {
    return (
      <div className="mx-auto w-full max-w-md py-2">
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mb-3 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back
        </button>
        <h2 className="px-1 text-xl font-bold tracking-tight text-gray-900">
          {allDone ? 'All your guides' : 'What do you want to learn next?'}
        </h2>
        <GuidePicker flat className="mt-3" guides={guides} activeId={guide.id} completed={completedGuides} onPick={onPickGuide} />
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center py-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-50 text-accent-600 shadow-[0_0_0_10px_rgba(16,185,129,0.12)] animate-guide-trophy">
        <TrophyIcon className="h-10 w-10" />
      </span>
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-accent-700">
        {allDone ? 'Every guide complete' : 'Guide complete'}
      </p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
        {allDone ? 'You know PathPilo inside out' : `Nicely done! ${guide.icon || ''}`}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
        {allDone
          ? 'Every guide finished. Now go win some work.'
          : `You finished ${guide.title}. Every step you take here makes the busy days easier.`}
      </p>
      <button
        type="button"
        onClick={() => setShowAll(true)}
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
      >
        Go to guide list
        <ArrowRightIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

/** "Previous guide / Getting started" — a jump to the neighbouring guide. */
function GuideJump({
  direction,
  guide,
  onClick,
}: {
  direction: 'previous' | 'next'
  guide: GuideWithProgress
  onClick: () => void
}) {
  const next = direction === 'next'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 items-center gap-2.5 rounded-xl py-1.5 text-left transition-colors ${
        next
          ? 'bg-accent-500 pl-3.5 pr-3 text-white shadow-sm hover:bg-accent-600'
          : 'pl-2 pr-3 text-gray-700 hover:bg-white'
      }`}
    >
      {!next && <ArrowLeftIcon className="h-4 w-4 shrink-0 text-gray-400" />}
      <span className="min-w-0">
        <span
          className={`block text-[10px] font-semibold uppercase tracking-wider ${next ? 'text-white/80' : 'text-gray-400'}`}
        >
          {next ? 'Next guide' : 'Previous guide'}
        </span>
        <span className="block max-w-[150px] truncate text-[13px] font-semibold sm:max-w-[190px]">
          {guide.icon} {guide.title}
        </span>
      </span>
      {next && <ArrowRightIcon className="h-4 w-4 shrink-0" />}
    </button>
  )
}

/** Where a guide opens: its cover, the step up next, the celebration, or its last step. */
export type GuideStartAt = 'cover' | 'step' | 'finale' | 'end'

export default function GuideViewer({
  guides,
  guide,
  companySlug,
  state,
  completedGuides,
  startAt,
  onClose,
  onPickGuide,
  onSeen,
}: {
  guides: GuideWithProgress[]
  guide: GuideWithProgress
  companySlug: string
  state: CompletionState
  completedGuides: number
  startAt: GuideStartAt
  onClose: () => void
  onPickGuide: (id: number, startAt: GuideStartAt) => void
  onSeen: (stepId: number) => void
}) {
  const router = useRouter()
  const picker = usePopover()
  const steps = guide.steps
  const hasFinale = guide.complete
  // Slide 0 is the cover, then one slide per step, then the finale once complete.
  const slideCount = 1 + steps.length + (hasFinale ? 1 : 0)
  const finaleIndex = hasFinale ? steps.length + 1 : -1

  const indexFor = (at: GuideStartAt) => {
    if (at === 'cover' || steps.length === 0) return 0
    if (at === 'end') return steps.length
    if (at === 'finale' && guide.complete) return steps.length + 1
    return guide.complete ? 0 : guide.nextStepIndex + 1
  }
  const indexForRef = useRef(indexFor)
  indexForRef.current = indexFor

  const [index, setIndex] = useState(() => indexFor(startAt))
  const safeIndex = Math.max(0, Math.min(index, slideCount - 1))
  const onFinale = safeIndex === finaleIndex
  const stepIndex = safeIndex >= 1 && safeIndex <= steps.length ? safeIndex - 1 : -1

  const opened = useRef(false)
  useEffect(() => {
    if (!opened.current) {
      opened.current = true
      return
    }
    setIndex(indexForRef.current(startAt))
  }, [guide.id, startAt])

  const [fireworks, setFireworks] = useState(false)
  useEffect(() => {
    if (!onFinale) return
    setFireworks(true)
    return () => setFireworks(false)
  }, [onFinale, guide.id])

  const doneFlags = useMemo(() => steps.map((s) => isStepDone(s, state)), [steps, state])
  const justDone = useJustCompleted(guide.id, doneFlags)
  const visible = guides.filter((g) => g.total > 0)
  const position = visible.findIndex((g) => g.id === guide.id) + 1
  const { next, previous } = neighbourGuides(guides, guide.id)

  const currentStepId = stepIndex >= 0 ? steps[stepIndex]?.id ?? null : null
  useEffect(() => {
    if (currentStepId) onSeen(currentStepId)
  }, [currentStepId, onSeen])

  const go = (delta: number) => setIndex((i) => Math.max(0, Math.min(slideCount - 1, Math.min(i, slideCount - 1) + delta)))

  const goToGuide = (target: GuideWithProgress | null, land: GuideStartAt) => {
    if (!target) return onClose()
    onPickGuide(target.id, land)
  }

  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.fullscreenElement) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') goRef.current(1)
      else if (e.key === 'ArrowLeft') goRef.current(-1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const touch = useRef<{ x: number; y: number } | null>(null)

  const takeMeThere = (step: GuideStep) => {
    if (!step.ctaHref) return
    router.push(resolveGuideHref(step.ctaHref, companySlug))
    onClose()
  }

  const atStart = safeIndex === 0
  const atEnd = safeIndex === slideCount - 1

  const backControl = !atStart ? (
    <button
      type="button"
      onClick={() => go(-1)}
      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-white hover:text-gray-900"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      Back
    </button>
  ) : previous ? (
    <GuideJump direction="previous" guide={previous} onClick={() => goToGuide(previous, 'end')} />
  ) : null

  const onCover = safeIndex === 0
  const nextControl = !atEnd ? (
    <button
      type="button"
      onClick={() => go(1)}
      className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
    >
      {onCover && guide.doneCount === 0 ? 'Start' : 'Next'}
      <ArrowRightIcon className="h-4 w-4" />
    </button>
  ) : next ? (
    <GuideJump direction="next" guide={next} onClick={() => goToGuide(next, 'cover')} />
  ) : (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
    >
      Finish
    </button>
  )

  const map =
    steps.length > 0 ? (
      <SlideDots
        dots={[
          { label: 'Overview', done: false, kind: 'cover' as const },
          ...steps.map((s, i) => ({ label: s.title || `Step ${i + 1}`, done: doneFlags[i], kind: 'step' as const })),
          { label: 'Guide complete', done: guide.complete, kind: 'finale' as const },
        ]}
        index={safeIndex}
        onSelect={setIndex}
        justDone={justDone == null ? null : justDone + 1}
      />
    ) : null

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={guide.title}
    >
      <button
        type="button"
        aria-label="Close guide"
        onClick={onClose}
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-[3px]"
      />

      <div className="relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-guide-book sm:h-[min(700px,88vh)] sm:max-w-[720px] sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-gray-200 sm:hidden" aria-hidden />

        <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 pb-3 pt-2 sm:px-5 sm:pb-4 sm:pt-4">
          <div ref={picker.ref} className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => picker.setOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={picker.open}
              className={`group flex max-w-full items-center gap-2.5 rounded-xl py-1 pl-1 pr-2.5 text-left transition-colors ${
                picker.open ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-lg">
                {guide.icon || '📘'}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[15px] font-semibold text-gray-900">
                  <span className="truncate">{guide.title}</span>
                  <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-gray-700" />
                </span>
                <span className="block truncate text-xs text-gray-500">
                  {guide.doneCount} of {guide.total} done ·{' '}
                  <span className="font-semibold text-[#1f7a46] group-hover:underline">Switch guide</span>
                </span>
              </span>
            </button>
            {picker.open && (
              <GuidePicker
                className="absolute left-0 top-full z-20 mt-2 w-[min(380px,calc(100vw-1.5rem))]"
                guides={guides}
                activeId={guide.id}
                completed={completedGuides}
                onPick={(id) => {
                  picker.setOpen(false)
                  if (id !== guide.id) onPickGuide(id, 'cover')
                }}
              />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        {steps.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-gray-400">
            This guide has no steps yet.
          </div>
        ) : (
          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            onTouchStart={(e) => {
              touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
            }}
            onTouchEnd={(e) => {
              const start = touch.current
              touch.current = null
              if (!start) return
              const dx = e.changedTouches[0].clientX - start.x
              const dy = e.changedTouches[0].clientY - start.y
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
            }}
          >
            <div
              className="flex h-full transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${safeIndex * 100}%)` }}
            >
              <div className="h-full w-full shrink-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5" aria-hidden={!onCover}>
                {safeIndex <= 1 && (
                  <CoverSlide
                    guide={guide}
                    position={position}
                    done={doneFlags}
                    totalGuides={visible.length}
                    onOpenStep={(i) => setIndex(i + 1)}
                  />
                )}
              </div>
              {steps.map((step, i) => (
                <div
                  key={step.id}
                  className="h-full w-full shrink-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
                  aria-hidden={i !== stepIndex}
                >
                  {Math.abs(i + 1 - safeIndex) <= 1 && (
                    <StepSlide
                      step={step}
                      done={doneFlags[i]}
                      active={i === stepIndex}
                      companySlug={companySlug}
                      onGo={() => takeMeThere(step)}
                    />
                  )}
                </div>
              ))}
              {hasFinale && (
                <div className="h-full w-full shrink-0 overflow-y-auto px-4 py-4 sm:px-6" aria-hidden={!onFinale}>
                  {onFinale && (
                    <FinaleSlide
                      key={guide.id}
                      guides={guides}
                      guide={guide}
                      completedGuides={completedGuides}
                      totalGuides={visible.length}
                      onPickGuide={(id) => (id === guide.id ? setIndex(0) : onPickGuide(id, 'cover'))}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <footer className="shrink-0 border-t border-gray-100 bg-gray-50/70 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {map && <div className="mb-3 sm:hidden">{map}</div>}
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 justify-start">{backControl}</div>
            {map && <div className="hidden sm:block">{map}</div>}
            <div className="flex min-w-0 flex-1 justify-end">{nextControl}</div>
          </div>
        </footer>
      </div>
      {fireworks && <GuideFireworks onDone={() => setFireworks(false)} />}
    </div>
  )
}
