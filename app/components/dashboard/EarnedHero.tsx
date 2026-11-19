'use client'

import { BanknotesIcon, CalendarDaysIcon, DocumentPlusIcon, DocumentTextIcon, PlusIcon } from '@heroicons/react/24/outline'
import { BigNumber, Card, CardFooter, CardHeader, ChartLegend, Delta, GhostChart, TextAction, plural } from '../insights/ui'
import { EarnedChart, earnedLegend } from '../insights/charts'
import type { BucketUnit, Period } from '../insights/period'
import type { EarnedBlock } from '../insights/useInsights'

/** The one money number we stand behind: the value of completed work. */
export default function EarnedHero({
  earned,
  unit,
  period,
  base,
  money,
  hasJobs,
  onNewJob,
  className = '',
}: {
  earned: EarnedBlock
  unit: BucketUnit
  period: Period
  base: string
  money: (n: number) => string
  hasJobs: boolean
  onNewJob: () => void
  className?: string
}) {
  const empty = earned.total === 0 && !earned.series.some((p) => p.lastYear > 0)

  return (
    <Card href={`${base}/insights/earnings`} label="Open earnings" className={`flex flex-col ${className}`}>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <CardHeader
          icon={BanknotesIcon}
          tone="green"
          title="Earned"
          subtitle={`Completed work · ${period.short}`}
          linked
          right={<Delta current={earned.total} previous={earned.lastYearTotal} />}
        />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <BigNumber muted={empty}>{money(earned.total)}</BigNumber>
            {earned.jobs > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                From {plural(earned.jobs, 'job')} · {money(earned.averageJob)} on average
              </p>
            )}
          </div>
          {!empty && <ChartLegend items={earnedLegend(earned.series)} />}
        </div>
      </div>

      <div className="mt-4 h-52 px-3 sm:h-60 sm:px-4">
        {empty ? (
          <GhostChart
            message={
              hasJobs
                ? `Nothing completed in ${period.label} yet. Every job you mark as done adds to this number.`
                : 'Every job you complete adds to this number, month by month.'
            }
            action={
              hasJobs ? (
                <TextAction primary icon={CalendarDaysIcon} href={`${base}/jobs`}>
                  Open schedule
                </TextAction>
              ) : (
                <TextAction primary icon={PlusIcon} onClick={onNewJob}>
                  Book your first job
                </TextAction>
              )
            }
          />
        ) : (
          <EarnedChart series={earned.series} unit={unit} money={money} />
        )}
      </div>

      <CardFooter>
        <TextAction primary icon={DocumentPlusIcon} href={`${base}/invoices/new`}>
          New invoice
        </TextAction>
        <TextAction icon={DocumentTextIcon} href={`${base}/invoices`}>
          Invoices
        </TextAction>
        <span className="ml-auto hidden text-[11px] text-gray-400 sm:inline">Counted when a job is done, invoiced or not</span>
      </CardFooter>
    </Card>
  )
}
