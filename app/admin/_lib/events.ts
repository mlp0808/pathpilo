import type { ActivityEvent } from './types'

const LABELS: Record<string, string> = {
  'signup.form_viewed': 'Opened the signup form',
  'signup.returned': 'Came back to finish signing up',
  'signup.name_entered': 'Entered name',
  'signup.email_entered': 'Entered email',
  'signup.details_entered': 'Entered name and password',
  'signup.code_sent': 'Requested verification code',
  'signup.email_verified': 'Verified email',
  'signup.account_created': 'Created account',
  'signup.guest_route_claimed': 'Imported a route from the free planner',
  'team.joined': 'Joined a team via invite',
  'session.started': 'Started a session',
  'auth.login': 'Logged in',
  'page.viewed': 'Viewed page',
  'onboarding.step_completed': 'Finished company details',
  'onboarding.completed': 'Finished setup',
  'onboarding.plan_selected': 'Picked a plan',
  'job.created': 'Created a job',
  'job.updated': 'Edited a job',
  'job.deleted': 'Deleted a job',
  'job.status_changed': 'Changed job status',
  'job.started': 'Started a job',
  'job.completed': 'Completed a job',
  'job.on_my_way_sent': 'Sent "on my way"',
  'job.rescheduled': 'Rescheduled a job',
  'job.assigned': 'Assigned a job',
  'job.note_added': 'Added a job note',
  'job.service_added': 'Added a service to a job',
  'route.reordered': 'Reordered the route',
  'route.optimized': 'Optimized a day route',
  'route.week_optimized': 'Optimized a week',
  'route.week_applied': 'Applied a planned week',
  'client.created': 'Added a client',
  'client.updated': 'Edited a client',
  'client.deleted': 'Deleted a client',
  'client.secure_note_added': 'Added a secure note',
  'offer.created': 'Created an offer',
  'offer.updated': 'Edited an offer',
  'offer.sent': 'Sent an offer',
  'offer.confirmed': 'Confirmed an offer',
  'offer.archived': 'Archived an offer',
  'offer.restored': 'Restored an offer',
  'offer.deleted': 'Deleted an offer',
  'invoice.created': 'Created an invoice',
  'invoice.updated': 'Edited an invoice',
  'invoice.sent': 'Sent an invoice',
  'invoice.status_changed': 'Changed invoice status',
  'invoice.reminder_sent': 'Sent a payment reminder',
  'invoice.payment_recorded': 'Recorded a payment',
  'invoice.deleted': 'Deleted an invoice',
  'subscription.created': 'Created a subscription',
  'subscription.updated': 'Edited a subscription',
  'subscription.deleted': 'Deleted a subscription',
  'subscription.paused': 'Paused a subscription',
  'subscription.resumed': 'Resumed a subscription',
  'service.created': 'Added a service',
  'service.updated': 'Edited a service',
  'service.deleted': 'Deleted a service',
  'round.created': 'Created a round',
  'round.updated': 'Edited a round',
  'round.deleted': 'Deleted a round',
  'round.stop_added': 'Added a stop to a round',
  'round.saved': 'Saved a round',
  'round.scheduled': 'Scheduled a round',
  'round_template.created': 'Created a round template',
  'lead.created': 'Added a lead',
  'lead.updated': 'Edited a lead',
  'lead.converted': 'Converted a lead',
  'lead.deleted': 'Deleted a lead',
  'settings.business_updated': 'Updated business settings',
  'settings.logo_uploaded': 'Uploaded a logo',
  'settings.logo_removed': 'Removed the logo',
  'settings.invoice_options_updated': 'Updated invoice options',
  'settings.workspace_url_updated': 'Changed workspace URL',
  'settings.lead_form_updated': 'Updated the lead form',
  'settings.email_templates_updated': 'Updated email templates',
  'settings.work_hours_updated': 'Updated work hours',
  'settings.profile_updated': 'Updated their profile',
  'settings.integration_updated': 'Updated an integration',
  'settings.cancellation_fee_updated': 'Updated cancellation fee',
  'team.invite_sent': 'Invited a team member',
  'team.invite_resent': 'Resent an invite',
  'team.invite_cancelled': 'Cancelled an invite',
  'team.invite_accepted': 'Accepted an invite',
  'team.member_removed': 'Removed a team member',
  'getting_started.mission_selected': 'Picked a getting-started task',
  'getting_started.mission_skipped': 'Skipped a getting-started task',
  'getting_started.skipped': 'Skipped getting started',
  'getting_started.dismissed': 'Dismissed getting started',
  'billing.checkout_started': 'Opened checkout',
  'billing.subscribed': 'Subscribed (paid)',
  'billing.cancelled': 'Cancelled subscription',
  'billing.resumed': 'Resumed subscription',
  'billing.portal_opened': 'Opened billing portal',
  'billing.sms_checkout_started': 'Opened SMS checkout',
  'billing.sms_subscribed': 'Subscribed to SMS',
  'billing.sms_cancelled': 'Cancelled SMS',
  'feature.used': 'Used a feature',
}

export interface CategoryStyle {
  label: string
  dot: string
  chip: string
}

const CATEGORIES: Record<string, CategoryStyle> = {
  signup:          { label: 'Signup',        dot: 'bg-violet-500',  chip: 'bg-violet-50 text-violet-700 ring-violet-200' },
  onboarding:      { label: 'Onboarding',    dot: 'bg-violet-500',  chip: 'bg-violet-50 text-violet-700 ring-violet-200' },
  getting_started: { label: 'Onboarding',    dot: 'bg-violet-400',  chip: 'bg-violet-50 text-violet-700 ring-violet-200' },
  session:         { label: 'Session',       dot: 'bg-sky-500',     chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
  auth:            { label: 'Login',         dot: 'bg-sky-500',     chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
  page:            { label: 'Page',          dot: 'bg-gray-300',    chip: 'bg-gray-50 text-gray-500 ring-gray-200' },
  job:             { label: 'Jobs',          dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  route:           { label: 'Routes',        dot: 'bg-cyan-500',    chip: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  round:           { label: 'Rounds',        dot: 'bg-cyan-500',    chip: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  round_template:  { label: 'Rounds',        dot: 'bg-cyan-500',    chip: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  daily_route:     { label: 'Routes',        dot: 'bg-cyan-500',    chip: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  client:          { label: 'Clients',       dot: 'bg-teal-500',    chip: 'bg-teal-50 text-teal-700 ring-teal-200' },
  lead:            { label: 'Leads',         dot: 'bg-orange-500',  chip: 'bg-orange-50 text-orange-700 ring-orange-200' },
  offer:           { label: 'Offers',        dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
  invoice:         { label: 'Invoices',      dot: 'bg-rose-500',    chip: 'bg-rose-50 text-rose-700 ring-rose-200' },
  subscription:    { label: 'Subscriptions', dot: 'bg-indigo-500',  chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  service:         { label: 'Services',      dot: 'bg-lime-500',    chip: 'bg-lime-50 text-lime-700 ring-lime-200' },
  settings:        { label: 'Settings',      dot: 'bg-slate-400',   chip: 'bg-slate-50 text-slate-600 ring-slate-200' },
  team:            { label: 'Team',          dot: 'bg-pink-500',    chip: 'bg-pink-50 text-pink-700 ring-pink-200' },
  billing:         { label: 'Billing',       dot: 'bg-yellow-500',  chip: 'bg-yellow-50 text-yellow-800 ring-yellow-200' },
}

const FALLBACK: CategoryStyle = { label: 'Other', dot: 'bg-gray-400', chip: 'bg-gray-50 text-gray-600 ring-gray-200' }

export function eventCategory(event: string): CategoryStyle {
  return CATEGORIES[event.split('.')[0]] || FALLBACK
}

export function eventLabel(event: string): string {
  if (LABELS[event]) return LABELS[event]
  const [resource, action = ''] = event.split('.')
  const words = `${resource.replace(/_/g, ' ')} ${action.replace(/_/g, ' ')}`.trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Second line under an event: what it was about. */
export function eventDetail(e: ActivityEvent): string | null {
  const p = e.props || {}
  const parts: string[] = []
  if (e.event === 'page.viewed' && p.path) return String(p.path)
  if (e.event === 'session.started') {
    if (p.landing) parts.push(`landed on ${p.landing}`)
    if (typeof p.idleMinutes === 'number') parts.push(`after ${formatIdle(p.idleMinutes)} away`)
    return parts.join(' · ') || null
  }
  if (e.event === 'signup.returned' && typeof p.idleHours === 'number') {
    return `${formatIdle(p.idleHours * 60)} after last step${p.lastStep ? ` (${String(p.lastStep).replace(/_/g, ' ')})` : ''}`
  }
  if (e.label && !e.event.startsWith('signup.')) parts.push(e.label)
  if (p.status) parts.push(`→ ${p.status}`)
  if (p.step) parts.push(`step: ${p.step}`)
  if (p.plan) parts.push(`plan: ${p.plan}`)
  if (p.provider) parts.push(String(p.provider))
  if (Array.isArray(p.usageGoals) && p.usageGoals.length) parts.push(`goals: ${p.usageGoals.join(', ')}`)
  return parts.join(' · ') || null
}

export function formatIdle(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 48) return `${Math.round(hours)} h`
  return `${Math.round(hours / 24)} days`
}

export const STAGES: Record<string, { label: string; chip: string; order: number }> = {
  email:      { label: 'Entered email',  chip: 'bg-violet-50 text-violet-700 ring-violet-200', order: 1 },
  details:    { label: 'Entered details', chip: 'bg-violet-50 text-violet-700 ring-violet-200', order: 2 },
  verify:     { label: 'Verifying email', chip: 'bg-violet-50 text-violet-700 ring-violet-200', order: 3 },
  company:    { label: 'Company details', chip: 'bg-sky-50 text-sky-700 ring-sky-200', order: 4 },
  goals:      { label: 'Usage goals',    chip: 'bg-sky-50 text-sky-700 ring-sky-200', order: 5 },
  onboarded:  { label: 'Set up, no jobs yet', chip: 'bg-gray-100 text-gray-700 ring-gray-200', order: 6 },
  activated:  { label: 'Using it',       chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', order: 7 },
  team:       { label: 'Team member',    chip: 'bg-pink-50 text-pink-700 ring-pink-200', order: 8 },
  no_company: { label: 'No company',     chip: 'bg-gray-100 text-gray-500 ring-gray-200', order: 9 },
}

export const HEALTH: Record<string, { label: string; chip: string; hint: string }> = {
  active:   { label: 'Active',   chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', hint: 'Used it on 2+ days this week' },
  new:      { label: 'New',      chip: 'bg-sky-50 text-sky-700 ring-sky-200',             hint: 'Signed up in the last 7 days' },
  at_risk:  { label: 'At risk',  chip: 'bg-amber-50 text-amber-700 ring-amber-200',       hint: 'Active this month, quiet this week' },
  dormant:  { label: 'Dormant',  chip: 'bg-gray-100 text-gray-600 ring-gray-200',         hint: 'No activity in 30 days' },
  in_setup: { label: 'In setup', chip: 'bg-violet-50 text-violet-700 ring-violet-200',    hint: 'Has not finished onboarding' },
}
