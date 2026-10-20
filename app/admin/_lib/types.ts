export interface ActivityEvent {
  id: number
  at: string
  event: string
  label: string | null
  props: Record<string, unknown> | null
  source: string
  entityType: string | null
  entityId: string | null
  anonymousId: string | null
  user: { id: number; name: string; email: string } | null
  company: { id: number; name: string; slug: string } | null
}

export interface EventPage {
  events: ActivityEvent[]
  nextBefore: string | null
}

export interface DayCell {
  day: string
  actions: number
  sessions: number
  events: number
}

export type PersonStage =
  | 'email' | 'details' | 'verify'
  | 'company' | 'goals' | 'onboarded' | 'activated'
  | 'team' | 'no_company'

export interface Person {
  key: string
  kind: 'user' | 'signup'
  id: number
  name: string
  email: string
  company: { id: number; name: string; slug: string; plan: string } | null
  role: string | null
  stage: PersonStage
  hasClient: boolean
  hasJob: boolean
  signedUpAt: string
  lastActiveAt: string | null
  actions7d: number
  actions30d: number
  sessions30d: number
  activeDays30d: number
}

export type CompanyHealth = 'in_setup' | 'new' | 'active' | 'at_risk' | 'dormant'

export interface CompanyRow {
  id: number
  name: string
  slug: string
  industry: string | null
  createdAt: string
  plan: string
  hasStripeSubscription: boolean
  expiresAt: string | null
  suspendedAt: string | null
  onboardingCompleted: boolean
  onboardingStep: string | null
  owner: { id: number; name: string; email: string } | null
  counts: {
    members: number; clients: number; clients30d: number
    jobs: number; jobsManual: number; jobsCompleted: number; jobs30d: number
    invoices: number; offers: number; subscriptions: number
  }
  activity: {
    actions7d: number; actions30d: number; activeDays7d: number; activeDays30d: number
    activeUsers30d: number; lastActiveAt: string | null
    cells: Array<{ a: number; e: number }>
  }
  health: CompanyHealth
}
