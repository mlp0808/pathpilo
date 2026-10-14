'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { CheckIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { useAppI18n } from '@/app/components/I18nProvider'
import {
  GUIDES,
  guideStepsDone,
  isGuideComplete,
  isStepDone,
  resolveActiveGuideId,
  stepCount,
  type Guide,
  type GuideStep,
  type LaunchKind,
} from '@/app/config/missions'
import type { MessageKey } from '@/app/i18n'
import { useGuidesProgress } from './useGuidesProgress'

const AddClientModal = dynamic(() => import('@/app/components/AddClientModal'), { ssr: false })
const AddServiceModal = dynamic(() => import('@/app/components/AddServiceModal'), { ssr: false })
const CreateJob = dynamic(() => import('@/app/components/CreateJob'), { ssr: false })
const StartTrialModal = dynamic(() => import('./StartTrialModal'), { ssr: false })

function fill(text: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), text)
}

function HowToText({
  text,
  className = '',
  companySlug,
}: {
  text: string
  className?: string
  companySlug?: string
}) {
  const router = useRouter()
  // [[link:clients|clients page]] → green nav link
  // [[btn:+ New client]] → mini button chip
  // **bold** → strong
  const parts = text.split(/(\[\[(?:link:[^\]]+|btn:[^\]]+)\]\]|\*\*[^*]+\*\*)/g).filter(Boolean)

  return (
    <span className={`inline text-[11px] leading-relaxed text-gray-400 ${className}`}>
      {parts.map((part, i) => {
        const link = part.match(/^\[\[link:([^|]+)\|([^\]]+)\]\]$/)
        if (link) {
          const [, page, label] = link
          const href =
            companySlug && page === 'clients'
              ? `/${companySlug}/clients`
              : companySlug
                ? `/${companySlug}/${page}`
                : null
          if (!href) {
            return (
              <span key={i} className="font-medium text-accent-600">
                {label}
              </span>
            )
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => router.push(href)}
              className="inline font-semibold text-accent-600 underline decoration-accent-600/30 underline-offset-2 transition-colors hover:text-accent-700 hover:decoration-accent-700"
            >
              {label}
            </button>
          )
        }

        const btn = part.match(/^\[\[btn:([^\]]+)\]\]$/)
        if (btn) {
          const label = btn[1]
          return (
            <span
              key={i}
              className="mx-0.5 inline-flex items-center rounded-md border border-gray-200 bg-white px-1.5 py-[2px] text-[10px] font-semibold leading-none text-gray-700 shadow-sm align-middle"
            >
              {label}
            </span>
          )
        }

        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-gray-500">
              {part.slice(2, -2)}
            </strong>
          )
        }

        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

function GuideToast({
  item,
  onDone,
}: {
  item: { id: number; title: string }
  onDone: () => void
}) {
  const { t } = useAppI18n()
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3200)
    return () => window.clearTimeout(timer)
  }, [onDone, item.id])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex justify-center px-3 sm:top-4"
      role="status"
    >
      <div className="pointer-events-auto flex max-w-md animate-mission-toast items-center gap-2.5 rounded-xl border border-accent-200 bg-white px-3.5 py-2.5 shadow-lg shadow-gray-900/10">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-500">
          <CheckIcon className="h-3.5 w-3.5 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-700">
            {t('guide.actionDone', 'Action completed')}
          </p>
          <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
        </div>
      </div>
    </div>
  )
}

export default function MissionsPanel({
  companySlug,
  onLaunch,
  className = '',
  variant = 'active',
}: {
  companySlug: string
  onLaunch?: (kind: LaunchKind) => boolean | void
  className?: string
  /** hub = dashboard welcome + all guides; active = compact strip for the started guide */
  variant?: 'hub' | 'active'
}) {
  const { t } = useAppI18n()
  const router = useRouter()
  const pathname = usePathname()
  const { progress, setProgress, toast, setToast, load, patch, skippedSteps, skippedGuides } =
    useGuidesProgress()
  const [modal, setModal] = useState<LaunchKind | null>(null)
  const [openGuideId, setOpenGuideId] = useState<string | null>(null)
  const afterHrefRef = useRef<string | null>(null)

  const activeGuideId = useMemo(() => {
    if (!progress) return null
    return resolveActiveGuideId(
      progress.activeMissionId,
      progress.counts,
      progress.visits,
      skippedSteps,
      skippedGuides,
    )
  }, [progress, skippedSteps, skippedGuides])

  const activeGuide = useMemo(
    () => (activeGuideId ? GUIDES.find((g) => g.id === activeGuideId) || null : null),
    [activeGuideId],
  )

  /** First incomplete guide — owns the row-level Start CTA after earlier guides finish. */
  const nextGuideId = useMemo(() => {
    if (!progress) return null
    for (const g of GUIDES) {
      if (skippedGuides.has(g.id)) continue
      if (!isGuideComplete(g, progress.counts, progress.visits, skippedSteps)) return g.id
    }
    return null
  }, [progress, skippedSteps, skippedGuides])

  // When the started guide finishes, clear it so the hub can be used again.
  useEffect(() => {
    if (!progress) return
    const stored = progress.activeMissionId
    if (!stored) return
    const guide = GUIDES.find((g) => g.id === stored)
    if (!guide) return
    if (!isGuideComplete(guide, progress.counts, progress.visits, skippedSteps)) return
    setProgress((prev) => (prev ? { ...prev, activeMissionId: '' } : prev))
    void patch('active-mission', { missionId: '' })
  }, [progress, skippedSteps, patch, setProgress])

  const skipStep = (stepId: string) => {
    setProgress((prev) => (prev ? { ...prev, skipped: [...prev.skipped, stepId] } : prev))
    void patch('skip', { stepId })
  }

  const stopGuide = () => {
    setProgress((prev) => (prev ? { ...prev, activeMissionId: '' } : prev))
    void patch('active-mission', { missionId: '' })
  }

  const dismissAll = () => {
    setProgress((prev) => (prev ? { ...prev, dismissed: true } : prev))
    void patch('dismissed', { dismissed: true })
  }

  const startGuide = (guide: Guide) => {
    setProgress((prev) => (prev ? { ...prev, activeMissionId: guide.id } : prev))
    void patch('active-mission', { missionId: guide.id })
    const dest = guide.startHref(companySlug)
    if (pathname !== dest && !pathname.startsWith(`${dest}/`)) {
      router.push(dest)
    }
  }

  const goAfterIfNeeded = (href: string | null | undefined) => {
    if (!href) return
    const [base, query = ''] = href.split('?')
    if (pathname === base || pathname.startsWith(`${base}/`)) {
      if (query) router.push(href)
      return
    }
    router.push(href)
  }

  const runStep = (step: GuideStep) => {
    const href = step.href?.(companySlug)
    afterHrefRef.current = step.goAfter && href ? href : null

    if (step.launch) {
      if (onLaunch?.(step.launch) === true) {
        afterHrefRef.current = null
        return
      }
      if (step.launch === 'add_subscription') {
        if (href) router.push(href)
        return
      }
      setModal(step.launch)
      return
    }
    if (href) router.push(href)
  }

  const onCreated = (info?: { scheduledDate?: string | null; jobId?: number }) => {
    setModal(null)
    let dest = afterHrefRef.current
    afterHrefRef.current = null

    if (dest && info?.scheduledDate) {
      const base = dest.split('?')[0]
      if (base.endsWith('/jobs')) {
        const params = new URLSearchParams()
        params.set('date', String(info.scheduledDate).slice(0, 10))
        if (info.jobId != null) params.set('job', String(info.jobId))
        dest = `${base}?${params.toString()}`
      }
    }

    void load()
    goAfterIfNeeded(dest)
  }

  const onModalClose = () => {
    setModal(null)
    afterHrefRef.current = null
  }

  if (!progress || progress.dismissed) return null

  const modals = (
    <>
      {modal === 'add_client' && (
        <AddClientModal isOpen onClose={onModalClose} onClientAdded={onCreated} />
      )}
      {modal === 'add_service' && (
        <AddServiceModal isOpen onClose={onModalClose} onServiceAdded={onCreated} />
      )}
      {modal === 'add_job' && <CreateJob isOpen onClose={onModalClose} onJobCreated={onCreated} />}
      {modal === 'start_trial' && (
        <StartTrialModal
          companySlug={companySlug}
          returnPath={`/${companySlug}/team`}
          onClose={onModalClose}
        />
      )}
    </>
  )

  const toastNode = toast ? (
    <GuideToast item={toast} onDone={() => setToast((cur) => (cur?.id === toast.id ? null : cur))} />
  ) : null

  if (variant === 'hub') {
    return (
      <>
        {toastNode}
        <section
          className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}
        >
          <button
            type="button"
            onClick={dismissAll}
            aria-label={t('roadmap.dismissAll', 'Hide the guide for good')}
            className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>

          <div className="border-b border-gray-100 bg-gradient-to-br from-[#193434]/[0.04] via-white to-accent-50/40 px-5 py-6 sm:px-8 sm:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-700">
              {t('guide.hub.eyebrow', 'Guides')}
            </p>
            <h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              {t('guide.hub.welcome', 'Welcome to Pathpilo')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600 sm:text-[15px]">
              {t(
                'guide.hub.intro',
                'Here you can find guides to help you with every aspect of the platform. Open one below, then start it when you are ready — you can jump straight into invoicing, routes or subscriptions if that is what you came for.',
              )}
            </p>
            {activeGuide && (
              <p className="mt-3 text-sm text-gray-500">
                {fill(t('guide.hub.activeHint', 'Currently guiding: {{title}}'), {
                  title: t(activeGuide.titleKey as MessageKey, activeGuide.title),
                })}{' '}
                <button
                  type="button"
                  onClick={stopGuide}
                  className="font-medium text-gray-700 underline-offset-2 hover:underline"
                >
                  {t('guide.stop', 'Stop guide')}
                </button>
              </p>
            )}
          </div>

          <ul className="divide-y divide-gray-100">
            {GUIDES.map((guide) => {
              const open = openGuideId === guide.id
              const complete = isGuideComplete(
                guide,
                progress.counts,
                progress.visits,
                skippedSteps,
              )
              const { done, total } = guideStepsDone(
                guide,
                progress.counts,
                progress.visits,
                skippedSteps,
              )
              const isActive = activeGuideId === guide.id
              const previewSteps = guide.steps.filter((s) => !skippedSteps.has(s.id))
              // Row CTA sits on the next incomplete guide (advances when one finishes),
              // or on whichever guide is already in progress ("Continue").
              const showRowCta = !complete && (isActive || guide.id === nextGuideId)
              const showPanelStart = !complete && !showRowCta

              return (
                <li key={guide.id}>
                  <div className="flex items-center gap-3 px-5 py-4 sm:px-8">
                    <button
                      type="button"
                      onClick={() => setOpenGuideId(open ? null : guide.id)}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:opacity-90"
                    >
                      <span
                        className={[
                          'flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-bold',
                          complete
                            ? 'bg-accent-500 text-white'
                            : isActive
                              ? 'bg-[#193434] text-white'
                              : 'bg-gray-100 text-gray-500',
                        ].join(' ')}
                      >
                        {complete ? <CheckIcon className="h-4 w-4" /> : GUIDES.indexOf(guide) + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-gray-900 sm:text-lg">
                            {t(guide.titleKey as MessageKey, guide.title)}
                          </span>
                          {complete && (
                            <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-700">
                              {t('guide.complete', 'Complete')}
                            </span>
                          )}
                          {isActive && !complete && (
                            <span className="rounded-full bg-[#193434]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#193434]">
                              {t('guide.active', 'In progress')}
                            </span>
                          )}
                          {guide.id === 'team' && !complete && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200/70">
                              {t('guide.team.badge', '14-day free trial')}
                            </span>
                          )}
                          {!complete && (
                            <span className="text-xs tabular-nums text-gray-400">
                              {fill(t('roadmap.progress', '{{done}}/{{total}}'), { done, total })}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-sm text-gray-500">
                          {t(guide.blurbKey as MessageKey, guide.blurb)}
                        </span>
                      </span>
                    </button>

                    <div className="ml-auto flex flex-none items-center gap-2 self-center">
                      {showRowCta && (
                        <button
                          type="button"
                          onClick={() => startGuide(guide)}
                          className="rounded-xl bg-accent-500 px-3.5 py-2 text-sm font-semibold text-[#193434] shadow-sm transition-colors hover:bg-accent-400"
                        >
                          {isActive
                            ? t('guide.continue', 'Continue guide')
                            : guide.id === 'get_started'
                              ? t('guide.getStarted.cta', 'Get started')
                              : t('guide.start', 'Start guide')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenGuideId(open ? null : guide.id)}
                        aria-expanded={open}
                        aria-label={open ? t('guide.collapse', 'Collapse') : t('guide.expand', 'Expand')}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      >
                        <ChevronDownIcon
                          className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                  </div>

                  <div
                    className={[
                      'grid transition-[grid-template-rows] duration-200 ease-out',
                      open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                    ].join(' ')}
                  >
                    <div className="overflow-hidden">
                      <div className="relative px-5 pb-5 pt-1 sm:px-8 sm:pb-6">
                        {/* Jump-ahead: Start lives in the panel when this isn't the next/active row CTA */}
                        {showPanelStart && (
                          <div className="mb-4 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startGuide(guide)}
                              className="inline-flex items-center rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-[#193434] shadow-sm transition-colors hover:bg-accent-400"
                            >
                              {t('guide.start', 'Start guide')}
                            </button>
                          </div>
                        )}
                        {isActive && !complete && (
                          <div className="mb-4">
                            <button
                              type="button"
                              onClick={stopGuide}
                              className="rounded-xl px-3 py-2 text-sm font-medium text-gray-400 hover:text-gray-600"
                            >
                              {t('guide.stop', 'Stop guide')}
                            </button>
                          </div>
                        )}

                        <ol className="space-y-2.5">
                          {previewSteps.map((step, i) => {
                            const stepDone = isStepDone(step, progress.counts, progress.visits)
                            return (
                              <li
                                key={step.id}
                                className={[
                                  'flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 py-2.5',
                                  !isActive && !complete ? 'opacity-45' : '',
                                  stepDone ? 'opacity-70' : '',
                                ].join(' ')}
                              >
                                <span
                                  className={[
                                    'mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold',
                                    stepDone
                                      ? 'bg-accent-500 text-white'
                                      : 'border border-gray-200 bg-white text-gray-400',
                                  ].join(' ')}
                                >
                                  {stepDone ? <CheckIcon className="h-3 w-3" /> : i + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={`text-sm ${stepDone ? 'text-gray-400' : 'font-medium text-gray-800'}`}
                                  >
                                    {t(step.titleKey as MessageKey, step.title)}
                                  </p>
                                  <p className="mt-0.5 overflow-visible">
                                    <HowToText
                                      text={t(step.howToKey as MessageKey, step.howTo)}
                                      companySlug={companySlug}
                                    />
                                  </p>
                                </div>
                              </li>
                            )
                          })}
                        </ol>

                        {!isActive && !complete && (
                          <p className="mt-3 text-xs text-gray-400">
                            {t(
                              'guide.hub.previewHint',
                              'Preview only — press Start guide to begin these steps on the right page.',
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          {modals}
        </section>
      </>
    )
  }

  // Compact active guide (other pages) — thin strip, current step only.
  if (!activeGuide) return toastNode

  const steps = activeGuide.steps.filter((s) => !skippedSteps.has(s.id))
  const activeStep = steps.find((s) => !isStepDone(s, progress.counts, progress.visits)) || null
  const { done, total } = guideStepsDone(
    activeGuide,
    progress.counts,
    progress.visits,
    skippedSteps,
  )
  const activeIndex = activeStep ? steps.findIndex((s) => s.id === activeStep.id) : -1
  const { have, target } = activeStep
    ? stepCount(activeStep, progress.counts)
    : { have: 0, target: 0 }

  return (
    <>
      {toastNode}
      <section
        className={`rounded-xl border border-gray-200 bg-white px-3 py-2.5 sm:px-3.5 ${className}`}
      >
        <div className="flex items-start gap-2.5 sm:items-center">
          <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#193434] text-[10px] font-bold tabular-nums text-white sm:mt-0">
            {activeIndex >= 0 ? activeIndex + 1 : '✓'}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="truncate text-[11px] font-medium text-gray-400">
                {t(activeGuide.titleKey as MessageKey, activeGuide.title)}
                <span className="mx-1.5 text-gray-300">·</span>
                <span className="tabular-nums">
                  {fill(t('roadmap.progress', '{{done}}/{{total}}'), { done, total })}
                </span>
              </p>
            </div>
            {activeStep ? (
              <>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-sm font-semibold text-gray-900">
                    {t(activeStep.titleKey as MessageKey, activeStep.title)}
                  </p>
                  {activeStep.countKey && target > 1 && (
                    <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-accent-700">
                      {have}/{target}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 overflow-hidden">
                  <HowToText
                    text={t(activeStep.howToKey as MessageKey, activeStep.howTo)}
                    companySlug={companySlug}
                  />
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-sm font-medium text-gray-700">
                {t('guide.complete', 'Complete')}
              </p>
            )}
          </div>

          <div className="ml-auto flex flex-none flex-col items-end gap-1 self-center sm:flex-row sm:items-center sm:gap-1.5">
            {activeStep && (
              <>
                <button
                  type="button"
                  onClick={() => runStep(activeStep)}
                  className="inline-flex items-center rounded-lg bg-accent-500 px-2.5 py-1.5 text-xs font-semibold text-[#193434] shadow-sm transition-colors hover:bg-accent-400"
                >
                  {t(activeStep.ctaKey as MessageKey, activeStep.cta)}
                </button>
                <button
                  type="button"
                  onClick={() => skipStep(activeStep.id)}
                  className="rounded-lg px-1.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:text-gray-600"
                >
                  {t('roadmap.skip', 'Skip this step')}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={stopGuide}
              className="rounded-lg px-1.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:text-gray-600"
            >
              {t('guide.stop', 'Stop guide')}
            </button>
            <button
              type="button"
              onClick={dismissAll}
              aria-label={t('roadmap.dismissAll', 'Hide the guide for good')}
              className="rounded-lg p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {modals}
      </section>
    </>
  )
}
