'use client'

import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { useAppI18n } from '../I18nProvider'
import { formatDay } from '../../lib/offers'
import { fill, type PipelineItem } from '../../lib/pipeline'

type StepState = 'done' | 'current' | 'todo' | 'skipped' | 'failed'
type Step = { label: string; state: StepState; note: string }

function shortDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return ''
  return formatDay(String(iso).slice(0, 10), locale, { day: 'numeric', month: 'short' })
}

export function journeySteps(item: PipelineItem, t: ReturnType<typeof useAppI18n>['t'], locale: string): Step[] {
  const request = t('app.pipeline.step.request', 'Request')
  const offerL = t('app.pipeline.step.offer', 'Offer')
  const offerSent = t('app.pipeline.step.offerSent', 'Offer sent')
  const booked = t('app.pipeline.step.booked', 'Booked')
  const skipped = t('app.pipeline.step.skipped', 'Skipped')

  if (item.kind === 'lead') {
    const l = item.lead
    const won = l.status === 'won'
    return [
      { label: request, state: 'done', note: shortDate(l.created_at, locale) },
      { label: offerL, state: won ? 'skipped' : 'current', note: won ? skipped : '' },
      { label: offerSent, state: won ? 'skipped' : 'todo', note: won ? skipped : '' },
      { label: booked, state: won ? 'done' : 'todo', note: won ? shortDate(l.updated_at, locale) : '' },
    ]
  }

  const o = item.offer
  const hasLead = !!o.lead_id
  const sent = o.status !== 'draft'
  const accepted = o.status === 'accepted'
  const declined = o.status === 'declined'
  const confirmed = accepted && !!o.confirmed_at

  let sentNote = ''
  if (declined) sentNote = t('app.pipeline.step.declined', 'Declined')
  else if (accepted) sentNote = shortDate(o.accepted_at || o.viewed_at, locale)
  else if (o.viewed_at) sentNote = fill(t('app.pipeline.step.openedOn', 'Opened {date}'), { date: shortDate(o.viewed_at, locale) })
  else if (sent) sentNote = t('app.pipeline.step.unopened', 'Unopened')

  return [
    {
      label: request,
      state: hasLead ? 'done' : 'skipped',
      note: hasLead ? shortDate(o.lead_created_at, locale) : t('app.pipeline.step.direct', 'Direct'),
    },
    {
      label: offerL,
      state: sent ? 'done' : 'current',
      note: sent ? shortDate(o.sent_at || o.created_at, locale) : t('app.pipeline.step.draft', 'Draft'),
    },
    {
      label: offerSent,
      state: declined ? 'failed' : accepted ? 'done' : sent ? 'current' : 'todo',
      note: sentNote,
    },
    {
      label: booked,
      state: confirmed ? 'done' : accepted ? 'current' : 'todo',
      note: confirmed
        ? o.job_date
          ? shortDate(o.job_date, locale)
          : shortDate(o.confirmed_at, locale)
        : accepted
          ? t('app.pipeline.step.toConfirm', 'Accepted')
          : '',
    },
  ]
}

export default function JourneyStepper({ item }: { item: PipelineItem }) {
  const { t, locale } = useAppI18n()
  const steps = journeySteps(item, t, locale)
  return (
    <ol className="flex items-start">
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        const lineDone = s.state === 'done' || s.state === 'skipped'
        return (
          <li key={s.label} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {!last && (
              <span
                aria-hidden
                className={`absolute left-1/2 top-3 h-px w-full ${
                  lineDone ? 'bg-gray-300' : 'border-t border-dashed border-gray-200 bg-transparent'
                }`}
              />
            )}
            <span
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                s.state === 'done'
                  ? 'bg-gray-900 text-white'
                  : s.state === 'current'
                    ? 'bg-white text-gray-900 ring-2 ring-accent-500'
                    : s.state === 'failed'
                      ? 'bg-rose-500 text-white'
                      : s.state === 'skipped'
                        ? 'border border-dashed border-gray-300 bg-white text-gray-300'
                        : 'border border-gray-200 bg-white text-gray-300'
              }`}
            >
              {s.state === 'done' ? (
                <CheckIcon className="h-3.5 w-3.5" />
              ) : s.state === 'failed' ? (
                <XMarkIcon className="h-3.5 w-3.5" />
              ) : s.state === 'current' ? (
                <span className="h-2 w-2 rounded-full bg-accent-500" />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={`mt-1.5 text-[11px] font-semibold ${
                s.state === 'todo' || s.state === 'skipped' ? 'text-gray-400' : 'text-gray-900'
              }`}
            >
              {s.label}
            </span>
            <span className="h-4 truncate px-1 text-[10.5px] text-gray-400">{s.note}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Three-dot version for list rows. */
export function JourneyDots({ item }: { item: PipelineItem }) {
  const { t, locale } = useAppI18n()
  const steps = journeySteps(item, t, locale).slice(1)
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {steps.map(s => (
        <span
          key={s.label}
          className={`h-1.5 w-1.5 rounded-full ${
            s.state === 'done'
              ? 'bg-gray-800'
              : s.state === 'current'
                ? 'bg-accent-500'
                : s.state === 'failed'
                  ? 'bg-rose-400'
                  : 'bg-gray-200'
          }`}
        />
      ))}
    </span>
  )
}
