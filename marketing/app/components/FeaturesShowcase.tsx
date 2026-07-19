'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { marketingImages } from '../config/marketingImages'
import {
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  ArrowPathIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  UsersIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'
import { getLocaleFromPathname, withLocalePath } from '../lib/i18n'

const CYCLE_MS = 3000

type IconType = ComponentType<SVGProps<SVGSVGElement>>

export interface ShowcaseFeature {
  id: string
  tabLabel: string
  title: string
  description: string
  icon: IconType
  /** Pre-composed mockup image — paths from marketingImages.features (see public/images/) */
  screenshot: string
}

interface LocalisedShowcaseFeature {
  id: string
  tabLabel: { en: string; da: string }
  title: { en: string; da: string }
  description: { en: string; da: string }
  icon: IconType
  screenshot: string
}

const SHOWCASE_FEATURES_DATA: LocalisedShowcaseFeature[] = [
  {
    id: 'scheduling',
    tabLabel: { en: 'Scheduling', da: 'Planlægning' },
    title: { en: 'See your week at a glance', da: 'Overblik over hele ugen' },
    description: {
      en: 'Drag-and-drop calendar, conflict checks, and day or week views so your crew always knows where to be next.',
      da: 'Træk-og-slip kalender, konfliktcheck og dag- eller ugevisning — dit team ved altid, hvad der er næst.',
    },
    icon: CalendarDaysIcon,
    screenshot: marketingImages.features.scheduling,
  },
  {
    id: 'jobs',
    tabLabel: { en: 'Jobs', da: 'Jobs' },
    title: { en: 'Every job, start to finish', da: 'Hvert job fra start til slut' },
    description: {
      en: 'Create jobs fast, bundle services, track status, and keep notes and history in one place.',
      da: 'Opret jobs hurtigt, saml services, følg status og hold noter og historik samlet ét sted.',
    },
    icon: ClipboardDocumentListIcon,
    screenshot: marketingImages.features.jobs,
  },
  {
    id: 'recurring',
    tabLabel: { en: 'Recurring', da: 'Abonnementer' },
    title: { en: 'Subscriptions on autopilot', da: 'Abonnementer på autopilot' },
    description: {
      en: 'Weekly or monthly rules that spawn jobs automatically—less admin, steadier revenue.',
      da: 'Ugentlige eller månedlige regler der opretter jobs automatisk — mindre admin, mere forudsigelig omsætning.',
    },
    icon: ArrowPathIcon,
    screenshot: marketingImages.features.recurring,
  },
  {
    id: 'clients',
    tabLabel: { en: 'Clients', da: 'Kunder' },
    title: { en: 'CRM built for service work', da: 'CRM bygget til servicearbejde' },
    description: {
      en: 'Profiles, addresses, billing contacts, and full service history for people and businesses.',
      da: 'Profiler, adresser, fakturakontakter og fuld servicehistorik for både privatpersoner og virksomheder.',
    },
    icon: UserGroupIcon,
    screenshot: marketingImages.features.clients,
  },
  {
    id: 'invoicing',
    tabLabel: { en: 'Invoicing', da: 'Fakturering' },
    title: { en: 'Get paid without the chase', da: 'Bliv betalt uden at jagte' },
    description: {
      en: 'Professional invoices, discounts, taxes, and email delivery in minutes.',
      da: 'Professionelle fakturaer, rabatter, moms og e-maillevering på minutter.',
    },
    icon: CurrencyDollarIcon,
    screenshot: marketingImages.features.invoicing,
  },
  {
    id: 'analytics',
    tabLabel: { en: 'Analytics', da: 'Statistik' },
    title: { en: 'Numbers that drive decisions', da: 'Tal der driver beslutninger' },
    description: {
      en: 'Revenue, completed jobs, and team performance in real time—not in spreadsheets.',
      da: 'Omsætning, afsluttede jobs og teamets præstation i realtid — ikke i regneark.',
    },
    icon: ChartBarIcon,
    screenshot: marketingImages.features.analytics,
  },
  {
    id: 'routes',
    tabLabel: { en: 'Routes', da: 'Ruter' },
    title: { en: 'Smarter days on the road', da: 'Smartere dage på vejen' },
    description: {
      en: 'Plan the day in order, cut drive time, and keep the team aligned from the van.',
      da: 'Planlæg dagen i rækkefølge, reducer kørselstid og hold teamet opdateret direkte fra bilen.',
    },
    icon: MapPinIcon,
    screenshot: marketingImages.features.routes,
  },
  {
    id: 'team',
    tabLabel: { en: 'Team', da: 'Team' },
    title: { en: 'Roles, hours, assignments', da: 'Roller, timer og opgaver' },
    description: {
      en: 'Invite staff, set permissions, track hours, and assign work with confidence.',
      da: 'Inviter medarbejdere, sæt rettigheder, følg timer og tildel arbejde med overblik.',
    },
    icon: UsersIcon,
    screenshot: marketingImages.features.team,
  },
]

/** Resolved flat feature list for the given locale. */
function getShowcaseFeatures(da: boolean): ShowcaseFeature[] {
  return SHOWCASE_FEATURES_DATA.map((f) => ({
    id: f.id,
    tabLabel: da ? f.tabLabel.da : f.tabLabel.en,
    title: da ? f.title.da : f.title.en,
    description: da ? f.description.da : f.description.en,
    icon: f.icon,
    screenshot: f.screenshot,
  }))
}

export default function FeaturesShowcase() {
  const pathname = usePathname()
  const locale = getLocaleFromPathname(pathname || '/')
  const da = locale === 'da'
  const SHOWCASE_FEATURES = getShowcaseFeatures(da)
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  const n = SHOWCASE_FEATURES.length
  const current = SHOWCASE_FEATURES[active]

  const goTo = useCallback((index: number) => {
    setActive(((index % n) + n) % n)
  }, [n])

  const accMs = useRef(0)
  const lastTs = useRef<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)
    const onChange = () => setPrefersReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion) {
      setProgress(100)
      return
    }

    accMs.current = 0
    lastTs.current = null
    setProgress(0)
    let raf: number

    const loop = (t: number) => {
      if (lastTs.current == null) lastTs.current = t
      if (!paused) {
        accMs.current += t - lastTs.current
      }
      lastTs.current = t

      const p = Math.min(100, (accMs.current / CYCLE_MS) * 100)
      setProgress(p)

      if (accMs.current >= CYCLE_MS) {
        setActive((i) => (i + 1) % n)
        return
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active, paused, n, prefersReducedMotion])

  const Icon = current.icon

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-white via-primary-50/40 to-primary-50/80 py-20 md:py-28"
      aria-label="Platform features"
    >
      <div className="pointer-events-none absolute right-0 top-24 h-72 w-72 rounded-full bg-accent-500/5 blur-3xl" />
      <div className="pointer-events-none absolute bottom-20 left-0 h-64 w-64 rounded-full bg-primary-500/5 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto mb-10 max-w-3xl text-center md:mb-14">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
            {da ? 'Platform' : 'Platform'}
          </p>
          <h2 className="section-title mb-4">{da ? 'Alt din servicevirksomhed drives af' : 'Everything your service business runs on'}</h2>
          <p className="section-subtitle mx-auto mb-0">
            {da
              ? 'Én samlet platform til marken og kontoret - se hvordan hver del af PathPilo spiller sammen.'
              : 'One stack for the field and the office—explore how each part of PathPilo fits together.'}
          </p>
        </div>

        {/* Tab strip: inactive = text only; active = pill + progress as its bottom edge (same width) */}
        <div className="mb-10 md:mb-14">
          <div className="-mx-6 overflow-x-auto px-6 pb-1 md:mx-0 md:overflow-visible md:px-0">
            <div
              className="flex min-w-min flex-wrap items-center justify-center gap-x-5 gap-y-3 md:gap-x-8"
              role="tablist"
              aria-label="Feature categories"
            >
              {SHOWCASE_FEATURES.map((f, i) => {
                const isActive = i === active
                const TabIcon = f.icon

                if (!isActive) {
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={false}
                      aria-controls={`feature-panel-${f.id}`}
                      id={`feature-tab-${f.id}`}
                      onClick={() => goTo(i)}
                      className="shrink-0 border-0 bg-transparent px-1 py-2 text-sm font-semibold text-gray-500 shadow-none outline-none ring-0 transition-colors hover:text-primary-500 focus-visible:rounded-md focus-visible:text-primary-600 focus-visible:ring-2 focus-visible:ring-accent-500/30"
                    >
                      {f.tabLabel}
                    </button>
                  )
                }

                return (
                  <div
                    key={f.id}
                    className="inline-flex shrink-0 flex-col overflow-hidden rounded-2xl border border-accent-500/40 bg-accent-500 shadow-lg shadow-accent-500/25 self-center"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected
                      aria-controls={`feature-panel-${f.id}`}
                      id={`feature-tab-${f.id}`}
                      onClick={() => goTo(i)}
                      className="flex items-center justify-center gap-2 border-0 bg-transparent px-4 py-2.5 text-sm font-semibold text-white outline-none ring-0 md:px-5 md:py-3"
                    >
                      <TabIcon className="h-5 w-5 shrink-0 text-white" aria-hidden />
                      <span>{f.tabLabel}</span>
                    </button>
                    <div
                      className="h-1 w-full shrink-0 overflow-hidden bg-black/25"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress)}
                      aria-label={da ? 'Tid til næste funktion' : 'Time until next feature'}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-white/95 to-emerald-100/95 transition-[width] duration-75 ease-linear"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Pre-composed mockup PNG + copy — hover pauses auto-advance */}
        <div
          id={`feature-panel-${current.id}`}
          role="tabpanel"
          aria-labelledby={`feature-tab-${current.id}`}
          className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14"
          onMouseEnter={() => {
            if (!prefersReducedMotion) setPaused(true)
          }}
          onMouseLeave={() => {
            if (!prefersReducedMotion) setPaused(false)
          }}
        >
          <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
            <Image
              key={current.id}
              src={current.screenshot}
              alt={current.title}
              width={1600}
              height={1000}
              className="h-auto w-full animate-feature-fade-in"
              sizes="(max-width: 1024px) 100vw, 640px"
            />
          </div>

          <div className="text-center lg:text-left">
            <div className="mb-4 inline-flex items-center justify-center gap-2 rounded-2xl border border-accent-500/20 bg-accent-500/10 px-4 py-2 lg:justify-start">
              <Icon className="h-6 w-6 text-accent-600" />
              <span className="text-sm font-semibold text-accent-700">{da ? 'Viser nu' : 'Now showing'}</span>
            </div>
            <h3 className="text-3xl font-bold tracking-tight text-primary-500 md:text-4xl">
              {current.title}
            </h3>
            <p className="mt-4 text-lg leading-relaxed text-gray-600 md:text-xl">
              {current.description}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <span className="rounded-full border border-primary-500/10 bg-white px-4 py-2 text-sm font-medium text-primary-500 shadow-sm">
                {active + 1} / {n} {da ? 'moduler' : 'modules'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-14 text-center">
          <Link
            href={withLocalePath(locale, '/pricing')}
            className="text-lg font-semibold text-accent-600 transition hover:text-accent-700"
          >
            {da ? 'Se priser og kom i gang ->' : 'View pricing and get started →'}
          </Link>
        </div>
      </div>
    </section>
  )
}
