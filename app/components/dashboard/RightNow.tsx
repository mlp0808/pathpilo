'use client'

import Link from 'next/link'
import {
  CalendarDaysIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  DocumentCurrencyDollarIcon,
  InboxArrowDownIcon,
  MapIcon,
  PlusIcon,
  SunIcon,
} from '@heroicons/react/24/outline'
import { AttentionRow, Card, Eyebrow, IconChip, TextAction, plural, type Icon, type Tone } from '../insights/ui'
import { formatDay } from '../insights/period'
import type { Attention, TodayBlock } from '../insights/useInsights'

interface Item {
  key: string
  href: string
  icon: Icon
  tone: Tone
  title: string
  detail: string
  value?: string
}

/** Most urgent first: clients waiting on you, then money, then housekeeping. */
export function attentionItems(a: Attention, base: string, money: (n: number) => string): Item[] {
  const items: Array<Item | null> = [
    a.offersToVerify.count > 0
      ? {
          key: 'verify',
          href: a.offersToVerify.count === 1 ? `${base}/pipeline?offer=${a.offersToVerify.firstId}` : `${base}/pipeline`,
          icon: CheckBadgeIcon,
          tone: 'green',
          title: `${plural(a.offersToVerify.count, 'offer')} accepted`,
          detail: 'Verify to put the work on the calendar',
        }
      : null,
    a.newLeads.count > 0
      ? {
          key: 'leads',
          href: a.newLeads.count === 1 ? `${base}/pipeline?lead=${a.newLeads.firstId}` : `${base}/leads`,
          icon: InboxArrowDownIcon,
          tone: 'sky',
          title: `${plural(a.newLeads.count, 'new request')}`,
          detail: 'Waiting for your reply',
        }
      : null,
    a.overdueInvoices.count > 0
      ? {
          key: 'overdue',
          href:
            a.overdueInvoices.count === 1
              ? `${base}/invoices/${a.overdueInvoices.firstId}`
              : `${base}/invoices?status=overdue,sent`,
          icon: ClockIcon,
          tone: 'rose',
          title: `${plural(a.overdueInvoices.count, 'overdue invoice')}`,
          detail: 'Past the due date — send a reminder',
          value: money(a.overdueInvoices.total),
        }
      : null,
    a.notMarkedDone.jobs > 0
      ? {
          key: 'not-done',
          href: `${base}/insights/jobs#still-open`,
          icon: ClipboardDocumentCheckIcon,
          tone: 'amber',
          title: `${plural(a.notMarkedDone.jobs, 'past job')} not marked done`,
          detail: 'They only count as earned once done',
          value: a.notMarkedDone.total > 0 ? money(a.notMarkedDone.total) : undefined,
        }
      : null,
    a.notInvoiced.total > 0
      ? {
          key: 'not-invoiced',
          href: `${base}/insights/earnings#not-invoiced`,
          icon: DocumentCurrencyDollarIcon,
          tone: 'indigo',
          title: 'Finished work not invoiced',
          detail: `${plural(a.notInvoiced.jobs, 'job')} ready to bill`,
          value: money(a.notInvoiced.total),
        }
      : null,
    a.timeOffRequests.count > 0
      ? {
          key: 'time-off',
          href: `${base}/jobs${a.timeOffRequests.firstDate ? `?date=${a.timeOffRequests.firstDate}` : ''}`,
          icon: SunIcon,
          tone: 'violet',
          title: `${plural(a.timeOffRequests.count, 'time-off request')}`,
          detail: 'Waiting for your approval',
        }
      : null,
    a.quietOffers.count > 0
      ? {
          key: 'quiet-offers',
          href: `${base}/offers`,
          icon: ChatBubbleLeftEllipsisIcon,
          tone: 'gray',
          title: `${plural(a.quietOffers.count, 'offer')} without an answer`,
          detail: 'Sent over a week ago — worth a follow-up',
        }
      : null,
  ]
  return items.filter((i): i is Item => i !== null)
}

const FIRST_RUN_EXAMPLES: Array<{ icon: Icon; tone: Tone; text: string }> = [
  { icon: CheckBadgeIcon, tone: 'green', text: 'A client accepts one of your offers' },
  { icon: ClockIcon, tone: 'rose', text: 'An invoice passes its due date' },
  { icon: ClipboardDocumentCheckIcon, tone: 'amber', text: 'A past job was never marked done' },
]

function Today({
  today,
  base,
  fresh,
  onNewJob,
}: {
  today: TodayBlock
  base: string
  fresh: boolean
  onNewJob: () => void
}) {
  const progress = today.jobs > 0 ? Math.round((today.done / today.jobs) * 100) : 0

  return (
    <div className="p-5">
      <Eyebrow>Today · {formatDay(today.date)}</Eyebrow>

      {today.jobs > 0 ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums text-gray-900">{today.jobs}</span>
            <span className="text-sm text-gray-500">
              {today.jobs === 1 ? 'visit' : 'visits'}
              {today.people > 1 ? ` · ${today.people} people out` : ''}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-accent-500 transition-[width] duration-700"
                style={{ width: `${Math.max(progress, today.done > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-gray-500">
              {today.done} of {today.jobs} done
            </span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-gray-600">
          {fresh ? 'Nothing booked yet.' : 'No visits today.'}
          {today.next && (
            <>
              {' '}
              Next up:{' '}
              <Link
                href={`${base}/jobs?date=${today.next.date}`}
                className="font-semibold text-gray-900 underline-offset-2 hover:underline"
              >
                {formatDay(today.next.date)} · {plural(today.next.jobs, 'visit')}
              </Link>
            </>
          )}
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
        {fresh ? (
          <TextAction primary icon={PlusIcon} onClick={onNewJob}>
            Book a job
          </TextAction>
        ) : (
          <TextAction primary icon={MapIcon} href={`${base}/map?focus=day&date=${today.date}`}>
            Today&apos;s route
          </TextAction>
        )}
        <TextAction icon={CalendarDaysIcon} href={`${base}/jobs`}>
          Schedule
        </TextAction>
      </div>

      {today.jobs > 0 && today.nextWeek > 0 && (
        <p className="mt-3 text-xs text-gray-400">{plural(today.nextWeek, 'more visit')} booked in the next 7 days</p>
      )}
    </div>
  )
}

export default function RightNow({
  today,
  attention,
  base,
  fresh,
  money,
  onNewJob,
  className = '',
}: {
  today: TodayBlock
  attention: Attention
  base: string
  fresh: boolean
  money: (n: number) => string
  onNewJob: () => void
  className?: string
}) {
  const items = attentionItems(attention, base, money)

  return (
    <Card className={`flex flex-col ${className}`}>
      <Today today={today} base={base} fresh={fresh} onNewJob={onNewJob} />

      <div className="flex flex-1 flex-col border-t border-gray-100 px-2 pb-2 pt-4">
        <div className="flex items-center justify-between px-3 pb-1">
          <Eyebrow>Keep an eye on</Eyebrow>
          {items.length > 0 && (
            <span className="rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums">
              {items.length}
            </span>
          )}
        </div>

        {items.length > 0 ? (
          <div className="space-y-0.5">
            {items.map(({ key, ...item }) => (
              <AttentionRow key={key} {...item} />
            ))}
          </div>
        ) : fresh ? (
          <div className="px-3 pb-2">
            <p className="text-xs text-gray-500">Things that need you show up here, for example when:</p>
            <ul className="mt-2.5 space-y-2">
              {FIRST_RUN_EXAMPLES.map((ex) => (
                <li key={ex.text} className="flex items-center gap-2.5 text-[13px] text-gray-600">
                  <IconChip icon={ex.icon} tone={ex.tone} size="sm" />
                  {ex.text}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircleIcon className="h-6 w-6" />
            </span>
            <p className="mt-2 text-sm font-semibold text-gray-900">All caught up</p>
            <p className="mt-0.5 max-w-[240px] text-xs text-gray-500">
              Nothing needs you right now. Accepted offers, overdue invoices and unfinished jobs will show up here.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
