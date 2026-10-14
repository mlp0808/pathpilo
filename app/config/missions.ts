/**
 * Onboarding guides: topic groups the owner can start one at a time.
 * Completion is derived from live counts; active/skipped state lives on the company.
 * howTo strings may use **bold** for UI labels.
 */

export type StepArea =
  | 'clients'
  | 'services'
  | 'jobs'
  | 'routes'
  | 'invoices'
  | 'pipeline'
  | 'team'
  | 'settings'

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
  | 'invoices_sent'
  | 'custom_groups'
  | 'cancellation_fee'
  | 'lead_form_enabled'
  | 'leads'
  | 'leads_handled'
  | 'offers_sent'
  | 'offers_accepted'
  | 'bookings_confirmed'
  | 'pro_access'
  | 'team_members'
  | 'team_assigned_jobs'

export type VisitKey =
  | 'clients'
  | 'services'
  | 'jobs'
  | 'map'
  | 'invoices'
  | 'pipeline'
  | 'offers'
  | 'team'
  | 'invoice_settings'
  | 'notifications_settings'

export type LaunchKind =
  | 'add_client'
  | 'add_service'
  | 'add_job'
  | 'add_subscription'
  /** Opens the 14-day free trial (card required, charged after the trial). */
  | 'start_trial'

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
    id: 'win_work',
    titleKey: 'guide.winWork.title',
    title: 'Win new work',
    blurbKey: 'guide.winWork.blurb',
    blurb: 'Collect requests with your lead form, work them in the pipeline and send an offer.',
    startHref: (slug) => `/${slug}/settings/leads-form`,
    steps: [
      {
        id: 'lead_form_on',
        area: 'pipeline',
        titleKey: 'roadmap.leadFormOn.title',
        title: 'Turn on your lead form',
        howToKey: 'roadmap.leadFormOn.howTo',
        howTo:
          'Open **Settings** → **Lead form**, tweak the fields you want, and switch the form **On**. Then copy the link or embed it on your website.',
        ctaKey: 'roadmap.cta.openLeadForm',
        cta: 'Open lead form',
        countKey: 'lead_form_enabled',
        target: 1,
        href: (slug) => `/${slug}/settings/leads-form`,
      },
      {
        id: 'lead_first',
        area: 'pipeline',
        titleKey: 'roadmap.leadFirst.title',
        title: 'Get your first lead',
        howToKey: 'roadmap.leadFirst.howTo',
        howTo:
          'Submit your own form once to see how it feels, or add one by hand from **Pipeline**. New requests land in the **New** column and ring the bell.',
        ctaKey: 'roadmap.cta.openPipeline',
        cta: 'Open pipeline',
        countKey: 'leads',
        target: 1,
        href: (slug) => `/${slug}/pipeline`,
      },
      {
        id: 'lead_handled',
        area: 'pipeline',
        titleKey: 'roadmap.leadHandled.title',
        title: 'Work a lead in the pipeline',
        howToKey: 'roadmap.leadHandled.howTo',
        howTo:
          'Open a lead in **Pipeline** and move it forward — mark it **Contacted**, send a quote, or convert it into a client.',
        ctaKey: 'roadmap.cta.openPipeline',
        cta: 'Open pipeline',
        countKey: 'leads_handled',
        target: 1,
        href: (slug) => `/${slug}/pipeline`,
      },
      {
        id: 'offer_sent',
        area: 'pipeline',
        titleKey: 'roadmap.offerSent.title',
        title: 'Send an offer',
        howToKey: 'roadmap.offerSent.howTo',
        howTo:
          'Click **New offer**, pick a client or lead, add services and a few suggested days, then **Send**. You’ll see when they open it.',
        ctaKey: 'roadmap.cta.newOffer',
        cta: 'New offer',
        countKey: 'offers_sent',
        target: 1,
        href: (slug) => `/${slug}/offers?new=1`,
      },
    ],
  },
  {
    id: 'book_deliver',
    titleKey: 'guide.bookDeliver.title',
    title: 'Book & deliver',
    blurbKey: 'guide.bookDeliver.blurb',
    blurb: 'Turn an accepted offer into a confirmed job on your schedule.',
    startHref: (slug) => `/${slug}/pipeline`,
    steps: [
      {
        id: 'offer_accepted',
        area: 'pipeline',
        titleKey: 'roadmap.offerAccepted.title',
        title: 'Get an offer accepted',
        howToKey: 'roadmap.offerAccepted.howTo',
        howTo:
          'Open a sent offer and use **Copy link** — open it like a customer would and **accept a day**. A real client works the same way.',
        ctaKey: 'roadmap.cta.openOffers',
        cta: 'Open offers',
        countKey: 'offers_accepted',
        target: 1,
        href: (slug) => `/${slug}/offers`,
      },
      {
        id: 'booking_confirmed',
        area: 'pipeline',
        titleKey: 'roadmap.bookingConfirmed.title',
        title: 'Confirm the booking',
        howToKey: 'roadmap.bookingConfirmed.howTo',
        howTo:
          'In **Pipeline**, find the accepted offer and press **Verify** (or **Change day**). Confirming puts the job on your schedule for real.',
        ctaKey: 'roadmap.cta.openPipeline',
        cta: 'Open pipeline',
        countKey: 'bookings_confirmed',
        target: 1,
        href: (slug) => `/${slug}/pipeline`,
      },
    ],
  },
  {
    id: 'subscriptions',
    titleKey: 'guide.subscriptions.title',
    title: 'Recurring work',
    blurbKey: 'guide.subscriptions.blurb',
    blurb: 'Set up subscriptions and rounds so repeat visits fill your schedule automatically.',
    startHref: (slug) => `/${slug}/recurring/subscriptions`,
    steps: [
      {
        id: 'subscription_first',
        area: 'jobs',
        titleKey: 'roadmap.subscriptionFirst.title',
        title: 'Create a subscription',
        howToKey: 'roadmap.subscriptionFirst.howTo',
        howTo:
          'Open **Recurring** in the menu, then **Subscriptions**. Click **Create subscription**, pick a client and service, set the schedule, then create — future visits appear on the schedule automatically.',
        ctaKey: 'roadmap.cta.addSubscription',
        cta: 'Create subscription',
        countKey: 'subscriptions',
        target: 1,
        href: (slug) => `/${slug}/recurring/subscriptions?create=1`,
        goAfter: true,
      },
      {
        id: 'round_first',
        area: 'routes',
        titleKey: 'roadmap.roundFirst.title',
        title: 'Create a round',
        howToKey: 'roadmap.roundFirst.howTo',
        howTo:
          'Open **Recurring** → **Rounds** and click **Create round**. A round is a reusable set of stops you can place on any day — great for neighbourhood routes.',
        ctaKey: 'roadmap.cta.openRounds',
        cta: 'Open rounds',
        countKey: 'rounds',
        target: 1,
        href: (slug) => `/${slug}/recurring/rounds`,
      },
    ],
  },
  {
    id: 'route_planning',
    titleKey: 'guide.routePlanning.title',
    title: 'Route planning',
    blurbKey: 'guide.routePlanning.blurb',
    blurb: 'Fill a day with jobs, plan and save the driving order, then see it on the map.',
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
      {
        id: 'map_look',
        area: 'routes',
        titleKey: 'roadmap.mapLook.title',
        title: 'Explore the map',
        howToKey: 'roadmap.mapLook.howTo',
        howTo:
          'Open the **Map** to see clients and jobs by location. Search an address, tap a pin, and spot gaps between your stops.',
        ctaKey: 'roadmap.cta.openMap',
        cta: 'Open map',
        visitKey: 'map',
        href: (slug) => `/${slug}/map`,
      },
    ],
  },
  {
    id: 'team',
    titleKey: 'guide.team.title',
    title: 'Teams & employees',
    blurbKey: 'guide.team.blurb',
    blurb: 'Start a 14-day free trial, invite employees and assign them jobs.',
    startHref: (slug) => `/${slug}/team`,
    steps: [
      {
        id: 'team_trial',
        area: 'team',
        titleKey: 'roadmap.teamTrial.title',
        title: 'Start your 14-day free trial',
        howToKey: 'roadmap.teamTrial.howTo',
        howTo:
          'Team features are on the Company plan. Add a card to start — **you pay nothing today**. After 14 days your card is charged automatically; change or cancel anytime in billing.',
        ctaKey: 'roadmap.cta.startTrial',
        cta: 'Start free trial',
        countKey: 'pro_access',
        target: 1,
        launch: 'start_trial',
        href: (slug) => `/${slug}/team`,
      },
      {
        id: 'team_invite',
        area: 'team',
        titleKey: 'roadmap.teamInvite.title',
        title: 'Invite your first employee',
        howToKey: 'roadmap.teamInvite.howTo',
        howTo:
          'On **Team**, click **Invite employee**, add their email and role. They get a link to join your workspace.',
        ctaKey: 'roadmap.cta.openTeam',
        cta: 'Open team',
        countKey: 'team_members',
        target: 1,
        href: (slug) => `/${slug}/team`,
      },
      {
        id: 'team_assign',
        area: 'team',
        titleKey: 'roadmap.teamAssign.title',
        title: 'Assign a job to your team',
        howToKey: 'roadmap.teamAssign.howTo',
        howTo:
          'When you create or open a job on **Schedule**, choose an **employee**. Use the day view to see each person’s route side by side.',
        ctaKey: 'roadmap.cta.addJob',
        cta: 'Add job',
        countKey: 'team_assigned_jobs',
        target: 1,
        launch: 'add_job',
        href: (slug) => `/${slug}/jobs`,
        goAfter: true,
      },
    ],
  },
  {
    id: 'invoicing',
    titleKey: 'guide.invoicing.title',
    title: 'Invoicing',
    blurbKey: 'guide.invoicing.blurb',
    blurb: 'Set up your invoice look, finish work on the schedule, then invoice and send.',
    startHref: (slug) => `/${slug}/invoices`,
    steps: [
      {
        id: 'invoice_settings',
        area: 'settings',
        titleKey: 'roadmap.invoiceSettings.title',
        title: 'Set up your invoice details',
        howToKey: 'roadmap.invoiceSettings.howTo',
        howTo:
          'Open **Settings** → **Invoices** to add payment details, numbering and terms. Add your logo under **Business** so invoices look like yours.',
        ctaKey: 'roadmap.cta.openInvoiceSettings',
        cta: 'Open invoice settings',
        visitKey: 'invoice_settings',
        href: (slug) => `/${slug}/settings/invoices`,
      },
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
      {
        id: 'invoice_sent',
        area: 'invoices',
        titleKey: 'roadmap.invoiceSent.title',
        title: 'Send an invoice',
        howToKey: 'roadmap.invoiceSent.howTo',
        howTo:
          'Open the invoice, check the preview, and press **Send**. Your client gets a link they can pay from, and you can track the status.',
        ctaKey: 'roadmap.cta.openInvoices',
        cta: 'Open invoices',
        countKey: 'invoices_sent',
        target: 1,
        href: (slug) => `/${slug}/invoices`,
      },
    ],
  },
  {
    id: 'level_up',
    titleKey: 'guide.levelUp.title',
    title: 'Level up',
    blurbKey: 'guide.levelUp.blurb',
    blurb: 'Organise your catalogue, protect your time with fees, and automate reminders.',
    startHref: (slug) => `/${slug}/services`,
    steps: [
      {
        id: 'custom_group',
        area: 'services',
        titleKey: 'roadmap.customGroup.title',
        title: 'Create a custom group',
        howToKey: 'roadmap.customGroup.howTo',
        howTo:
          'On **Items**, click **New group**, name it, and organise services the way your team works.',
        ctaKey: 'roadmap.cta.newGroup',
        cta: 'New group',
        countKey: 'custom_groups',
        target: 1,
        href: (slug) => `/${slug}/services`,
      },
      {
        id: 'cancellation_fee',
        area: 'services',
        titleKey: 'roadmap.cancellationFee.title',
        title: 'Set up a cancellation fee',
        howToKey: 'roadmap.cancellationFee.howTo',
        howTo:
          'On **Items**, find **Cancellation fee** and turn the switch **Enabled**, then set the amount if you like.',
        ctaKey: 'roadmap.cta.goItems',
        cta: 'Go to items',
        countKey: 'cancellation_fee',
        target: 1,
        href: (slug) => `/${slug}/services`,
      },
      {
        id: 'notifications_look',
        area: 'settings',
        titleKey: 'roadmap.notificationsLook.title',
        title: 'Review client messages',
        howToKey: 'roadmap.notificationsLook.howTo',
        howTo:
          'Open **Settings** → **Notifications** to choose which reminders and confirmations your clients get by email or SMS.',
        ctaKey: 'roadmap.cta.openNotifications',
        cta: 'Open notifications',
        visitKey: 'notifications_settings',
        href: (slug) => `/${slug}/settings/notifications`,
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

/**
 * Pages that count as "visited" for visit-based steps. Keys are the first path
 * segment after the company slug, or `segment/sub` for settings pages.
 */
export const PATH_TO_VISIT: Record<string, VisitKey> = {
  clients: 'clients',
  services: 'services',
  jobs: 'jobs',
  map: 'map',
  invoices: 'invoices',
  pipeline: 'pipeline',
  offers: 'offers',
  team: 'team',
  'settings/invoices': 'invoice_settings',
  'settings/notifications': 'notifications_settings',
}
