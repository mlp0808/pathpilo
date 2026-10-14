import { LOCALE_TAG, todayYmd, type OfferRecord } from './offers'

/** Same threshold as api-server/routes/notifications.js. */
export const STALE_DAYS = 7

export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost'

export type Lead = {
  id: number
  status: LeadStatus
  source: string
  first_name: string | null
  last_name: string | null
  country: string | null
  address: string | null
  zip_code: string | null
  city: string | null
  email: string | null
  phone: string | null
  message: string | null
  preferred_date: string | null
  preferred_time: string | null
  notes: string | null
  meta: { answers?: Array<{ label: string; value: string; type?: string }> } | null
  client_id: number | null
  converted_at: string | null
  created_at: string
  updated_at?: string | null
}

export type Stage = 'lead' | 'offer' | 'booking'
export type Bucket = 'needs' | 'waiting' | 'done' | 'archived'

export type Reason =
  | 'lead.new'
  | 'lead.client'
  | 'lead.stale'
  | 'lead.contacted'
  | 'lead.won'
  | 'offer.draft'
  | 'offer.declined'
  | 'offer.expired'
  | 'offer.stale'
  | 'offer.viewed'
  | 'offer.sent'
  | 'booking.confirm'
  | 'booking.schedule'
  | 'booking.done'
  | 'archived'

type Base = { key: string; stage: Stage; bucket: Bucket; reason: Reason; at: string; name: string }
export type PipelineItem =
  | (Base & { kind: 'lead'; lead: Lead })
  | (Base & { kind: 'offer'; offer: OfferRecord; lead: Lead | null })

/** Lower = more urgent. */
const PRIORITY: Record<Reason, number> = {
  'booking.confirm': 0,
  'booking.schedule': 1,
  'lead.new': 2,
  'offer.declined': 3,
  'offer.expired': 4,
  'lead.client': 5,
  'offer.draft': 6,
  'offer.stale': 7,
  'lead.stale': 8,
  'offer.viewed': 20,
  'offer.sent': 21,
  'lead.contacted': 22,
  'booking.done': 40,
  'lead.won': 41,
  archived: 60,
}

function olderThan(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() > days * 86400000
}

export function leadName(l: Pick<Lead, 'first_name' | 'last_name' | 'email' | 'phone'>): string {
  return `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.email || l.phone || ''
}

export function offerName(o: OfferRecord): string {
  return o.recipient_name || o.contact_name || ''
}

export function isExpired(o: Pick<OfferRecord, 'valid_until'>): boolean {
  return !!o.valid_until && String(o.valid_until).slice(0, 10) < todayYmd()
}

export function jobGone(o: OfferRecord): boolean {
  return !o.created_job_id || !o.job_status || o.job_status === 'deleted' || o.job_status === 'cancelled'
}

function classifyOffer(o: OfferRecord): Pick<Base, 'stage' | 'bucket' | 'reason' | 'at'> {
  const at = o.updated_at || o.created_at || ''
  if (o.archived_at || o.status === 'revoked') return { stage: 'offer', bucket: 'archived', reason: 'archived', at: o.archived_at || at }
  if (o.status === 'accepted') {
    if (o.confirmed_at) return { stage: 'booking', bucket: 'done', reason: 'booking.done', at: o.confirmed_at }
    return {
      stage: 'booking',
      bucket: 'needs',
      reason: jobGone(o) ? 'booking.schedule' : 'booking.confirm',
      at: o.accepted_at || at,
    }
  }
  if (o.status === 'declined') return { stage: 'offer', bucket: 'needs', reason: 'offer.declined', at: o.declined_at || at }
  if (o.status === 'draft') return { stage: 'offer', bucket: 'needs', reason: 'offer.draft', at: o.created_at || at }
  const sentAt = o.sent_at || o.created_at || ''
  if (isExpired(o)) return { stage: 'offer', bucket: 'needs', reason: 'offer.expired', at: sentAt }
  if (olderThan(sentAt, STALE_DAYS)) return { stage: 'offer', bucket: 'needs', reason: 'offer.stale', at: sentAt }
  return { stage: 'offer', bucket: 'waiting', reason: o.viewed_at ? 'offer.viewed' : 'offer.sent', at: o.viewed_at || sentAt }
}

function classifyLead(l: Lead): Pick<Base, 'stage' | 'bucket' | 'reason' | 'at'> {
  const at = l.updated_at || l.created_at
  if (l.status === 'lost') return { stage: 'lead', bucket: 'archived', reason: 'archived', at }
  if (l.status === 'won') return { stage: 'lead', bucket: 'done', reason: 'lead.won', at }
  if (l.client_id) return { stage: 'lead', bucket: 'needs', reason: 'lead.client', at }
  if (l.status === 'new') return { stage: 'lead', bucket: 'needs', reason: 'lead.new', at: l.created_at }
  if (olderThan(at, STALE_DAYS)) return { stage: 'lead', bucket: 'needs', reason: 'lead.stale', at }
  return { stage: 'lead', bucket: 'waiting', reason: 'lead.contacted', at }
}

/**
 * One row per thing the admin tracks. A lead with a live offer is represented
 * by that offer, so the journey reads as one line instead of two.
 */
export function buildPipeline(leads: Lead[], offers: OfferRecord[]): PipelineItem[] {
  const leadById = new Map(leads.map(l => [l.id, l]))
  const coveredLeads = new Set<number>()
  const items: PipelineItem[] = []

  for (const o of offers) {
    const lead = o.lead_id ? leadById.get(o.lead_id) || null : null
    if (o.lead_id && o.status !== 'revoked') coveredLeads.add(o.lead_id)
    items.push({ kind: 'offer', key: `offer-${o.id}`, offer: o, lead, name: offerName(o), ...classifyOffer(o) })
  }
  for (const l of leads) {
    if (coveredLeads.has(l.id)) continue
    items.push({ kind: 'lead', key: `lead-${l.id}`, lead: l, name: leadName(l), ...classifyLead(l) })
  }

  return items.sort((a, b) => {
    const p = PRIORITY[a.reason] - PRIORITY[b.reason]
    if (p !== 0) return p
    return String(b.at).localeCompare(String(a.at))
  })
}

export type StageCounts = Record<Stage, { needs: number; waiting: number }>

export function countByStage(items: PipelineItem[]): StageCounts {
  const out: StageCounts = {
    lead: { needs: 0, waiting: 0 },
    offer: { needs: 0, waiting: 0 },
    booking: { needs: 0, waiting: 0 },
  }
  for (const it of items) {
    if (it.bucket === 'needs') out[it.stage].needs++
    else if (it.bucket === 'waiting') out[it.stage].waiting++
  }
  return out
}

/** "3h ago" / "for 3 timer siden" in the reader's language. */
export function ago(iso: string | null | undefined, locale: string): string {
  if (!iso) return ''
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const fmt = new Intl.RelativeTimeFormat(LOCALE_TAG[locale] || 'en-GB', { numeric: 'auto', style: 'short' })
  const abs = Math.abs(diff)
  if (abs < 60) return fmt.format(0, 'second')
  if (abs < 3600) return fmt.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return fmt.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return fmt.format(Math.round(diff / 86400), 'day')
  return new Date(iso).toLocaleDateString(LOCALE_TAG[locale] || 'en-GB', { day: 'numeric', month: 'short' })
}

export function fill(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

export function pipelineHref(slug: string, ref: { kind: 'lead' | 'offer'; id: number }): string {
  return `${slug ? `/${slug}` : ''}/pipeline?${ref.kind}=${ref.id}`
}
