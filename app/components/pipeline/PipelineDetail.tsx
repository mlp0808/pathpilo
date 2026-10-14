'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArchiveBoxIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  EyeIcon,
  MapPinIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  PhoneIcon,
  SparklesIcon,
  TrashIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import { useAppI18n } from '../I18nProvider'
import { formatMoney } from '../../config/countryRules'
import { formatDay, parseOfferList, offerPublicHref, type OfferDate, type OfferItem, type OfferRecord } from '../../lib/offers'
import { ago, fill, leadName, STALE_DAYS, type Lead, type PipelineItem } from '../../lib/pipeline'
import JourneyStepper from './JourneyStepper'

export type PipelineActions = {
  createOfferFromLead: (lead: Lead) => void
  bookLeadDirectly: (lead: Lead) => void
  markContacted: (lead: Lead) => void
  saveLeadNote: (lead: Lead, notes: string) => Promise<void>
  archiveLead: (lead: Lead) => void
  restoreLead: (lead: Lead) => void
  deleteLead: (lead: Lead) => void
  editOffer: (offer: OfferRecord) => void
  sendOffer: (offer: OfferRecord, to?: string) => void
  extendOffer: (offer: OfferRecord) => void
  archiveOffer: (offer: OfferRecord) => void
  restoreOffer: (offer: OfferRecord) => void
  withdrawOffer: (offer: OfferRecord) => void
  confirmBooking: (offer: OfferRecord) => void
  scheduleOffer: (offer: OfferRecord) => void
}

type Action = {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick?: () => void
  href?: string
  external?: boolean
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map(p => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

function ActionButton({ a, primary, busy }: { a: Action; primary?: boolean; busy?: boolean }) {
  const cls = primary
    ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600 disabled:opacity-60'
    : 'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50'
  const Icon = a.icon
  const content = (
    <>
      {busy && primary ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {a.label}
    </>
  )
  if (a.href) {
    return a.external ? (
      <a href={a.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {content}
      </a>
    ) : (
      <Link href={a.href} className={cls}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={a.onClick} disabled={busy} className={cls}>
      {content}
    </button>
  )
}

function Menu({ items }: { items: Array<Action & { danger?: boolean }> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  if (items.length === 0) return null
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        aria-label="More"
      >
        <EllipsisHorizontalIcon className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {items.map(it => {
            const Icon = it.icon
            const cls = `flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
              it.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-gray-700 hover:bg-gray-50'
            }`
            return it.href ? (
              <a
                key={it.label}
                href={it.href}
                target={it.external ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={cls}
                onClick={() => setOpen(false)}
              >
                {Icon && <Icon className="h-4 w-4 opacity-70" />}
                {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                type="button"
                className={cls}
                onClick={() => {
                  setOpen(false)
                  it.onClick?.()
                }}
              >
                {Icon && <Icon className="h-4 w-4 opacity-70" />}
                {it.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PipelineDetail({
  item,
  companySlug,
  countryCode,
  actions,
  busy,
  onBack,
}: {
  item: PipelineItem
  companySlug: string
  countryCode: string
  actions: PipelineActions
  busy: boolean
  onBack?: () => void
}) {
  const { t, locale } = useAppI18n()
  const base = companySlug ? `/${companySlug}` : ''
  const money = (n: number) => formatMoney(Number(n) || 0, countryCode)
  const [resendOpen, setResendOpen] = useState(false)

  const lead: Lead | null = item.lead
  const offer = item.kind === 'offer' ? item.offer : null
  const name = item.name || t('app.pipeline.unnamed', 'Unnamed')
  const first = name.split(/\s+/)[0]

  const phone = offer ? offer.contact_phone || offer.client_phone || lead?.phone : lead?.phone
  const email = offer ? offer.contact_email || offer.client_email || lead?.email : lead?.email
  const address = offer
    ? [offer.address, [offer.zip_code, offer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : lead
      ? [lead.address, [lead.zip_code, lead.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : ''
  const clientId = offer?.client_id || lead?.client_id || null

  // ── Next step ──────────────────────────────────────────────────────────
  let nextTitle = ''
  let nextBody: React.ReactNode = null
  let primary: Action | null = null
  let secondary: Action[] = []
  let tone: 'action' | 'waiting' | 'done' | 'archived' = 'action'

  switch (item.reason) {
    case 'lead.new':
    case 'lead.stale':
    case 'lead.contacted': {
      const l = item.kind === 'lead' ? item.lead : null
      if (!l) break
      tone = item.reason === 'lead.contacted' ? 'waiting' : 'action'
      nextTitle =
        item.reason === 'lead.new'
          ? fill(t('app.pipeline.next.answerLead', "Answer {name}'s request"), { name: first })
          : item.reason === 'lead.stale'
            ? fill(t('app.pipeline.next.leadStale', 'No news for {days} days'), { days: STALE_DAYS })
            : fill(t('app.pipeline.next.waitingLead', 'Waiting to hear back from {name}'), { name: first })
      primary = { label: t('app.pipeline.action.createOffer', 'Create offer'), icon: SparklesIcon, onClick: () => actions.createOfferFromLead(l) }
      secondary = [
        { label: t('app.pipeline.action.bookDirectly', 'Book job directly'), icon: BriefcaseIcon, onClick: () => actions.bookLeadDirectly(l) },
      ]
      if (item.reason === 'lead.new') {
        secondary.push({ label: t('app.pipeline.action.markContacted', "I've reached out"), icon: PhoneIcon, onClick: () => actions.markContacted(l) })
      } else {
        secondary.push({ label: t('app.pipeline.action.archive', 'Archive'), icon: ArchiveBoxIcon, onClick: () => actions.archiveLead(l) })
      }
      break
    }
    case 'lead.client': {
      const l = item.kind === 'lead' ? item.lead : null
      if (!l) break
      nextTitle = fill(t('app.pipeline.next.bookClient', 'Book a job for {name}'), { name: first })
      primary = { label: t('app.pipeline.action.createJob', 'Create job'), icon: BriefcaseIcon, onClick: () => actions.bookLeadDirectly(l) }
      secondary = [{ label: t('app.pipeline.action.createOffer', 'Create offer'), icon: SparklesIcon, onClick: () => actions.createOfferFromLead(l) }]
      break
    }
    case 'lead.won': {
      tone = 'done'
      nextTitle = t('app.pipeline.next.booked', 'Booked')
      if (clientId) secondary = [{ label: t('app.pipeline.action.viewClient', 'View client'), icon: UserIcon, href: `${base}/clients/${clientId}` }]
      break
    }
    case 'offer.draft': {
      const o = offer!
      nextTitle = t('app.pipeline.next.sendDraft', 'Finish and send the offer')
      primary = { label: t('app.pipeline.action.reviewSend', 'Review & send'), icon: PaperAirplaneIcon, onClick: () => actions.editOffer(o) }
      secondary = [{ label: t('app.pipeline.action.archive', 'Archive'), icon: ArchiveBoxIcon, onClick: () => actions.archiveOffer(o) }]
      break
    }
    case 'offer.sent':
    case 'offer.viewed': {
      // Waiting state lives on the timeline ("Offer sent · Unopened/Opened").
      // Actions sit on the offer card instead of a big next-step panel.
      tone = 'waiting'
      nextTitle = ''
      break
    }
    case 'offer.stale': {
      const o = offer!
      nextTitle = fill(t('app.pipeline.next.offerStale', 'No reply in {days} days'), { days: STALE_DAYS })
      nextBody = <p className="text-sm text-gray-500">{t('app.pipeline.next.offerStaleHint', 'A nudge usually does it. Or clear it out.')}</p>
      primary = {
        label: t('app.pipeline.action.resend', 'Resend'),
        icon: PaperAirplaneIcon,
        onClick: () => setResendOpen(true),
      }
      secondary = [{ label: t('app.pipeline.action.archive', 'Archive'), icon: ArchiveBoxIcon, onClick: () => actions.archiveOffer(o) }]
      break
    }
    case 'offer.expired': {
      const o = offer!
      nextTitle = t('app.pipeline.next.expired', 'The offer has expired')
      primary = { label: t('app.pipeline.action.extend', 'Extend 14 days'), icon: ClockIcon, onClick: () => actions.extendOffer(o) }
      secondary = [{ label: t('app.pipeline.action.archive', 'Archive'), icon: ArchiveBoxIcon, onClick: () => actions.archiveOffer(o) }]
      break
    }
    case 'offer.declined': {
      const o = offer!
      nextTitle = fill(t('app.pipeline.next.declined', '{name} said no thanks'), { name: first })
      nextBody = o.decline_reason ? (
        <blockquote className="border-l-2 border-gray-200 pl-3 text-sm italic text-gray-600">“{o.decline_reason}”</blockquote>
      ) : null
      primary = { label: t('app.pipeline.action.archive', 'Archive'), icon: ArchiveBoxIcon, onClick: () => actions.archiveOffer(o) }
      secondary = [{ label: t('app.pipeline.action.revise', 'Revise offer'), icon: PencilSquareIcon, onClick: () => actions.editOffer(o) }]
      break
    }
    case 'booking.confirm': {
      // Accepted status + Verify/Change day live on the offer card (no big next-step panel).
      nextTitle = ''
      break
    }
    case 'booking.schedule': {
      const o = offer!
      nextTitle = fill(t('app.pipeline.next.schedule', '{name} accepted — pick a day'), { name: first })
      primary = { label: t('app.pipeline.action.schedule', 'Schedule job'), icon: CalendarDaysIcon, onClick: () => actions.scheduleOffer(o) }
      break
    }
    case 'booking.done': {
      const o = offer!
      tone = 'done'
      nextTitle = o.job_date
        ? fill(t('app.pipeline.next.bookedFor', 'Booked for {date}'), {
            date: formatDay(String(o.job_date).slice(0, 10), locale, { weekday: 'long', day: 'numeric', month: 'long' }),
          })
        : t('app.pipeline.next.booked', 'Booked')
      if (o.created_job_id) {
        secondary = [
          {
            label: t('app.pipeline.action.openSchedule', 'Open in schedule'),
            icon: CalendarDaysIcon,
            href: `${base}/jobs?date=${String(o.job_date || '').slice(0, 10)}&job=${o.created_job_id}`,
          },
        ]
      }
      break
    }
    case 'archived': {
      tone = 'archived'
      nextTitle =
        offer?.status === 'revoked'
          ? t('app.pipeline.next.withdrawn', 'Withdrawn')
          : t('app.pipeline.next.archived', 'Archived')
      secondary = [
        {
          label: t('app.pipeline.action.restore', 'Restore'),
          icon: ArrowUturnLeftIcon,
          onClick: () => (offer ? actions.restoreOffer(offer) : lead && actions.restoreLead(lead)),
        },
      ]
      break
    }
  }

  // ── Overflow menu ──────────────────────────────────────────────────────
  const menu: Array<Action & { danger?: boolean }> = []
  if (offer) {
    menu.push({ label: t('app.pipeline.action.openOffer', 'Open full offer'), icon: ArrowTopRightOnSquareIcon, href: `${base}/offers/${offer.id}` })
    menu.push({ label: t('app.pipeline.action.previewClient', 'View as client'), icon: EyeIcon, href: `/o/${offer.token}?preview=1`, external: true })
    menu.push({
      label: t('app.pipeline.action.copyLink', 'Copy client link'),
      icon: DocumentDuplicateIcon,
      onClick: () => navigator.clipboard?.writeText(offerPublicHref(offer)).catch(() => {}),
    })
    if (item.bucket !== 'archived' && !(offer.status === 'accepted' && !offer.confirmed_at)) {
      menu.push({ label: t('app.pipeline.action.archive', 'Archive'), icon: ArchiveBoxIcon, onClick: () => actions.archiveOffer(offer) })
    }
    if (offer.status !== 'accepted' && offer.status !== 'revoked') {
      menu.push({ label: t('app.pipeline.action.withdraw', 'Withdraw offer'), icon: TrashIcon, danger: true, onClick: () => actions.withdrawOffer(offer) })
    }
  } else if (lead) {
    if (clientId) menu.push({ label: t('app.pipeline.action.viewClient', 'View client'), icon: UserIcon, href: `${base}/clients/${clientId}` })
    if (lead.status !== 'lost') menu.push({ label: t('app.pipeline.action.archive', 'Archive'), icon: ArchiveBoxIcon, onClick: () => actions.archiveLead(lead) })
    menu.push({ label: t('app.pipeline.action.delete', 'Delete'), icon: TrashIcon, danger: true, onClick: () => actions.deleteLead(lead) })
  }

  const sourceLabel = offer
    ? offer.lead_id
      ? t('app.pipeline.source.fromLead', 'From lead form')
      : t('app.pipeline.source.direct', 'Direct offer')
    : lead?.source === 'manual'
      ? t('app.pipeline.source.manual', 'Added by you')
      : t('app.pipeline.source.form', 'Lead form')

  const toneRing =
    tone === 'action'
      ? 'border-gray-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.03),0_8px_24px_-12px_rgba(15,23,42,0.12)]'
      : tone === 'waiting'
        ? 'border-gray-100 bg-gray-50/60'
        : tone === 'done'
          ? 'border-[#d6f5e3] bg-[#f3fcf6]'
          : 'border-gray-100 bg-gray-50/60'

  const showNextStep = !!nextTitle
  const waitingOnClient = item.reason === 'offer.sent' || item.reason === 'offer.viewed'
  const pendingVerify = item.reason === 'booking.confirm'
  const scheduleHref =
    offer?.created_job_id
      ? `${base}/jobs?date=${String(offer.job_date || '').slice(0, 10)}&job=${offer.created_job_id}`
      : null

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-start gap-3 px-5 pb-4 pt-5 sm:px-8">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 mt-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 lg:hidden"
            aria-label={t('app.pipeline.back', 'Back')}
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        )}
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight text-gray-900">{name}</h2>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {offer ? (
              <>
                #{offer.number} · {money(offer.total)} · {sourceLabel}
              </>
            ) : (
              <>
                {sourceLabel} · {ago(lead?.created_at, locale)}
              </>
            )}
          </p>
        </div>
        <Menu items={menu} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 sm:px-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="rounded-2xl border border-gray-100 px-2 pb-2 pt-4">
            <JourneyStepper item={item} />
          </div>

          {showNextStep && (
            <section className={`rounded-2xl border p-5 ${toneRing}`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {tone === 'done'
                  ? t('app.pipeline.done', 'Done')
                  : tone === 'archived'
                    ? t('app.pipeline.archivedLabel', 'Archived')
                    : t('app.pipeline.nextStep', 'Next step')}
              </p>
              <h3 className="mt-1 text-base font-semibold text-gray-900">{nextTitle}</h3>
              {nextBody && <div className="mt-3">{nextBody}</div>}
              {(primary || secondary.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {primary && <ActionButton a={primary} primary busy={busy} />}
                  {secondary.map(a => (
                    <ActionButton key={a.label} a={a} />
                  ))}
                </div>
              )}
            </section>
          )}

          {offer && (
            <OfferDocument
              offer={offer}
              countryCode={countryCode}
              phone={phone}
              email={email}
              address={address}
              mapHref={address ? `${base}/map?q=${encodeURIComponent(address)}` : null}
              adminHref={`${base}/offers/${offer.id}`}
              scheduleHref={scheduleHref}
              waiting={waitingOnClient || item.reason === 'offer.stale'}
              pendingVerify={pendingVerify}
              busy={busy}
              onResend={() => setResendOpen(true)}
              onEdit={() => actions.editOffer(offer)}
              onVerify={() => actions.confirmBooking(offer)}
            />
          )}

          {!offer && (phone || email || address) && (
            <div className="flex flex-wrap gap-2">
              {phone && (
                <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  <PhoneIcon className="h-3.5 w-3.5 text-gray-400" />
                  {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  <EnvelopeIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                  <span className="truncate">{email}</span>
                </a>
              )}
              {address && (
                <Link
                  href={`${base}/map?q=${encodeURIComponent(address)}`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                  <span className="truncate">{address}</span>
                </Link>
              )}
            </div>
          )}

          {lead && <LeadRequest lead={lead} onSaveNote={notes => actions.saveLeadNote(lead, notes)} compact={!!offer} />}
          {offer && <OfferActivity offer={offer} />}
        </div>
      </div>

      {offer && resendOpen && (
        <ResendModal
          defaultEmail={email || ''}
          busy={busy}
          onClose={() => setResendOpen(false)}
          onSend={to => {
            setResendOpen(false)
            actions.sendOffer(offer, to)
          }}
        />
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">{children}</h4>
}

/** One card for the offer: contact, lines, total, days, message, and send actions. */
function OfferDocument({
  offer,
  countryCode,
  phone,
  email,
  address,
  mapHref,
  adminHref,
  scheduleHref,
  waiting,
  pendingVerify,
  busy,
  onResend,
  onEdit,
  onVerify,
}: {
  offer: OfferRecord
  countryCode: string
  phone?: string | null
  email?: string | null
  address?: string
  mapHref: string | null
  adminHref: string
  scheduleHref: string | null
  waiting: boolean
  pendingVerify: boolean
  busy: boolean
  onResend: () => void
  onEdit: () => void
  onVerify: () => void
}) {
  const { t, locale } = useAppI18n()
  const items = parseOfferList<OfferItem>(offer.items)
  const days = parseOfferList<OfferDate>(offer.proposed_dates)
  const chosen = offer.accepted_date ? String(offer.accepted_date).slice(0, 10) : null
  const money = (n: number) => formatMoney(Number(n) || 0, countryCode)
  const acceptedWhen = offer.accepted_at
    ? formatDay(String(offer.accepted_at).slice(0, 10), locale, { day: 'numeric', month: 'short' })
    : null
  const jobWhen = offer.job_date
    ? formatDay(String(offer.job_date).slice(0, 10), locale, { weekday: 'short', day: 'numeric', month: 'short' })
    : null

  return (
    <div className="space-y-2.5">
      {pendingVerify && (
        <div className="rounded-xl border border-[#d6f5e3] bg-[#ecfdf3] px-4 py-2.5">
          <p className="text-sm font-semibold text-[#1f7a46]">{t('app.pipeline.acceptedBanner', 'Offer accepted')}</p>
          {(acceptedWhen || jobWhen) && (
            <p className="mt-0.5 text-xs text-[#1f7a46]/80">
              {[
                acceptedWhen ? fill(t('app.pipeline.acceptedOn', 'Accepted {date}'), { date: acceptedWhen }) : null,
                jobWhen ? fill(t('app.pipeline.wantsDay', 'Wants {date}'), { date: jobWhen }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('app.pipeline.theOffer', 'The offer')}</p>
          <h3 className="mt-0.5 truncate text-base font-semibold text-gray-900">
            {offer.title || `#${offer.number}`}
          </h3>
          {(phone || email || address) && (
            <div className="mt-2 flex flex-col gap-1 text-xs text-gray-500">
              {email && (
                <a href={`mailto:${email}`} className="inline-flex max-w-full items-center gap-1.5 hover:text-gray-800">
                  <EnvelopeIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                  <span className="truncate">{email}</span>
                </a>
              )}
              {phone && (
                <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 hover:text-gray-800">
                  <PhoneIcon className="h-3.5 w-3.5 text-gray-400" />
                  {phone}
                </a>
              )}
              {address && (
                mapHref ? (
                  <Link href={mapHref} className="inline-flex max-w-full items-center gap-1.5 hover:text-gray-800">
                    <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                    <span className="truncate">{address}</span>
                  </Link>
                ) : (
                  <span className="inline-flex max-w-full items-center gap-1.5">
                    <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                    <span className="truncate">{address}</span>
                  </span>
                )
              )}
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('app.pipeline.total', 'Total')}</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{money(offer.total)}</p>
          {Number(offer.tax_rate) > 0 && (
            <p className="text-[10px] text-gray-400">{t('app.pipeline.inclTax', 'incl. tax')}</p>
          )}
        </div>
      </div>

      <ul className={`divide-y divide-gray-50 ${items.length === 1 ? 'py-1' : ''}`}>
        {items.map((it, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 px-5 py-3 text-sm">
            <span className="min-w-0 text-gray-800">
              {Number(it.quantity) !== 1 && <span className="text-gray-400">{it.quantity} × </span>}
              {it.title}
            </span>
            <span className="flex-shrink-0 tabular-nums text-gray-500">
              {money((Number(it.unit_price) || 0) * (Number(it.quantity) || 1))}
            </span>
          </li>
        ))}
      </ul>

      {offer.message && (
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('app.pipeline.description', 'Description')}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{offer.message}</p>
        </div>
      )}

      {days.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('app.pipeline.suggestedDays', 'Suggested days')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {days.map(d => {
              const on = chosen === d.date
              return (
                <span
                  key={d.date}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    on ? 'bg-gray-900 text-white' : chosen ? 'bg-gray-50 text-gray-300 line-through' : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  {on && <CheckIcon className="h-3 w-3 text-accent-400" />}
                  {formatDay(d.date, locale)}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {pendingVerify ? (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3">
          <button
            type="button"
            onClick={onVerify}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600 disabled:opacity-60"
          >
            {busy ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckIcon className="h-4 w-4" />}
            {t('app.pipeline.action.confirm', 'Verify job')}
          </button>
          <Link
            href={adminHref}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300"
          >
            <EyeIcon className="h-4 w-4 text-gray-400" />
            {t('app.pipeline.action.viewOffer', 'View offer')}
          </Link>
          {scheduleHref && (
            <Link
              href={scheduleHref}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-white hover:text-gray-800"
            >
              <CalendarDaysIcon className="h-4 w-4" />
              {t('app.pipeline.action.changeDay', 'Change day')}
            </Link>
          )}
        </div>
      ) : (
        (waiting || offer.status === 'draft' || offer.status === 'sent' || offer.status === 'declined') && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3">
            <Link
              href={adminHref}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-white"
            >
              <EyeIcon className="h-4 w-4 text-gray-400" />
              {t('app.pipeline.action.viewOffer', 'View offer')}
            </Link>
            {offer.status !== 'draft' && offer.status !== 'declined' && (
              <button
                type="button"
                onClick={onResend}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 disabled:opacity-60"
              >
                <PaperAirplaneIcon className="h-4 w-4 text-gray-400" />
                {t('app.pipeline.action.resend', 'Resend')}
              </button>
            )}
            {offer.status !== 'accepted' && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-white hover:text-gray-800"
              >
                <PencilSquareIcon className="h-4 w-4" />
                {t('app.pipeline.action.edit', 'Edit')}
              </button>
            )}
          </div>
        )
      )}
      </section>
    </div>
  )
}

function ResendModal({
  defaultEmail,
  busy,
  onClose,
  onSend,
}: {
  defaultEmail: string
  busy: boolean
  onClose: () => void
  onSend: (to: string) => void
}) {
  const { t } = useAppI18n()
  const [to, setTo] = useState(defaultEmail)
  useEffect(() => setTo(defaultEmail), [defaultEmail])
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={t('app.pipeline.resendTitle', 'Resend offer')}
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-900">{t('app.pipeline.resendTitle', 'Resend offer')}</h3>
        <p className="mt-1 text-sm text-gray-500">{t('app.pipeline.resendBody', 'Send the offer link again. You can use a different email if you need to.')}</p>
        <label className="mt-4 block">
          <span className="text-xs font-medium text-gray-500">{t('app.pipeline.field.email', 'Email')}</span>
          <input
            type="email"
            value={to}
            autoFocus
            onChange={e => setTo(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && valid) onSend(to.trim())
            }}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-gray-400"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            {t('app.common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => onSend(to.trim())}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            {busy ? t('app.offers.sending', 'Sending…') : t('app.pipeline.action.resend', 'Resend')}
          </button>
        </div>
      </div>
    </div>
  )
}

function OfferActivity({ offer }: { offer: OfferRecord }) {
  const { t, locale } = useAppI18n()
  const rows: Array<{ label: string; at: string | null | undefined }> = [
    { label: t('app.pipeline.activity.created', 'Created'), at: offer.created_at },
    { label: t('app.pipeline.activity.sent', 'Sent'), at: offer.sent_at },
    { label: t('app.pipeline.activity.viewed', 'Opened by client'), at: offer.viewed_at },
    { label: t('app.pipeline.activity.declined', 'Declined'), at: offer.declined_at },
    { label: t('app.pipeline.activity.accepted', 'Accepted'), at: offer.accepted_at },
    { label: t('app.pipeline.activity.confirmed', 'Verified by you'), at: offer.confirmed_at },
  ].filter(r => !!r.at)
  if (rows.length === 0) return null
  return (
    <section>
      <SectionLabel>{t('app.pipeline.activity.title', 'Activity')}</SectionLabel>
      <ol className="space-y-2">
        {rows.map(r => (
          <li key={r.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-700">{r.label}</span>
            <span className="text-xs text-gray-400" title={new Date(String(r.at)).toLocaleString()}>
              {ago(r.at, locale)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function LeadRequest({ lead, onSaveNote, compact }: { lead: Lead; onSaveNote: (notes: string) => Promise<void>; compact: boolean }) {
  const { t, locale } = useAppI18n()
  const [note, setNote] = useState(lead.notes || '')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setNote(lead.notes || '')
  }, [lead.id, lead.notes])

  const answers = (lead.meta?.answers || []).filter(a => a.value && String(a.value).trim())
  const hasPreferred = lead.preferred_date || lead.preferred_time
  const contactBits = [
    lead.email,
    lead.phone,
    [lead.address, [lead.zip_code, lead.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  ].filter(Boolean)

  const save = async () => {
    if (note === (lead.notes || '')) return
    await onSaveNote(note)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-[#fafaf9]">
      <div className="border-b border-gray-200/80 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          {compact
            ? fill(t('app.pipeline.originalRequest', 'Original request · {ago}'), { ago: ago(lead.created_at, locale) })
            : t('app.pipeline.request', 'Request')}
        </p>
        <p className="mt-1 text-sm font-semibold text-gray-900">{leadName(lead) || t('app.pipeline.unnamed', 'Unnamed')}</p>
        {contactBits.length > 0 && (
          <div className="mt-2 space-y-0.5 text-xs text-gray-500">
            {contactBits.map(bit => (
              <p key={String(bit)} className="truncate">{bit}</p>
            ))}
          </div>
        )}
      </div>

      {(lead.message || hasPreferred || answers.length > 0) && (
        <div className="space-y-4 px-5 py-4">
          {lead.message && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{lead.message}</p>
          )}
          {hasPreferred && (
            <div className="flex flex-wrap gap-1.5">
              {lead.preferred_date && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                  <CalendarDaysIcon className="h-3.5 w-3.5 text-gray-400" />
                  {/^\d{4}-\d{2}-\d{2}/.test(lead.preferred_date) ? formatDay(lead.preferred_date.slice(0, 10), locale) : lead.preferred_date}
                </span>
              )}
              {lead.preferred_time && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                  <ClockIcon className="h-3.5 w-3.5 text-gray-400" />
                  {lead.preferred_time}
                </span>
              )}
            </div>
          )}
          {answers.length > 0 && (
            <dl className="divide-y divide-gray-200/70 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {answers.map((a, i) => (
                <div key={i} className="grid grid-cols-1 gap-0.5 px-3.5 py-2.5 sm:grid-cols-[140px_1fr] sm:gap-3">
                  <dt className="text-xs text-gray-400">{a.label}</dt>
                  <dd className="whitespace-pre-wrap text-sm text-gray-800">{a.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      <div className="relative border-t border-gray-200/80 px-5 py-3">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={save}
          rows={2}
          placeholder={t('app.pipeline.notePlaceholder', 'Add a private note…')}
          className="w-full resize-none rounded-xl border border-transparent bg-transparent px-0 py-1 text-sm text-gray-700 outline-none transition placeholder:text-gray-300 focus:border-gray-200 focus:bg-white focus:px-3"
        />
        {saved && <CheckIcon className="absolute right-6 top-4 h-4 w-4 text-[#1f7a46]" />}
      </div>
    </section>
  )
}
