'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BoltIcon,
  BookOpenIcon,
  CheckIcon,
  EyeIcon,
  FlagIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '@/app/utils/api'
import { eventLabel } from '../_lib/events'

type Kind = 'read' | 'action' | 'milestone' | 'page'

interface CatalogAction {
  event: string
  routes: string[]
  companies: number
}

interface Catalog {
  countKeys: string[]
  visitKeys: string[]
  actions: CatalogAction[]
}

interface Option {
  /** `''`, `event:x`, `count:key` or `visit:key`. */
  id: string
  kind: Kind
  topic: string
  label: string
  detail: string
  usage: number
  haystack: string
}

const TOPIC_ORDER = [
  'Clients',
  'Jobs',
  'Routes & map',
  'Rounds',
  'Subscriptions',
  'Invoices',
  'Sales',
  'Items',
  'Team',
  'Settings',
  'Billing',
  'Setup',
  'Other',
]

const EVENT_TOPICS: Record<string, string> = {
  client: 'Clients',
  job: 'Jobs',
  route: 'Routes & map',
  daily_route: 'Routes & map',
  map: 'Routes & map',
  round: 'Rounds',
  round_template: 'Rounds',
  subscription: 'Subscriptions',
  invoice: 'Invoices',
  lead: 'Sales',
  offer: 'Sales',
  service: 'Items',
  item_group: 'Items',
  team: 'Team',
  invitation: 'Team',
  user: 'Team',
  leave: 'Team',
  appointment: 'Team',
  settings: 'Settings',
  company: 'Settings',
  integration: 'Settings',
  billing: 'Billing',
  stripe: 'Billing',
  onboarding: 'Setup',
  signup: 'Setup',
}

/** Names for actions the activity log has no label for yet. */
const EXTRA_LABELS: Record<string, string> = {
  'appointment.created': 'Requested time off',
  'appointment.updated': 'Edited a time-off request',
  'appointment.deleted': 'Deleted a time-off request',
  'appointment.approve': 'Approved time off',
  'appointment.decline': 'Declined time off',
  'client.secure_notes': 'Edited a secure note',
  'client.secure_notes_removed': 'Deleted a secure note',
  'company.created': 'Created a company',
  'company.updated': 'Updated company details',
  'daily_route.updated': 'Saved a day route',
  'daily_route.meta': 'Updated day route details',
  'daily_route.move': 'Moved a day route',
  'files.upload': 'Uploaded a file',
  'invitation.decline': 'Declined an invite',
  'invoice.invoice_reminder_removed': 'Turned off an invoice reminder',
  'item_group.created': 'Created an item group',
  'item_group.updated': 'Edited an item group',
  'item_group.deleted': 'Deleted an item group',
  'job.automation_cancel_removed': 'Turned an automatic job message back on',
  'job.notes_removed': 'Deleted a job note',
  'job.services': 'Edited a service on a job',
  'job.services_removed': 'Removed a service from a job',
  'job.services_status': 'Ticked off a service on a job',
  'leave.created': 'Added time off for someone',
  'leave.deleted': 'Removed time off',
  'round_template.updated': 'Edited a round template',
  'round_template.deleted': 'Deleted a round template',
  'round.calendar_cancel': 'Cancelled a round in the calendar',
  'round.calendar_move': 'Moved a round in the calendar',
  'round.stops_order': 'Reordered stops in a round',
  'round.stops_pause': 'Paused a stop in a round',
  'round.stops_removed': 'Removed a stop from a round',
  'service.restore': 'Restored an item',
  'service.created': 'Created an item',
  'service.updated': 'Edited an item',
  'service.deleted': 'Deleted an item',
  'stripe.confirm_card_update': 'Updated the payment card',
  'stripe.update_payment_method': 'Started updating the payment card',
  'user.deleted': 'Deleted a user',
}

const COUNT_LABELS: Record<string, [string, string]> = {
  clients: ['clients created', 'Clients'],
  services: ['items created', 'Items'],
  custom_groups: ['custom item groups', 'Items'],
  jobs: ['jobs created', 'Jobs'],
  jobs_same_day: ['jobs on one day', 'Jobs'],
  completed_jobs: ['jobs completed', 'Jobs'],
  subscriptions: ['subscriptions created', 'Subscriptions'],
  routes: ['routes planned', 'Routes & map'],
  rounds: ['rounds created', 'Rounds'],
  invoices: ['invoices created', 'Invoices'],
  invoices_sent: ['invoices sent', 'Invoices'],
  cancellation_fee: ['cancellation fee turned on', 'Settings'],
  lead_form_enabled: ['lead form turned on', 'Sales'],
  leads: ['leads received', 'Sales'],
  leads_handled: ['leads moved forward', 'Sales'],
  offers_sent: ['offers sent', 'Sales'],
  offers_accepted: ['offers accepted', 'Sales'],
  bookings_confirmed: ['bookings confirmed', 'Sales'],
  pro_access: ['Company plan active', 'Billing'],
  team_members: ['teammates invited', 'Team'],
  team_assigned_jobs: ['jobs assigned to a teammate', 'Team'],
}

const VISIT_LABELS: Record<string, [string, string]> = {
  clients: ['Clients page', 'Clients'],
  services: ['Items page', 'Items'],
  jobs: ['Schedule page', 'Jobs'],
  map: ['Map page', 'Routes & map'],
  invoices: ['Invoices page', 'Invoices'],
  pipeline: ['Pipeline page', 'Sales'],
  offers: ['Offers page', 'Sales'],
  team: ['Team page', 'Team'],
  invoice_settings: ['Invoice settings', 'Settings'],
  notifications_settings: ['Notification settings', 'Settings'],
}

const KIND_STYLE: Record<Kind, { label: string; icon: typeof BoltIcon; chip: string }> = {
  read: { label: 'Reading', icon: BookOpenIcon, chip: 'bg-gray-100 text-gray-600' },
  action: { label: 'Action', icon: BoltIcon, chip: 'bg-emerald-50 text-emerald-700' },
  milestone: { label: 'Milestone', icon: FlagIcon, chip: 'bg-indigo-50 text-indigo-700' },
  page: { label: 'Page visit', icon: EyeIcon, chip: 'bg-sky-50 text-sky-700' },
}

const READ_OPTION: Option = {
  id: '',
  kind: 'read',
  topic: 'General',
  label: 'Reading this step',
  detail: 'No action needed. Done once the user has seen it — for steps that only explain something.',
  usage: 0,
  haystack: 'reading read seen explain info no action none',
}

function actionLabel(event: string): string {
  return EXTRA_LABELS[event] || eventLabel(event)
}

function buildOptions(catalog: Catalog): Option[] {
  const options: Option[] = []
  for (const a of catalog.actions) {
    const topic = EVENT_TOPICS[a.event.split('.')[0]] || 'Other'
    const label = actionLabel(a.event)
    options.push({
      id: `event:${a.event}`,
      kind: 'action',
      topic,
      label,
      detail: [a.event, ...a.routes].join(' · '),
      usage: a.companies,
      haystack: `${label} ${a.event} ${a.routes.join(' ')} ${topic} action`.toLowerCase(),
    })
  }
  for (const key of catalog.countKeys) {
    const [label, topic] = COUNT_LABELS[key] || [key.replace(/_/g, ' '), 'Other']
    options.push({
      id: `count:${key}`,
      kind: 'milestone',
      topic,
      label: `The company has N ${label}`,
      detail: `${key} — counted from the company's data, so it also works for things done before the guide existed`,
      usage: 0,
      haystack: `${label} ${key} ${topic} milestone count has`.toLowerCase(),
    })
  }
  for (const key of catalog.visitKeys) {
    const [label, topic] = VISIT_LABELS[key] || [key.replace(/_/g, ' '), 'Other']
    options.push({
      id: `visit:${key}`,
      kind: 'page',
      topic,
      label: `Opens the ${label}`,
      detail: `visit:${key}`,
      usage: 0,
      haystack: `${label} ${key} ${topic} page visit opens`.toLowerCase(),
    })
  }
  const kindOrder: Record<Kind, number> = { read: 0, action: 1, milestone: 2, page: 3 }
  return options.sort(
    (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.label.localeCompare(b.label)
  )
}

/** Splits a stored trigger into the option it belongs to and its target count. */
function decode(value: string): { id: string; target: number } {
  if (!value) return { id: '', target: 1 }
  if (value.startsWith('event:') || value.startsWith('visit:')) return { id: value, target: 1 }
  const [key, target] = value.split('>=')
  return { id: `count:${key}`, target: Math.max(1, Number(target) || 1) }
}

function encode(id: string, target: number): string {
  if (id.startsWith('count:')) return `${id.slice(6)}>=${Math.max(1, target)}`
  return id
}

function KindChip({ kind }: { kind: Kind }) {
  const style = KIND_STYLE[kind]
  const Icon = style.icon
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${style.chip}`}>
      <Icon className="h-3 w-3" />
      {style.label}
    </span>
  )
}

/** Short description of a trigger, for the step list. */
export function triggerKind(value: string | null): Kind {
  if (!value) return 'read'
  if (value.startsWith('event:')) return 'action'
  if (value.startsWith('visit:')) return 'page'
  return 'milestone'
}

export function TriggerKindIcon({ value, className = 'h-3.5 w-3.5' }: { value: string | null; className?: string }) {
  const style = KIND_STYLE[triggerKind(value)]
  const Icon = style.icon
  return <Icon className={className} aria-label={style.label} />
}

let catalogCache: Promise<Catalog> | null = null
function loadCatalog(): Promise<Catalog> {
  if (!catalogCache) {
    catalogCache = fetch(apiUrl('/admin/guides/triggers'), {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load actions')
        return { countKeys: data.countKeys || [], visitKeys: data.visitKeys || [], actions: data.actions || [] }
      })
      .catch((e) => {
        catalogCache = null
        throw e
      })
  }
  return catalogCache
}

export default function TriggerPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('All')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load actions'))
  }, [])

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus())
  }, [open])

  const options = useMemo(() => (catalog ? buildOptions(catalog) : []), [catalog])
  const { id: currentId, target } = decode(value)
  const current =
    currentId === ''
      ? READ_OPTION
      : options.find((o) => o.id === currentId) || {
          ...READ_OPTION,
          id: currentId,
          kind: triggerKind(value),
          label: currentId.replace(/^(event|visit|count):/, ''),
          detail: catalog ? 'Not in the current catalog' : 'Loading…',
        }

  const topics = useMemo(() => {
    const present = new Set(options.map((o) => o.topic))
    return TOPIC_ORDER.filter((t) => present.has(t))
  }, [options])

  const groups = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    const matches = (o: Option) => tokens.every((t) => o.haystack.includes(t) || o.label.toLowerCase().includes(t))
    const list = [READ_OPTION, ...options].filter(
      (o) => (topic === 'All' || o.topic === topic || o.kind === 'read') && matches(o)
    )
    const byTopic = new Map<string, Option[]>()
    for (const o of list) byTopic.set(o.topic, [...(byTopic.get(o.topic) || []), o])
    return ['General', ...TOPIC_ORDER]
      .filter((t) => byTopic.has(t))
      .map((t) => [t, byTopic.get(t) as Option[]] as const)
  }, [options, query, topic])

  const choose = (option: Option) => {
    onChange(encode(option.id, option.id === currentId ? target : 1))
    setOpen(false)
    setQuery('')
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-semibold text-gray-600">Completes when…</span>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <KindChip kind={current.kind} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {current.kind === 'milestone' ? current.label.replace(' N ', ` ${target} `) : current.label}
          </p>
          <p className="truncate text-[11px] text-gray-400">
            {current.topic !== 'General' ? `${current.topic} · ` : ''}
            {current.detail}
          </p>
        </div>
        {current.kind === 'milestone' && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            N =
            <input
              type="number"
              min={1}
              value={target}
              onChange={(e) => onChange(encode(currentId, Math.max(1, Number(e.target.value) || 1)))}
              className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none focus:border-emerald-400"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          {open ? 'Close' : 'Change'}
        </button>
      </div>
      {current.kind === 'action' && (
        <p className="mt-1 text-[11px] text-gray-400">
          Counts from the moment the action is logged. Companies that did it before activity logging began will
          not have it — pick a milestone if that matters.
        </p>
      )}

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="space-y-2 border-b border-gray-100 p-2.5">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search every action, setting and page — e.g. invoice sent, logo, lead form"
                className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-emerald-400"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {['All', ...topics].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopic(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    topic === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto pb-1">
            {error && <p className="px-3 py-4 text-sm text-red-600">{error}</p>}
            {!catalog && !error && <p className="px-3 py-4 text-sm text-gray-400">Loading every action…</p>}
            {catalog && groups.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-gray-400">Nothing matches “{query}”.</p>
            )}
            {groups.map(([name, list]) => (
              <div key={name}>
                <p className="sticky top-0 z-[1] border-b border-gray-50 bg-white/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 backdrop-blur">
                  {name} <span className="font-medium text-gray-300">{list.length}</span>
                </p>
                {list.map((o) => {
                  const selected = o.id === currentId
                  return (
                    <button
                      key={o.id || 'read'}
                      type="button"
                      onClick={() => choose(o)}
                      className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                        selected ? 'bg-emerald-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <KindChip kind={o.kind} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-900">{o.label}</span>
                        <span className="block truncate font-mono text-[10px] text-gray-400">{o.detail}</span>
                      </span>
                      {o.usage > 0 && (
                        <span className="shrink-0 pt-0.5 text-[10px] text-gray-400">
                          {o.usage} {o.usage === 1 ? 'company' : 'companies'}
                        </span>
                      )}
                      {selected && <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
