/**
 * Onboarding guides: topic groups the owner can start one at a time.
 * Completion is derived from live counts; active/skipped state lives on the company.
 * howTo strings may use **bold** for UI labels.
 */

export type StepArea = 'clients' | 'services' | 'jobs' | 'routes' | 'invoices'

export type CountKey =
  | 'clients'
  | 'services'
  | 'jobs'
  | 'jobs_same_day'
  | 'subscriptions'
  | 'routes'
  | 'rounds'
  | 'completed_jobs'
  | 'invoices'
  | 'custom_groups'
  | 'cancellation_fee'

export type VisitKey = 'clients' | 'services' | 'jobs' | 'map' | 'invoices'
export type LaunchKind = 'add_client' | 'add_service' | 'add_job' | 'add_subscription'

export type GuideStep = {
  id: string
  area: StepArea
  titleKey: string
  title: string
  howToKey: string
  howTo: string
  ctaKey: string
  cta: string
  countKey?: CountKey
  target?: number
  visitKey?: VisitKey
  launch?: LaunchKind
  href?: (slug: string) => string
  goAfter?: boolean
}

export type Guide = {
  id: string
  titleKey: string
  title: string
  blurbKey: string
  blurb: string
  /** Where "Start guide" sends the user. */
  startHref: (slug: string) => string
  steps: GuideStep[]
}

/** @deprecated Prefer Guide / GuideStep */
export type Mission = Guide
export type MissionStep = GuideStep
export type RoadmapStep = GuideStep

export const GUIDES: Guide[] = [
  {
    id: 'get_started',
    titleKey: 'guide.getStarted.title',
    title: 'Get started!',
    blurbKey: 'guide.getStarted.blurb',
    blurb: 'Clients, services and your first job — the basics before everything else.',
    startHref: (slug) => `/${slug}/clients`,
    steps: [
      {
        id: 'client_first',
        area: 'clients',
        titleKey: 'roadmap.clientFirst.title',
        title: 'Create your first client',
        howToKey: 'roadmap.clientFirst.howTo',
        howTo:
          'Go to the [[link:clients|clients page]] and click [[btn:+ New client]]. Fill in the client’s name and location — you can add more details, but name and location are the only requirements.',
        ctaKey: 'roadmap.cta.addClient',
        cta: '+ New client',
        countKey: 'clients',
        target: 1,
        launch: 'add_client',
        href: (slug) => `/${slug}/clients`,
        goAfter: true,
      },
      {
        id: 'service_first',
        area: 'services',
        titleKey: 'roadmap.serviceFirst.title',
        title: 'Add your first service',
        howToKey: 'roadmap.serviceFirst.howTo',
        howTo:
          'Open **Items**, then **Add item** — give it a name, price and duration so jobs can use it.',
        ctaKey: 'roadmap.cta.addService',
        cta: 'Add service',
        countKey: 'services',
        target: 1,
        launch: 'add_service',
        href: (slug) => `/${slug}/services`,
        goAfter: true,
      },
      {
        id: 'job_first',
        area: 'jobs',
        titleKey: 'roadmap.jobFirst.title',
        title: 'Schedule your first job',
        howToKey: 'roadmap.jobFirst.howTo',
        howTo:
          'Choose a client, pick a service and a **date**, then save. You will land on **Schedule** on that week.',
        ctaKey: 'roadmap.cta.addJob',
        cta: 'Add job',
        countKey: 'jobs',
        target: 1,
        launch: 'add_job',
        href: (slug) => `/${slug}/jobs`,
        goAfter: true,
      },
    ],
  },
  {
    id: 'route_planning',
    titleKey: 'guide.routePlanning.title',
    title: 'Route planning',
    blurbKey: 'guide.routePlanning.blurb',
    blurb: 'Fill a day with jobs, then plan and save the driving order.',
    startHref: (slug) => `/${slug}/jobs`,
    steps: [
      {
        id: 'jobs_same_day',
        area: 'jobs',
        titleKey: 'roadmap.jobsSameDay.title',
        title: 'Schedule 4 jobs on one day',
        howToKey: 'roadmap.jobsSameDay.howTo',
        howTo:
          'On **Schedule**, add jobs that share the **same date** until you have four on that day — the counter tracks your fullest day.',
        ctaKey: 'roadmap.cta.addJob',
        cta: 'Add job',
        countKey: 'jobs_same_day',
        target: 4,
        launch: 'add_job',
        href: (slug) => `/${slug}/jobs`,
        goAfter: true,
      },
      {
        id: 'route_first',
        area: 'routes',
        titleKey: 'roadmap.routeFirst.title',
        title: 'Save a planned route',
        howToKey: 'roadmap.routeFirst.howTo',
        howTo:
          'On **Schedule**, open a busy day and click **Plan route**. Adjust the order if you like, then **Save** so the route is stored.',
        ctaKey: 'roadmap.cta.planRoute',
        cta: 'Open schedule',
        countKey: 'routes',
        target: 1,
        href: (slug) => `/${slug}/jobs`,
      },
    ],
  },
  {
    id: 'invoicing',
    titleKey: 'guide.invoicing.title',
    title: 'Invoicing',
    blurbKey: 'guide.invoicing.blurb',
    blurb: 'Finish work on the schedule, then turn it into an invoice.',
    startHref: (slug) => `/${slug}/invoices`,
    steps: [
      {
        id: 'job_complete',
        area: 'jobs',
        titleKey: 'roadmap.jobComplete.title',
        title: 'Complete a job',
        howToKey: 'roadmap.jobComplete.howTo',
        howTo:
          'Open **Schedule**, click a job to open the slideout, then tap **Complete** in the top right — completed work is what you can invoice.',
        ctaKey: 'roadmap.cta.goSchedule',
        cta: 'Open schedule',
        countKey: 'completed_jobs',
        target: 1,
        href: (slug) => `/${slug}/jobs`,
      },
      {
        id: 'invoice_first',
        area: 'invoices',
        titleKey: 'roadmap.invoiceFirst.title',
        title: 'Create an invoice',
        howToKey: 'roadmap.invoiceFirst.howTo',
        howTo:
          'Open **Invoices** → **New invoice**, pick a client and add completed work, then create the invoice.',
        ctaKey: 'roadmap.cta.createInvoice',
        cta: 'Create invoice',
        countKey: 'invoices',
        target: 1,
        href: (slug) => `/${slug}/invoices/new`,
      },
    ],
  },
  {
    id: 'subscriptions',
    titleKey: 'guide.subscriptions.title',
    title: 'Subscriptions',
    blurbKey: 'guide.subscriptions.blurb',
    blurb: 'Set up recurring visits so jobs appear on the schedule automatically.',
    startHref: (slug) => `/${slug}/jobs`,
    steps: [
      {
        id: 'subscription_first',
        area: 'jobs',
        titleKey: 'roadmap.subscriptionFirst.title',
        title: 'Create a subscription',
        howToKey: 'roadmap.subscriptionFirst.howTo',
        howTo:
          'On **Schedule**, add a job and choose **Recurring**, or start a new subscription — future visits are generated for you.',
        ctaKey: 'roadmap.cta.addSubscription',
        cta: 'New subscription',
        countKey: 'subscriptions',
        target: 1,
        launch: 'add_subscription',
        href: (slug) => `/${slug}/jobs`,
        goAfter: true,
      },
    ],
  },
]

/** Alias used across the app / refresh helpers. */
export const MISSIONS = GUIDES

export const ROADMAP_STEPS: GuideStep[] = GUIDES.flatMap((g) => g.steps)
export const STEP_IDS = ROADMAP_STEPS.map((s) => s.id)
export const GUIDE_IDS = GUIDES.map((g) => g.id)
export const MISSION_IDS = GUIDE_IDS

export type StepCounts = Partial<Record<CountKey, number>>
export type StepVisits = Partial<Record<VisitKey, boolean>>

export function isStepDone(step: GuideStep, counts: StepCounts, visits: StepVisits): boolean {
  if (step.visitKey) return visits[step.visitKey] === true
  if (step.countKey) return (counts[step.countKey] || 0) >= (step.target || 1)
  return false
}

export function stepCount(step: GuideStep, counts: StepCounts) {
  const target = step.target || 1
  const have = step.countKey ? counts[step.countKey] || 0 : 0
  return { have: Math.min(have, target), target }
}

export function guideStepsDone(
  guide: Guide,
  counts: StepCounts,
  visits: StepVisits,
  skippedSteps: Set<string>,
) {
  const remaining = guide.steps.filter((s) => !skippedSteps.has(s.id))
  const done = remaining.filter((s) => isStepDone(s, counts, visits)).length
  return { done, total: remaining.length, complete: remaining.length > 0 && done >= remaining.length }
}

/** @deprecated Prefer guideStepsDone */
export const missionStepsDone = guideStepsDone

export function isGuideComplete(
  guide: Guide,
  counts: StepCounts,
  visits: StepVisits,
  skippedSteps: Set<string>,
) {
  return guideStepsDone(guide, counts, visits, skippedSteps).complete
}

/** @deprecated Prefer isGuideComplete */
export const isMissionComplete = isGuideComplete

/**
 * Only returns a guide the user has explicitly started.
 * null / '' means nothing is active (dashboard hub — pick a guide).
 */
export function resolveActiveGuideId(
  preferred: string | null | undefined,
  counts: StepCounts,
  visits: StepVisits,
  skippedSteps: Set<string>,
  skippedGuides: Set<string>,
): string | null {
  if (preferred == null || preferred === '') return null
  if (!GUIDE_IDS.includes(preferred) || skippedGuides.has(preferred)) return null
  const g = GUIDES.find((x) => x.id === preferred)!
  if (isGuideComplete(g, counts, visits, skippedSteps)) return null
  return preferred
}

/** @deprecated Prefer resolveActiveGuideId */
export function resolveActiveMissionId(
  preferred: string | null | undefined,
  counts: StepCounts,
  visits: StepVisits,
  skippedSteps: Set<string>,
  skippedMissions: Set<string>,
) {
  return resolveActiveGuideId(preferred, counts, visits, skippedSteps, skippedMissions)
}

export function nextAvailableMission(): null {
  return null
}

export const MISSIONS_REFRESH_EVENT = 'pathpilo:missions-refresh'

export function requestMissionsRefresh() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(MISSIONS_REFRESH_EVENT))
}

export const PATH_TO_VISIT: Record<string, VisitKey> = {
  clients: 'clients',
  services: 'services',
  jobs: 'jobs',
  map: 'map',
  invoices: 'invoices',
}
