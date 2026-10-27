export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'revoked'

export type OfferItem = {
  service_id?: number | null
  title: string
  unit_price: number
  quantity: number
  duration_minutes?: number | null
}

export type OfferDate = {
  date: string
  user_id?: number | null
  user_name?: string | null
  extra_minutes?: number | null
}

export type OfferRecord = {
  id: number
  token: string
  number: string
  status: OfferStatus
  title: string | null
  message: string | null
  client_id: number | null
  client_name?: string | null
  client_last_name?: string | null
  client_email?: string | null
  client_phone?: string | null
  recipient_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  zip_code: string | null
  city: string | null
  state?: string | null
  client_state?: string | null
  lat?: number | null
  lng?: number | null
  total: number
  tax_rate?: number | string | null
  valid_until?: string | null
  items?: OfferItem[] | string
  proposed_dates?: OfferDate[] | string
  accepted_date?: string | null
  accepted_at?: string | null
  viewed_at?: string | null
  created_job_id?: number | null
  public_url?: string
  created_at?: string
  sent_at?: string | null
  updated_at?: string | null
  lead_id?: number | null
  declined_at?: string | null
  decline_reason?: string | null
  confirmed_at?: string | null
  archived_at?: string | null
  job_date?: string | null
  job_booking_status?: string | null
  job_status?: string | null
  job_user_name?: string | null
  lead_created_at?: string | null
  lead_source?: string | null
}

export type OfferDocumentData = {
  number: string
  status: OfferStatus
  title: string
  message: string
  createdAt: string
  sentAt: string | null
  viewedAt: string | null
  validUntil: string | null
  acceptedAt: string | null
  acceptedDate: string | null
  confirmedAt?: string | null
  declinedAt?: string | null
  locale: string
  countryCode: string
  /** Number formatting of the company country (e.g. da-DK, en-US). */
  moneyLocale?: string
  /** Document language written the country's way (e.g. en-US vs en-GB dates). */
  dateLocale?: string
  currency: string
  taxLabel: string
  taxRate: number
  subtotal: number
  taxAmount: number
  total: number
  durationMinutes: number
  company: {
    name: string
    address: string
    zipCity: string
    cvr: string
    cvrLabel: string
    vatNumber: string
    email: string
    phone: string
    website: string
    logoUrl: string
  }
  client: { name: string; address: string; email: string; phone: string }
  items: { title: string; quantity: number; unitPrice: number; lineTotal: number; durationMinutes: number | null }[]
  days: { date: string }[]
}

export type OfferPrefill = {
  clientId?: number | null
  clientName?: string | null
  /** Offer answers this lead; a new client is prefilled from it. */
  leadId?: number | null
  firstName?: string | null
  lastName?: string | null
  message?: string | null
  email?: string | null
  phone?: string | null
  address?: string
  zip_code?: string
  city?: string
  lat?: number | null
  lng?: number | null
}

export function parseOfferList<T>(value: T[] | string | null | undefined): T[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function offerPublicHref(offer: Pick<OfferRecord, 'token' | 'public_url'>): string {
  if (typeof window !== 'undefined') return `${window.location.origin}/o/${offer.token}`
  return offer.public_url || `/o/${offer.token}`
}

export function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayYmd(): string {
  return ymdLocal(new Date())
}

export function parseYmd(ymd: string): Date {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDaysYmd(ymd: string, days: number): string {
  const dt = parseYmd(ymd)
  dt.setDate(dt.getDate() + days)
  return ymdLocal(dt)
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  let guard = 0
  while (cur <= to && guard < 62) {
    out.push(cur)
    cur = addDaysYmd(cur, 1)
    guard++
  }
  return out
}

/** Monday-start week containing `ymd`. */
export function weekRange(ymd: string, offsetWeeks = 0): { from: string; to: string } {
  const d = parseYmd(ymd)
  const dow = (d.getDay() + 6) % 7
  const monday = addDaysYmd(ymd, -dow + offsetWeeks * 7)
  return { from: monday, to: addDaysYmd(monday, 6) }
}

export const LOCALE_TAG: Record<string, string> = { en: 'en-GB', da: 'da-DK' }

export function formatDay(ymd: string, locale?: string, opts?: Intl.DateTimeFormatOptions): string {
  return parseYmd(ymd).toLocaleDateString(locale ? LOCALE_TAG[locale] || locale : undefined, opts || {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatDocDate(value: string | null | undefined, locale?: string): string {
  if (!value) return '—'
  const s = String(value)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && s.length <= 10 ? parseYmd(s) : new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(LOCALE_TAG[locale || 'en'] || locale || 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** `locale` may be a document language ("en", "da") or a full tag ("en-US"). */
export function formatDocMoney(amount: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(LOCALE_TAG[locale || 'en'] || locale || 'en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0)
  } catch {
    return `${(Number(amount) || 0).toFixed(2)} ${currency}`
  }
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const LABELS = {
  en: {
    offer: 'Offer',
    date: 'Date',
    validUntil: 'Valid until',
    forever: 'No expiry',
    description: 'Description',
    amount: 'Amount',
    subtotal: 'Subtotal',
    total: 'Total',
    pickDay: 'Pick a day that suits you',
    accept: 'Accept offer',
    acceptOn: 'Accept for',
    accepted: 'Offer accepted',
    bookedFor: 'Booked for',
    thanks: 'Thank you — we look forward to seeing you.',
    expired: 'This offer has expired',
    questions: 'Questions? Contact',
    notFound: 'Offer not available',
    notFoundBody: 'This link may be invalid or the offer was withdrawn.',
    estTime: 'Estimated time',
    requested: 'Request sent',
    requestedBody: 'will confirm your booking shortly.',
    requestedFor: 'Requested for',
    confirmed: 'Booking confirmed',
    decline: 'No thanks',
    declineTitle: 'Decline this offer?',
    declineReason: 'Anything we should know? (optional)',
    declineConfirm: 'Decline offer',
    cancel: 'Cancel',
    declined: 'Offer declined',
    declinedBody: 'Thanks for letting us know.',
  },
  da: {
    offer: 'Tilbud',
    date: 'Dato',
    validUntil: 'Gyldigt til',
    forever: 'Uden udløb',
    description: 'Beskrivelse',
    amount: 'Beløb',
    subtotal: 'Subtotal',
    total: 'Total',
    pickDay: 'Vælg den dag, der passer dig',
    accept: 'Accepter tilbud',
    acceptOn: 'Accepter til',
    accepted: 'Tilbud accepteret',
    bookedFor: 'Booket til',
    thanks: 'Tak — vi glæder os til at se dig.',
    expired: 'Dette tilbud er udløbet',
    questions: 'Spørgsmål? Kontakt',
    notFound: 'Tilbuddet er ikke tilgængeligt',
    notFoundBody: 'Linket er måske ugyldigt, eller tilbuddet er trukket tilbage.',
    estTime: 'Anslået tid',
    requested: 'Forespørgsel sendt',
    requestedBody: 'bekræfter din booking snarest.',
    requestedFor: 'Ønsket dato',
    confirmed: 'Booking bekræftet',
    decline: 'Nej tak',
    declineTitle: 'Afvis tilbuddet?',
    declineReason: 'Noget vi bør vide? (valgfrit)',
    declineConfirm: 'Afvis tilbud',
    cancel: 'Annuller',
    declined: 'Tilbud afvist',
    declinedBody: 'Tak fordi du gav besked.',
  },
} as const

export type OfferLabelKey = keyof typeof LABELS.en

export function offerLabel(locale: string | undefined, key: OfferLabelKey): string {
  const table = (LABELS as Record<string, Record<OfferLabelKey, string>>)[locale || 'en'] || LABELS.en
  return table[key]
}
